// src/main/resources/static/app.js
(function () {
    'use strict';

    const app = angular.module('busApp', ['ngRoute']);

    // ───────────────── AuthService ─────────────────
    app.factory('AuthService', function ($http, $q) {
        let me = null;
        function loadMe(force) {
            if (!force && me) return $q.resolve(me);
            return $http.get('/api/me').then(
                (res) => (me = res.data),
                () => (me = null)
            );
        }
        function getMe() {
            return me;
        }
        return { loadMe, getMe };
    });

    // 권한 판별
    function isAdminFrom(me) {
        if (!me) return false;
        if (me.isAdmin === true) return true;
        const list = me.authorities || me.roles || [];
        const arr = Array.isArray(list) ? list : [list];
        return arr.some((a) => {
            const v = typeof a === 'string' ? a : a && a.authority;
            return String(v || '').toUpperCase() === 'ROLE_ADMIN';
        });
    }

    // ───────────────── 파일 입력 바인딩 디렉티브 ─────────────────
    // <input type="file" file-model="newPost.file"> 처럼 사용하면
    // 선택한 파일이 $scope.newPost.file 에 자동으로 들어가도록 하는 도우미.
    app.directive('fileModel', function ($parse) {
        return {
            restrict: 'A',
            link: function (scope, element, attrs) {
                var model = $parse(attrs.fileModel);
                element.bind('change', function () {
                    scope.$apply(function () {
                        // FileList 통째로 넘김 (files[0], files.length 등 사용 가능)
                        model.assign(scope, element[0].files);
                    });
                });
            },
        };
    });

    // ───────────────── MenuService ─────────────────
    app.factory('MenuService', function ($http) {
        function fetchAll() {
            return $http.get('/api/menus').then((res) => (Array.isArray(res.data) ? res.data : []));
        }
        function buildTree(rows) {
            const map = new Map();
            rows.forEach((r) => map.set(r.uuid, { ...r, children: [] }));

            const roots = [];
            rows.forEach((r) => {
                if (r.parent_uuid) {
                    const p = map.get(r.parent_uuid);
                    if (p) p.children.push(map.get(r.uuid));
                } else roots.push(map.get(r.uuid));
            });

            function sortChildren(n) {
                n.children.sort((a, b) => (a.priority || 0) - (b.priority || 0));
                n.children.forEach(sortChildren);
            }
            roots.sort((a, b) => (a.priority || 0) - (b.priority || 0));
            roots.forEach(sortChildren);
            return roots;
        }
        // ← 안전가드 추가: 메뉴 API 실패해도 앱이 깨지지 않게
        return {
            loadTree: () =>
                fetchAll()
                    .then(buildTree)
                    .catch(() => []),
        };
    });

    // ───────────────── Routing ─────────────────
    app.config(function ($routeProvider, $locationProvider) {
        $locationProvider.hashPrefix('');

        $routeProvider
            // ✅ 대메뉴 리다이렉트: 게시판/관리 → 첫 소메뉴
            .when('/board', { redirectTo: '/board/bus' })
            .when('/admin', { redirectTo: '/db-users' }) // 🔧 변경: /roles → /db-users

            .when('/users', {
                template: '<div></div>',
            })
            .when('/users/new', {
                templateUrl: '/users-new.html',
                controller: 'UsersNewCtrl',
            })
            .when('/board/bus', {
                templateUrl: '/tpl/board/bus.html', // ← 여기! '/tpl/%20board/bus.html' 아니고 이게 정답
                controller: 'BoardBusCtrl',
            })
            // 게시판 (일반)
            .when('/board/normal', {
                templateUrl: '/tpl/board/normal.html', // ← 여기! '/tpl/%20board/normal.html' 아님
                controller: 'BoardNormalCtrl',
            })
            // ✅ 대용량 게시판 (BIG)
            .when('/board/big', {
                templateUrl: '/tpl/board/big.html',
                controller: 'BoardBigCtrl',
            })
            // ★★★ 게시글 '수정 전용' 화면 (분리 페이지)
            // 예) #/board/bus/edit/num/42 또는 #/board/bus/edit/str/550e8400-...
            .when('/board/:code/edit/:type/:key', {
                templateUrl: '/tpl/board/edit.html',
                controller: 'BoardEditCtrl',
            })
            // ★★★ 게시글 '상세 보기' 화면 (제목 클릭 시 열리는 화면)
            // 예) #/board/bus/view/550e8400-... (?type=str|num)
            .when('/board/:code/view/:key', {
                templateUrl: '/tpl/board/post-view.html',
                controller: 'BoardViewCtrl', // ★ 추가
            })
            // 권한 관리 (현재 파일 위치가 static/roles.html 이므로 그대로)
            .when('/roles', {
                templateUrl: '/roles.html',
                controller: 'RolesCtrl',
            })
            .when('/db-users', {
                templateUrl: '/db-users.html',
                controller: 'DbUsersCtrl',
            })
            .otherwise({
                redirectTo: '/users',
            });
    });

    // '#!/' 진입 호환 + ★ 전역 클릭 위임(해시 없는 링크를 해시 라우팅으로 변환)
    app.run(function ($window, $document) {
        if ($window.location.hash.indexOf('#!/') === 0) {
            $window.location.replace('#/' + $window.location.hash.slice(3));
        }

        // ★ 해시(#)가 없는 내부 링크를 자동으로 '#/...'로 변환
        // 예) <a href="/board"> → '#/board' 로 라우팅
        $document.on('click', function (evt) {
            try {
                let el = evt.target;
                // a 태그까지 위로 탐색
                while (el && el !== document && el.tagName !== 'A') el = el.parentNode;
                if (!el || el.tagName !== 'A') return;

                const href = el.getAttribute('href') || '';
                // 외부 링크/빈 링크/해시 링크는 무시
                if (!href || href.indexOf('http') === 0 || href.indexOf('#') === 0) return;

                // 내부 라우트 패턴만 처리
                // (변경점) board 하위의 모든 경로 허용: edit/view 등 세부 경로까지 SPA 내비게이션으로 처리
                const internal = /^\/(users(\/new)?|board(\/.*)?|admin|roles|db-users)$/.test(href);
                if (!internal) return;

                // ★★★ 관리자 전용 경로 가드(전역) — 메뉴는 보이되, 비관리자 클릭 시 차단
                const adminPaths = new Set(['/admin', '/roles', '/db-users']);
                if (adminPaths.has(href) && !($window.__IS_ADMIN__ === true)) {
                    evt.preventDefault();
                    alert('관리자 전용 페이지입니다.');
                    return; // 라우팅 차단
                }

                evt.preventDefault();
                // /board, /admin 은 라우팅 후 리다이렉트 규칙으로 첫 소메뉴로 이동됨
                $window.location.hash = '#' + href;
            } catch (_) {
                /* noop */
            }
        });
    });

    // ───────────────── Root (탭/메뉴 제어) ─────────────────
    app.controller('RootCtrl', function ($scope, $location, $document, $timeout, AuthService, MenuService) {
        $scope.me = null;
        $scope.menus = [];
        $scope.location = $location;
        $scope.isAdmin = false; // ✅ 상단 네비에서 ng-if="isAdmin" 사용할 수 있게 공개

        function ensureDefaultUsersTab() {
            if ($location.path() === '/users' && !$location.search().tab) {
                $location.search('tab', 'home');
            }
        }

        function syncTabs() {
            ensureDefaultUsersTab();
            const path = $location.path();
            const tab = $location.search().tab;
            $scope.showWelcome = path === '/users' && (!tab || tab === 'home');
            $scope.showBusTab = path === '/users' && tab === 'bus';
        }
        syncTabs();

        $scope.goHome = function () {
            if ($location.path() !== '/users') $location.path('/users');
            $location.search('tab', 'home');
            syncTabs();
        };
        $scope.goBusTab = function () {
            if ($location.path() !== '/users') $location.path('/users');
            $location.search('tab', 'bus');
            syncTabs();
        };

        $scope.$on('$locationChangeSuccess', syncTabs);

        $scope.$on('$routeChangeSuccess', function () {
            ensureDefaultUsersTab();
            if ($location.path() !== '/users' && $location.search().tab) {
                $location.search('tab', null);
            }
            syncTabs();
            closeAllMenus();
        });

        $scope.isListView = function () {
            const p = $location.path();
            return p === '/users' || p === '' || p === '/';
        };

        AuthService.loadMe().finally(() => {
            $scope.me = AuthService.getMe();
            $scope.isAdmin = isAdminFrom($scope.me); // ✅ 여기서 관리자 여부 계산
            window.__IS_ADMIN__ = $scope.isAdmin; // ✅ 추가: 전역 가드(app.run)에서 참조하도록 반영
        });

        function decorateMenuNode(n) {
            n._open = false;
            n._hover = false;
            n._closing = null;
            (n.children || []).forEach(decorateMenuNode);
        }

        function closeAllMenus() {
            function dfs(arr) {
                (arr || []).forEach((m) => {
                    m._open = false;
                    if (m._closing) {
                        $timeout.cancel(m._closing);
                        m._closing = null;
                    }
                    dfs(m.children);
                });
            }
            dfs($scope.menus);
        }

        $scope.onMenuEnter = function (m) {
            if (!m) return;
            m._hover = true;
            if (m._closing) {
                $timeout.cancel(m._closing);
                m._closing = null;
            }
            m._open = true;
        };
        $scope.onMenuLeave = function (m) {
            if (!m) return;
            m._hover = false;
            m._closing = $timeout(function () {
                if (!m._hover) m._open = false;
            }, 120);
        };
        $scope.onMenuClick = function (m, $event) {
            if ($event) $event.preventDefault();
            if (!m) return;
            m._open = !m._open;
        };

        // ✅ 대메뉴 → 첫 소메뉴 매핑
        const firstChildMap = {
            '/board': '/board/bus',
            board: '/board/bus',
            '/admin': '/db-users', // 🔧 변경: 관리 기본은 DB 사용자 관리
            admin: '/db-users', // 🔧 변경
        };

        // ★★★ 현재 관리자 여부 즉시 확인 헬퍼
        function isAdminNow() {
            return $scope.isAdmin || isAdminFrom($scope.me);
        }

        // ✅ 메뉴에서 호출하는 강제 라우팅 함수
        $scope.navTo = function (url, $event) {
            try {
                if ($event) {
                    $event.preventDefault();
                    $event.stopPropagation();
                }
                if (!url) return;

                // '#/roles?x=1' → path '/roles', query {x:'1'}
                // 'roles', '/roles', '#/roles', 'http://...#/roles' 모두 방어
                const hashPos = url.indexOf('#/');
                if (hashPos >= 0) url = url.slice(hashPos + 1);
                if (url.indexOf('#') === 0) url = url.slice(1);

                // 절대경로 보정
                if (url.indexOf('/') !== 0) url = '/' + url;

                // ✅ 대메뉴 키를 첫 소메뉴로 치환
                if (firstChildMap[url]) url = firstChildMap[url];

                // ★★★ 관리자 전용 경로 가드(메뉴/강제 네비 모두)
                const adminPaths = new Set(['/admin', '/roles', '/db-users']);
                if (adminPaths.has(url) && !isAdminNow()) {
                    alert('관리자 전용 페이지입니다.');
                    return; // 라우팅 차단
                }

                // 쿼리 분리
                const qIdx = url.indexOf('?');
                const path = qIdx >= 0 ? url.slice(0, qIdx) : url;
                const query = qIdx >= 0 ? url.slice(qIdx + 1) : '';

                // 라우팅
                if ($location.path() !== path) $location.path(path);

                if (query) {
                    const params = {};
                    query.split('&').forEach((kv) => {
                        if (!kv) return;
                        const parts = kv.split('=');
                        const k = parts[0];
                        const v = parts[1];
                        params[decodeURIComponent(k || '')] = decodeURIComponent(v || '');
                    });
                    $location.search(params);
                } else {
                    $location.search({});
                }
            } finally {
                closeAllMenus();
            }
        };

        const docClickHandler = function () {
            $scope.$applyAsync(() => closeAllMenus());
        };
        $document.on('click', docClickHandler);

        $scope.$on('$destroy', function () {
            $document.off('click', docClickHandler);
        });

        MenuService.loadTree()
            .then((tree) => {
                (tree || []).forEach(decorateMenuNode);
                $scope.menus = tree || [];
            })
            .catch(() => {
                $scope.menus = [];
            });
    });

    // ───────────────── 공통 유틸 ─────────────────
    function setTimed($scope, typeKey, msgKey, type, msg, ms, $timeout) {
        $scope[typeKey] = type;
        $scope[msgKey] = msg;
        if (ms) $timeout(() => ($scope[msgKey] = ''), ms);
    }

    function roleToLabel(role) {
        return String(role || '')
            .toUpperCase()
            .includes('ADMIN')
            ? '관리자'
            : '사용자';
    }

    function roleToClass(role) {
        return String(role || '')
            .toUpperCase()
            .includes('ADMIN')
            ? 'badge-admin'
            : 'badge-user';
    }

    // ✅ 안전한 정수 변환(페이지/페이지크기 보호)
    function toInt(v, fallback) {
        var n = parseInt(v, 10);
        // 정상적인 양의 정수면 그대로 사용
        if (isFinite(n) && n > 0) return n;
        // fallback이 숫자로 명시돼 있으면 그 값을 그대로 사용 (0도 허용!)
        if (typeof fallback === 'number') return fallback;
        // 둘 다 아니면 기본값 10
        return 10;
    }

    // ✅ 응답 정규화 유틸
    function normalizeList(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.rows)) return data.rows;
        if (Array.isArray(data.content)) return data.content;
        if (Array.isArray(data.list)) return data.list;
        if (data.page && Array.isArray(data.page.content)) return data.page.content;
        return [];
    }

    // ───────────────── Bus + Users (홈 탭) ─────────────────
    app.controller('BusController', function ($scope, $http, $timeout, $location, $q) {
        $scope.items = [];
        $scope.filteredItems = [];
        $scope.keyword = '';
        $scope.statusMessage = '';
        $scope.statusType = '';

        $scope.loadData = function () {
            setTimed($scope, 'statusType', 'statusMessage', 'info', '⏳ 데이터를 불러오는 중입니다...', null, $timeout);

            const params = {
                pageNo: 1,
                numOfRows: 500,
            };

            if (($scope.keyword || '').trim()) params.stNm = $scope.keyword.trim();

            $http
                .get('/api/bus/stops', { params })
                .then(function (res) {
                    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

                    let list = [];
                    if (Array.isArray(data)) list = data;
                    else if (data?.response?.body?.items) {
                        const it = data.response.body.items.item || data.response.body.items.bs || [];
                        list = Array.isArray(it) ? it : [it];
                    } else if (data?.body?.items) {
                        const it = data.body.items.item || data.body.items.bs || [];
                        list = Array.isArray(it) ? it : [it];
                    }

                    if (!Array.isArray(list)) {
                        $scope.items = [];
                        $scope.filteredItems = [];
                        return setTimed($scope, 'statusType', 'statusMessage', 'error', '⚠️ 응답 데이터가 목록이 아닙니다.', 2000, $timeout);
                    }

                    $scope.items = list.map((it) => ({
                        bsNm: it.bsNm || it.stationNm || it.name || '이름 없음',
                        xPos: it.xPos || it.gpsX || it.lng || '',
                        yPos: it.yPos || it.gpsY || it.lat || '',
                    }));

                    $scope.filterData();
                    setTimed($scope, 'statusType', 'statusMessage', 'success', '✅ ' + $scope.items.length + '개의 데이터를 불러왔습니다.', 1500, $timeout);
                })
                .catch(function () {
                    setTimed($scope, 'statusType', 'statusMessage', 'error', '❌ 데이터를 불러오지 못했습니다.', 2500, $timeout);
                });
        };

        $scope.filterData = function () {
            const kw = ($scope.keyword || '').trim().toLowerCase();
            if (!kw) {
                $scope.filteredItems = $scope.items.slice();
                return setTimed($scope, 'statusType', 'statusMessage', 'info', '🔍 전체 데이터를 표시합니다.', 1000, $timeout);
            }

            $scope.filteredItems = $scope.items.filter((item) => ((item.bsNm || '') + '').toLowerCase().includes(kw));

            const kwDisp = ($scope.keyword || '').trim();
            if ($scope.filteredItems.length) {
                setTimed($scope, 'statusType', 'statusMessage', 'success', '✅ "' + kwDisp + '" 관련 ' + $scope.filteredItems.length + '건을 찾았습니다.', 1500, $timeout);
            } else {
                setTimed($scope, 'statusType', 'statusMessage', 'error', '❗ "' + kwDisp + '"에 대한 결과가 없습니다.', 1500, $timeout);
            }
        };

        // (홈 탭의 사용자 미니 관리) — 생략(기존 그대로)
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';
        $scope.newUser = { name: '', email: '' };

        function setUserStatus(type, msg, ms) {
            setTimed($scope, 'userStatusType', 'userStatusMessage', type, msg, ms, $timeout);
        }

        function buildKeySet(obj) {
            if (!obj) return new Set();
            const cand = [obj.user_id, obj.userId, obj.id, obj.email, obj.username, obj.name].filter(Boolean).map((s) => s.trim().toLowerCase());
            return new Set(cand);
        }

        function makeRoleIndex(roleRows) {
            const idx = new Map();
            (roleRows || []).forEach((r) => buildKeySet(r).forEach((k) => idx.set(k, { role: r.role })));
            return idx;
        }

        function attachRolesToUsers(users, roleIndex) {
            (users || []).forEach((u) => {
                let matched = null;
                buildKeySet(u).forEach((k) => {
                    if (!matched && roleIndex.has(k)) matched = roleIndex.get(k);
                });
                const role = matched ? matched.role : null;
                u._role = role;
                u._isAdmin = !!(role && String(role).toUpperCase().includes('ADMIN'));
                u.roleLabel = roleToLabel(role);
                u.roleClass = roleToClass(role);
            });
        }

        $scope.loadUsers = function () {
            setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');

            const usersP = $http.get('/user').then((res) => normalizeList(res.data));
            const rolesP = $http
                .get('/api/roles')
                .then((res) => (Array.isArray(res.data) ? res.data : []))
                .catch(() => []);

            $q.all([usersP, rolesP])
                .then(function ([users, roles]) {
                    attachRolesToUsers(users, makeRoleIndex(roles));
                    $scope.users = users;
                    setUserStatus('success', '👤 사용자 ' + $scope.users.length + '명 불러왔습니다.', 1500);
                })
                .catch(function () {
                    setUserStatus('error', '❌ 사용자 목록을 불러오지 못했습니다.', 2500);
                });
        };

        $scope.createUser = function () {
            const name = ($scope.newUser.name || '').trim();
            const email = ($scope.newUser.email || '').trim();
            if (!name || !email) return setUserStatus('error', '이름과 이메일을 모두 입력하세요.', 2000);

            if (!/^[^@\s]+@[^\s@]+\.[^\s@]+$/.test(email)) return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);

            setUserStatus('info', '⏳ 사용자 추가 중...');
            $http
                .post('/user', { name, email })
                .then(function (res) {
                    const created = res.data || {};
                    created.roleLabel = '사용자';
                    created.roleClass = 'badge-user';
                    created._isAdmin = false;
                    $scope.users.unshift(created);
                    $scope.newUser = { name: '', email: '' };
                    const id = created.user_id || created.userId || created.id || '알 수 없음';
                    setUserStatus('success', '✅ 추가 완료 (ID: ' + id + ')', 1500);
                })
                .catch(function () {
                    setUserStatus('error', '❌ 사용자 추가에 실패했습니다.', 2500);
                });
        };

        $scope.startEdit = function (u) {
            u._editing = true;
            u._editName = u.name;
            u._editPhone = u.phone || u.tel || u.phoneNumber || '';
            u._editEmail = u.email;
        };

        $scope.cancelEdit = function (u) {
            u._editing = false;
            u._editName = '';
            u._editPhone = '';
            u._editEmail = '';
        };

        $scope.saveEdit = function (u) {
            const idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return setUserStatus('error', 'ID를 찾을 수 없어 수정할 수 없습니다.', 2000);

            const payload = {};
            const name = (u._editName || '').trim();
            const phone = (u._editPhone || '').trim();
            const email = (u._editEmail || '').trim();

            if (name && name !== u.name) payload.name = name;
            if (phone && phone !== (u.phone || u.tel || u.phoneNumber)) payload.phone = phone;
            if (email && email !== u.email) {
                if (!/^[^@\s]+@[^\s@]+\.[^\s@]+$/.test(email)) return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);
                payload.email = email;
            }

            if (!Object.keys(payload).length) return $scope.cancelEdit(u);

            setUserStatus('info', '⏳ 수정 중... (ID: ' + idKey + ')', 0);
            $http
                .put('/user/' + encodeURIComponent(idKey), payload)
                .then(function (res) {
                    const updated = res.data || {};
                    u.name = updated.name ?? name ?? u.name;
                    u.phone = updated.phone ?? phone ?? u.phone;
                    u.email = updated.email ?? email ?? u.email;
                    $scope.cancelEdit(u);
                    setUserStatus('success', '✅ 수정 완료 (ID: ' + idKey + ')', 1500);
                })
                .catch(function () {
                    setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };

        $scope.deleteUser = function (u) {
            const idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return setUserStatus('error', 'ID를 찾을 수 없어 삭제할 수 없습니다.', 2000);
            if (!confirm('정말로 삭제할까요? (ID: ' + idKey + ')')) return;

            $http
                .delete('/user/' + encodeURIComponent(idKey))
                .then(function () {
                    $scope.users = $scope.users.filter((row) => (row.user_id || row.userId || row.id) !== idKey);
                    setUserStatus('success', '🗑️ 삭제 완료 (ID: ' + idKey + ')', 1500);
                })
                .catch(function () {
                    setUserStatus('error', '❌ 삭제에 실패했습니다.', 2500);
                });
        };

        $scope.goToNew = function () {
            $location.path('/users/new');
        };
    });

    // ───────────────── 게시판 공통 (페이지네이션 + 서버 검색) ─────────────────
    app.controller('BoardBaseCtrl', function ($scope, $http, AuthService, $location) {
        $scope.posts = [];
        $scope.loading = false;
        $scope.newPost = { title: '', content: '', files: null }; // ← 파일 필드 추가

        $scope.showComposer = false;

        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10;
        $scope.page = 0;
        $scope.total = 0;
        $scope.pages = 0;

        // 대용량 게시판 전용: 서버에서 받아온 전체 1000개
        $scope._allBigPosts = [];
        // 화면에 지금 보여주고 있는 개수
        $scope.lazyLoaded = 0;
        // 한 번에 추가로 보여줄 개수(100개씩)
        $scope.lazyChunkSize = 100;

        // ──────── [ADD] 검색 상태 ────────
        $scope.q = { type: 'author', keyword: '', from: null, to: null };

        const isNum = (v) => typeof v === 'number' && isFinite(v);
        const isNonEmptyStr = (s) => typeof s === 'string' && s.trim().length > 0;

        // 파일 확장자 구하기 (File 객체 또는 파일 이름 문자열 둘 다 지원)
        $scope.getFileExt = function (fileOrName) {
            if (!fileOrName) return '확장자 없음';
            var name = fileOrName;
            if (fileOrName.name) {
                // File 객체인 경우
                name = fileOrName.name;
            }
            var idx = name.lastIndexOf('.');
            if (idx < 0) return '확장자 없음';
            return name.substring(idx + 1).toLowerCase();
        };

        // 파일 크기를 사람이 보기 좋게 포맷
        $scope.formatFileSize = function (size) {
            if (!angular.isNumber(size)) return '알 수 없음';
            if (size < 1024) return size + ' B';
            var kb = size / 1024;
            if (kb < 1024) return kb.toFixed(1) + ' KB';
            var mb = kb / 1024;
            if (mb < 1024) return mb.toFixed(2) + ' MB';
            var gb = mb / 1024;
            return gb.toFixed(2) + ' GB';
        };

        // ================== ✨ 본문에 파일 토큰 넣기 ==================
        // bus.html에서 "본문에 넣기" 버튼 클릭 시 호출
        // index: newPost.files 배열의 인덱스
        $scope.insertAttachmentToken = function (index) {
            // 토큰 형식은 자유롭게 변경 가능: [[att:1]], {{img1}} 등
            // 여기선 간단히 [[file:번호]] 로 사용
            var token = '[[file:' + (index + 1) + ']]';

            var textarea = document.getElementById('newPostContent');
            var content = $scope.newPost.content || '';

            if (textarea && typeof textarea.selectionStart === 'number') {
                // 커서 위치/선택 영역 기준으로 토큰 삽입
                var start = textarea.selectionStart;
                var end = textarea.selectionEnd;

                var before = content.substring(0, start);
                var after = content.substring(end);

                $scope.newPost.content = before + token + after;

                // Angular digest 에서 값 반영 후 커서 위치 재설정
                setTimeout(function () {
                    textarea.focus();
                    var pos = start + token.length;
                    textarea.selectionStart = textarea.selectionEnd = pos;
                }, 0);
            } else {
                // textarea를 못 찾으면 그냥 뒤에 붙이기
                $scope.newPost.content = content + (content ? '\n' : '') + token;
            }
        };
        // ==========================================================

        // ──────── [ADD] 검색 창 토글/닫기 ────────
        $scope.searchOpen = false; // 검색 패널(툴바) 열림/닫힘 상태를 보관하는 플래그. 초깃값은 닫힘(false).

        $scope.toggleSearch = function (open) {
            // 검색 패널을 토글(또는 지정한 상태로) 여닫는 함수.
            $scope.searchOpen =
                typeof open === 'boolean'
                    ? open // 인자로 불린이 왔으면 그 값 그대로 쓰고,
                    : !$scope.searchOpen; // 아니면 현재 상태를 반전시킴(토글).

            if ($scope.searchOpen) {
                // 패널이 이제 열렸다면,
                setTimeout(function () {
                    // DOM 렌더링이 완료된 다음에 실행
                    var el = document.getElementById('board-search-input');
                    if (el) el.focus();
                }, 0);
            }
        };

        $scope.closeSearch = function (resetAlso) {
            if (resetAlso) $scope.resetSearch(); // 필요하면 검색 조건까지 초기화
            $scope.searchOpen = false;
        };

        $scope.onSearchKey = function ($event) {
            if ($event && $event.which === 13) $scope.applySearch(); // Enter 키
        };

        $scope.searchActive = function () {
            const kw = String($scope.q.keyword || '').trim();
            return $scope.q.type === 'time' ? $scope.q.from || $scope.q.to : !!kw;
        };

        // 🔍 검색 적용
        $scope.applySearch = function () {
            $scope.page = 0;
            $scope.loadPosts();
        };

        // 🔄 검색 초기화
        $scope.resetSearch = function () {
            $scope.q = {
                type: 'author',
                keyword: '',
                from: null,
                to: null,
            };
            $scope.page = 0;
            $scope.loadPosts();
        };

        // 👤 로그인 사용자 정보 불러오기
        AuthService.loadMe().finally(() => {
            $scope.me = AuthService.getMe();
        });

        function canEditPost(p) {
            return $scope.me && ($scope.me.isAdmin || $scope.me.username === p.writerId);
        }
        function canEditComment(c) {
            return $scope.me && ($scope.me.isAdmin || $scope.me.username === c.writerId);
        }

        // 🧩 게시글의 고유 키(숫자 또는 문자열) 판별 함수
        function resolvePostKey(p) {
            if (isNum(p.postId)) return { type: 'num', key: p.postId };
            const candidates = [p.postKey, p.postIdStr, p.post_uuid, p.postUuid, p.uuid, p.id, p.key].filter(isNonEmptyStr);
            if (candidates.length) return { type: 'str', key: candidates[0] };
            return { type: 'none', key: null };
        }

        // 🪪 게시글 고유 UID 생성 함수
        function makePostUid(p, idx) {
            const cand = [isNum(p.postId) ? String(p.postId) : null, isNum(p.id) ? String(p.id) : null, p.post_uuid, p.postUuid, p.uuid, p.idStr, p.postIdStr, p.key, p._key != null ? String(p._key) : null].filter(isNonEmptyStr);

            if (cand.length) return cand[0];
            return 'tmp-' + Date.now() + '-' + (idx == null ? Math.random().toString(36).slice(2) : idx);
        }

        // 📥 게시글 목록(리스트)을 서버에서 불러오는 함수
        $scope.loadPosts = function () {
            // boardCode가 없으면(어느 게시판인지 모르면) 그냥 종료
            if (!$scope.boardCode) return;

            // 로딩 상태 ON (스피너 등 표시 용도)
            $scope.loading = true;

            // 서버에 보낼 쿼리 파라미터 기본 값 설정
            const params = {
                // 현재 페이지 번호 (0부터 시작인지 1부터 시작인지는 서버 설계에 따라)
                page: $scope.page,
                // 페이지당 게시글 개수. 문자열일 수 있으니 toInt로 정수 변환, 기본값 10
                size: toInt($scope.pageSize, 10),
            };

            // ────────── 검색 조건 처리 ──────────
            // 만약 검색 타입이 'time'이라면(날짜/기간으로 검색)
            if ($scope.q.type === 'time') {
                // type 파라미터에 'time' 지정
                params.type = 'time';

                // 시작 날짜가 있으면 from 파라미터 추가
                if ($scope.q.from) params.from = $scope.q.from;
                // 종료 날짜가 있으면 to 파라미터 추가
                if ($scope.q.to) params.to = $scope.q.to;
            } else {
                // 그 외 검색(작성자, 제목, 내용 등)일 때

                // 키워드 문자열을 정리 (앞뒤 공백 제거)
                const kw = ($scope.q.keyword || '').trim();

                // 키워드가 비어있지 않을 때만 검색 파라미터를 붙인다.
                if (kw) {
                    // 검색 타입 (author / title / content 등), 없으면 기본값 'author'
                    params.type = $scope.q.type || 'author';
                    // 실제 검색어
                    params.keyword = kw;
                }
            }

            // ────────── URL 결정 (일반 게시판 vs 대용량 게시판) ──────────

            // 최종 요청을 보낼 URL 변수
            let url;

            // 만약 현재 게시판 코드가 'BIG'이면 (대용량 게시판)
            if ($scope.boardCode === 'BIG') {
                // 기존에는 '/api/big-posts' 같은 URL을 썼을 수도 있지만
                // 지금은 스프링 컨트롤러에서 매핑해둔 주소에 맞춰 '/api/big-board/posts' 사용
                url = '/api/big-board/posts'; // ✅ 컨트롤러 주소와 동일하게
            } else {
                // 그 외 일반 게시판이면
                // '/api/boards/{boardCode}/posts' 형식의 URL 사용
                // 예: '/api/boards/BUS/posts', '/api/boards/NORM/posts'
                url = '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts';
            }

            // ────────── 실제 HTTP GET 요청 ──────────
            $http
                // 위에서 만든 url과 params를 가지고 서버에 GET 요청
                .get(url, { params })
                .then((res) => {
                    // 서버에서 온 응답 데이터(res.data)를 data 변수에 담는다.
                    // 혹시 없으면 빈 객체 {} 사용
                    const data = res.data || {};

                    // 서버가 어떤 키 이름으로 리스트를 내려줄지 모를 때를 대비해서,
                    // content, rows, list, 배열 그 자체 등 여러 경우를 한 번에 처리

                    const list = Array.isArray(data.content)
                        ? data.content // Spring Page 객체의 content
                        : Array.isArray(data.rows)
                        ? data.rows // rows 라는 필드일 때
                        : Array.isArray(data.list)
                        ? data.list // list 라는 필드일 때
                        : Array.isArray(data)
                        ? data // 아예 data 자체가 배열일 때
                        : []; // 어느 것도 아니면 빈 배열

                    // src는 "진짜 리스트"를 가리키는 안전한 변수
                    const src = Array.isArray(list) ? list : [];

                    // ────────── 각 게시글에 내부용 키(_key, _keyType, _uid) 붙이기 ──────────
                    const mapped = src.map((p, i) => {
                        const r = resolvePostKey(p);
                        p._keyType = r.type;
                        p._key = r.key;
                        p._uid = makePostUid(p, i);
                        return p;
                    });

                    // ✅ BIG(대용량) 게시판일 때는 1000개 전체를 _allBigPosts에 저장하고,
                    //    화면에는 처음에 100개만 보여준다.
                    if ($scope.boardCode === 'BIG') {
                        $scope._allBigPosts = mapped || [];
                        $scope.lazyLoaded = Math.min($scope.lazyChunkSize, $scope._allBigPosts.length);
                        $scope.posts = $scope._allBigPosts.slice(0, $scope.lazyLoaded);
                    } else {
                        // 일반 게시판(BUS, NORM)은 기존처럼 전체를 posts에 넣기
                        $scope.posts = mapped;
                    }

                    // ────────── 페이지 번호, 페이지 크기, 전체 개수 계산 ──────────

                    // 현재 페이지 번호 갱신
                    // 서버가 page 혹은 number라는 필드로 페이지 번호를 내려줄 수 있으므로 둘 다 체크
                    $scope.page = typeof data.page === 'number' ? data.page : typeof data.number === 'number' ? data.number : $scope.page; // 둘 다 없으면 기존 값 유지

                    // 페이지 크기(pageSize) 갱신
                    // 서버가 size 필드를 내려줄 수도 있고, 아니면 기존 $scope.pageSize 유지
                    $scope.pageSize = toInt(typeof data.size === 'number' ? data.size : $scope.pageSize, 10);

                    // 서버가 total이나 totalElements라는 필드로 "전체 게시글 수"를 내려주는지 확인
                    const hasTotal = typeof data.total === 'number' || typeof data.totalElements === 'number';

                    // total 또는 totalElements 중 실제 있는 값을 serverTotal에 담는다.
                    const serverTotal = typeof data.total === 'number' ? data.total : data.totalElements;

                    // 서버가 totalPages 또는 pages라는 이름으로 "전체 페이지 수"를 내려줄 수도 있다.
                    const serverTotalPages = typeof data.totalPages === 'number' ? data.totalPages : typeof data.pages === 'number' ? data.pages : undefined;

                    // 1️⃣ 서버가 전체 개수(total)를 알려준 경우
                    if (hasTotal) {
                        // 전체 게시글 수
                        $scope.total = serverTotal;

                        // 페이지 수 = total / pageSize 를 올림(Math.ceil)해서 계산
                        // 최소 1페이지는 있도록 Math.max(1, ...)
                        $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));

                        // 2️⃣ total은 없지만 totalPages(혹은 pages)만 알려준 경우
                    } else if (serverTotalPages !== undefined) {
                        // 페이지 수는 서버가 준 값으로 사용
                        $scope.pages = Math.max(1, serverTotalPages);

                        // total은 pageSize * pages 로 역산해서 대략값으로 넣는다.
                        $scope.total = $scope.pages * Math.max(1, toInt($scope.pageSize, 10));

                        // 3️⃣ total도, totalPages도 둘 다 없는 경우 (아주 단순한 응답 포맷)
                    } else {
                        // 현재 페이지에 몇 개의 게시글이 있는지 길이로 계산
                        const curLen = Array.isArray(src) ? src.length : 0;

                        // total이 이미 있으면 그 값과, curLen * pageSize 중 더 큰 값을 사용
                        // (스크롤하면서 계속 불러오는 방식이라면 기존 total보다 더 많아질 수 있음)
                        $scope.total = Math.max($scope.total || 0, curLen * Math.max(1, toInt($scope.pageSize, 10)));

                        // total 기준으로 다시 pages를 계산
                        $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
                    }
                })
                // 요청이 실패했을 때 실행되는 부분
                .catch(() => {
                    // 게시글 목록을 빈 배열로 초기화
                    $scope.posts = [];
                    // 전체 개수 0, 페이지 수 1로 초기화
                    $scope.total = 0;
                    $scope.pages = 1;
                })
                // 성공/실패와 상관 없이 마지막에 항상 실행되는 부분
                .finally(() => {
                    // 로딩 상태 OFF
                    $scope.loading = false;
                });
        };

        $scope.reload = function () {
            $scope.loadPosts();
        };

        // ✅ BIG 전용: 아래로 더 스크롤하거나 버튼 눌렀을 때 100개씩 더 보이게
        $scope.loadMore = function () {
            if ($scope.boardCode !== 'BIG') return; // 대용량 게시판이 아니면 무시
            if (!$scope._allBigPosts || !$scope._allBigPosts.length) return;

            var next = $scope.lazyLoaded + $scope.lazyChunkSize; // 다음에 보여줄 끝 인덱스
            if (next > $scope._allBigPosts.length) {
                next = $scope._allBigPosts.length; // 끝까지 도달했으면 거기까지만
            }

            $scope.lazyLoaded = next;
            $scope.posts = $scope._allBigPosts.slice(0, $scope.lazyLoaded);
        };

        // 페이지 이동/사이즈 변경 ------------------------------
        $scope.first = function () {
            if ($scope.page > 0) {
                $scope.page = 0;
                $scope.loadPosts();
            }
        };

        $scope.prev = function () {
            if ($scope.page > 0) {
                $scope.page--;
                $scope.loadPosts();
            }
        };

        $scope.next = function () {
            if ($scope.page < $scope.pages - 1) {
                $scope.page++;
                $scope.loadPosts();
            }
        };

        $scope.last = function () {
            if ($scope.page < $scope.pages - 1) {
                $scope.page = $scope.pages - 1;
                $scope.loadPosts();
            }
        };

        $scope.go = function (p) {
            var target = parseInt(p, 10);
            if (isFinite(target) && target >= 0 && target < $scope.pages && target !== $scope.page) {
                $scope.page = target;
                $scope.loadPosts();
            }
        };

        $scope.changeSize = function () {
            $scope.pageSize = toInt($scope.pageSize, 10);
            $scope.page = 0;
            $scope.loadPosts();
        };

        $scope.onSize = function () {
            $scope.changeSize();
        };

        $scope.pageRange = function () {
            var totalPages = parseInt($scope.pages, 10);
            if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;

            var cur = parseInt($scope.page, 10);
            if (!isFinite(cur) || cur < 0) cur = 0;
            if (cur > totalPages - 1) cur = totalPages - 1;

            var arr = [];
            var start = Math.max(0, cur - 2);
            var end = Math.min(totalPages - 1, cur + 2);
            for (var i = start; i <= end; i++) arr.push(i);
            return arr;
        };

        // ====== 댓글 관련 ======
        $scope.toggleComments = function (p) {
            p._showComments = !p._showComments;
            if (p._showComments && !p._commentsLoaded) $scope.loadComments(p);
        };

        function decorateComments(arr) {
            const baseTs = Date.now();
            return (arr || []).map((c, i) => {
                if (!c) return c;
                c._uid = (c.uuid && 'c-' + c.uuid) || (typeof c.commentId === 'number' && isFinite(c.commentId) && 'c-' + c.commentId) || 'c-tmp-' + baseTs + '-' + i;
                c._replying = false;
                c._replyText = '';
                return c;
            });
        }

        $scope.loadComments = function (p) {
            const url = p._keyType === 'num' ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' : p._keyType === 'str' ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' : null;

            if (!url) {
                p.comments = [];
                p._commentsLoaded = true;
                return;
            }

            $http.get(url).then((res) => {
                p.comments = decorateComments(Array.isArray(res.data) ? res.data : []);
                p._commentsLoaded = true;
                p._newComment = '';
            });
        };

        $scope.addComment = function (p) {
            const text = (p._newComment || '').trim();
            if (!text) return;

            const url = p._keyType === 'num' ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' : p._keyType === 'str' ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' : null;
            if (!url) return alert('이 글은 댓글 기능을 사용할 수 없습니다.');

            $http.post(url, { content: text }).then((res) => {
                const created = res.data || {};
                p.comments = p.comments || [];
                p.comments.push(created);
                p._newComment = '';
            });
        };

        $scope.startReply = function (c) {
            c._replying = true;
            c._replyText = '';
        };

        $scope.cancelReply = function (c) {
            c._replying = false;
            c._replyText = '';
        };

        $scope.submitReply = function (p, parent) {
            const text = (parent._replyText || '').trim();
            if (!text) return;

            if (!parent || !parent.uuid) return alert('이 댓글은 대댓글 키(uuid)를 알 수 없습니다.');

            const url = '/api/comments/key/' + encodeURIComponent(parent.uuid) + '/replies';

            $http
                .post(url, { content: text })
                .then((res) => {
                    const created = res.data || {};
                    p.comments = p.comments || [];
                    p.comments.push(created);
                    parent._replying = false;
                    parent._replyText = '';
                })
                .catch(() => {
                    alert('대댓글 등록에 실패했습니다.');
                });
        };

        $scope.startEditComment = function (c) {
            if (!canEditComment(c)) return alert('본인이 쓴 댓글만 수정할 수 있습니다.');
            c._editing = true;
            c._editContent = c.content;
        };

        $scope.cancelEditComment = function (c) {
            c._editing = false;
            c._editContent = '';
        };

        $scope.saveComment = function (p, c) {
            if (!canEditComment(c)) return alert('본인이 쓴 댓글만 수정할 수 있습니다.');
            const newText = (c._editContent || '').trim();
            if (!newText) return;

            if (!c.uuid) return alert('이 댓글은 수정용 키를 알 수 없어 수정할 수 없습니다.');

            $http
                .put('/api/comments/key/' + encodeURIComponent(c.uuid), {
                    content: newText,
                })
                .then(function (res) {
                    c.content = newText;
                    if (res && res.data && res.data.updatedAt) c.updatedAt = res.data.updatedAt;
                    c._editing = false;
                    c._editContent = '';
                })
                .catch(function (err) {
                    if (err && err.status === 403) alert('본인이 쓴 댓글만 수정할 수 있습니다.');
                    else alert('수정에 실패했습니다.');
                });
        };

        $scope.deleteComment = function (p, c) {
            if (!canEditComment(c)) return alert('본인이 쓴 댓글만 삭제할 수 있습니다.');
            if (!confirm('댓글을 삭제할까요?')) return;

            if (c && c.uuid) {
                $http
                    .delete('/api/comments/key/' + encodeURIComponent(c.uuid))
                    .then(function () {
                        p.comments = (p.comments || []).filter(function (x) {
                            return x.uuid !== c.uuid;
                        });
                    })
                    .catch(function (err) {
                        if (err && err.status === 403) alert('본인이 쓴 댓글만 삭제할 수 있습니다.');
                        else alert('삭제 실패');
                    });
                return;
            }

            const id = c && c.commentId;
            if (typeof id === 'number' && isFinite(id)) {
                $http
                    .delete('/api/comments/' + encodeURIComponent(id))
                    .then(function () {
                        p.comments = (p.comments || []).filter(function (x) {
                            return x.commentId !== id;
                        });
                    })
                    .catch(function () {
                        alert('삭제 실패');
                    });
                return;
            }

            alert('이 댓글은 삭제용 키를 알 수 없어 삭제할 수 없습니다.');
        };

        // ====== ★ 게시글 CRUD(추가) — 저장 후 항상 새로고침 ======
        // 새 게시글(폴더/파일/일반글) 생성
        $scope.createPost = function () {
            if (!$scope.newPost) $scope.newPost = {};

            const title = ($scope.newPost.title || '').trim();
            const content = ($scope.newPost.content || '').trim();

            if (!title) {
                alert('제목을 입력하세요.');
                return;
            }

            const isFolder = !!$scope.newPost.isFolder;
            const folderName = ($scope.newPost.folderName || '').trim();

            const files = $scope.newPost.files || [];
            const file = files && files.length ? files[0] : null;

            const fileInput = document.getElementById('postFile');

            const fd = new FormData();
            fd.append('title', title);
            fd.append('content', content);

            if (isFolder) {
                fd.append('isFolder', 'true');
                if (folderName) fd.append('folderName', folderName);
            } else {
                if (file) {
                    fd.append('file', file);
                }
            }

            $scope.loading = true;

            $http
                .post('/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', fd, {
                    headers: { 'Content-Type': undefined },
                    transformRequest: angular.identity,
                })
                .then(function () {
                    alert('등록되었습니다.');
                    $scope.newPost = {};
                    $scope.newPost.files = null;
                    if (fileInput) fileInput.value = '';
                    $scope.loadPosts && $scope.loadPosts();
                })
                .catch(function (err) {
                    console.error('게시글 등록 실패', err);
                    alert('등록에 실패했습니다.');
                })
                .finally(function () {
                    $scope.loading = false;
                });
        };

        // 인라인 수정 시작
        $scope.startEditPost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');
            p._editing = true;
            p._editTitle = p.title;
            p._editContent = p.content;
        };

        // 인라인 수정 취소
        $scope.cancelEditPost = function (p) {
            p._editing = false;
            p._editTitle = '';
            p._editContent = '';
        };

        // 인라인 수정 저장
        $scope.savePost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');
            const title = (p._editTitle || '').trim();
            const content = (p._editContent || '').trim();
            if (!title) return alert('제목을 입력하세요.');

            const keyType = p._keyType;
            const key = p._key;
            let url = null;
            if (keyType === 'str') url = '/api/posts/key/' + encodeURIComponent(key);
            else if (keyType === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else return alert('이 글의 수정용 키를 알 수 없습니다.');

            $http
                .put(url, { title, content })
                .then(function () {
                    p._editing = false;
                    p._editTitle = '';
                    p._editContent = '';
                    $scope.reload ? $scope.reload() : $scope.loadPosts();
                })
                .catch(function () {
                    alert('저장 실패');
                });
        };

        // 게시글 삭제
        $scope.deletePost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 삭제할 수 있습니다.');
            if (!confirm('정말 삭제할까요?')) return;

            const keyType = p._keyType;
            const key = p._key;
            let url = null;
            if (keyType === 'str') url = '/api/posts/key/' + encodeURIComponent(key);
            else if (keyType === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else return alert('이 글의 삭제용 키를 알 수 없습니다.');

            $http
                .delete(url)
                .then(function () {
                    $scope.reload ? $scope.reload() : $scope.loadPosts();
                })
                .catch(function () {
                    alert('삭제 실패');
                });
        };

        // 수정 화면으로 보내기
        $scope.goEdit = function (p) {
            // 🔍 1) p(게시글 객체)가 없거나,
            //      p._key(글 고유키), p._keyType(키 타입)이 없으면 → 수정 불가능
            if (!p || !p._key || !p._keyType) return alert('수정용 키가 없습니다.');

            // 🔍 2) 글의 key 타입(num 또는 str)을 URL에 사용하기 위해 변환
            //     - 숫자형이면 'num'
            //     - 그 외(uuid형)면 'str'
            var type = p._keyType === 'num' ? 'num' : 'str';

            // 🔍 3) 현재 게시판 코드(BUS/NORM/BIG 등)를 꺼내고
            //       URL 규칙에 맞게 모두 소문자로 변환
            var code = ($scope.boardCode || '').toLowerCase();

            // 🔍 4) 최종적으로 수정 화면으로 이동하는 URL 구성
            //       #/board/{boardCode}/edit/{type}/{key}
            //       예: #/board/bus/edit/num/123
            //           #/board/norm/edit/str/550e8400-e29b-41d4-a716-446655440000
            window.location.hash = '#/board/' + encodeURIComponent(code) + '/edit/' + type + '/' + encodeURIComponent(p._key);
        };

        // ★★ 게시글 상세보기로 이동 (제목 클릭 시 사용)
        // 게시글 목록에서 개별 게시글을 클릭했을 때 "상세보기" 화면으로 이동시키는 함수
        $scope.goDetail = function (p) {
            // p: 목록에서 선택된 게시글 객체(한 줄 데이터)
            // 예: { postId: 1, uuid: '...', title: '제목', ... }

            if (!p) return;
            // p가 null / undefined / 잘못된 값이면 더 진행하지 않고 함수 종료
            // (방어 코드: 클릭 이벤트가 잘못 들어온 경우 대비)

            var info = resolvePostKey(p); // { type:'num'|'str', key: ... }
            // resolvePostKey(p):
            //   - 게시글 객체 p 안에서 "상세 조회에 쓸 수 있는 키"를 찾아서
            //     { type: 'num' 또는 'str', key: 실제값 } 형태로 돌려주는 헬퍼 함수.
            //   - 예) 숫자 PK 사용: { type: 'num', key: 123 }
            //       UUID/문자열 PK 사용: { type: 'str', key: '7f2d-aaaa-...' }

            if (!info || !info.key) {
                // info 자체가 없거나, info.key 값이 비어 있으면
                // → 이 글을 상세보기로 가져갈 수 있는 식별자가 없다는 뜻
                alert('상세 보기용 키가 없습니다.');
                // 사용자에게 경고창을 띄우고
                return;
                // 상세 화면으로 이동하지 않고 함수 종료
            }

            var code = ($scope.boardCode || '').toLowerCase(); // 'bus' / 'norm'
            // 현재 컨트롤러(게시판 목록)가 어떤 게시판인지 나타내는 코드
            //  - $scope.boardCode: 'BUS', 'NORM' 등일 수 있음
            //  - 없을 경우를 대비해 기본값 ''(빈 문자열) 사용
            //  - .toLowerCase() 로 'BUS' → 'bus', 'NORM' → 'norm' 으로 통일

            if (!code) code = 'bus';
            // 만약 boardCode가 전혀 설정되어 있지 않아서 code가 빈 문자열이면
            // 기본 게시판을 'bus' 로 가정 (대구버스 게시판을 기본값으로)

            var url = '#/board/' + encodeURIComponent(code) + '/view/' + encodeURIComponent(info.key) + '?type=' + encodeURIComponent(info.type || 'str');
            // AngularJS hash 기반 라우팅을 위한 URL 문자열 구성
            //
            // 최종 형태 예시:
            //   "#/board/bus/view/123?type=num"
            //   "#/board/norm/view/550e8400-e29b-41d4-a716-446655440000?type=str"
            //
            // encodeURIComponent(..):
            //   - code나 key, type 안에 공백/한글/특수문자가 있어도
            //     URL에 안전하게 들어갈 수 있게 인코딩해 줌.
            //
            // info.type || 'str':
            //   - info.type이 없으면 기본값으로 'str'(문자열 키) 사용.

            window.location.hash = url;
            // 브라우저 주소창의 hash 부분을 위에서 만든 URL로 변경
            //   예: http://localhost:8080/index.html#/board/bus
            //   →   http://localhost:8080/index.html#/board/bus/view/123?type=num
            //
            // AngularJS 의 ngRoute가 이 hash 변경을 감지하고
            //   1) 해당 라우트에 등록된 템플릿(상세보기 HTML)을 로딩하고
            //   2) 해당 라우트에 연결된 컨트롤러(BoardViewCtrl 등)를 실행해서
            //      실제로 게시글 상세 내용을 화면에 그려 줌.
        };
    });

    // ───────────────── 게시글 편집 전용 컨트롤러 ─────────────────
    // AngularJS 모듈(app)에 "BoardEditCtrl" 이라는 이름의 컨트롤러를 등록한다.
    // 이 컨트롤러는 게시글 수정 화면(에디터 화면)을 담당한다.
    app.controller('BoardEditCtrl', function ($scope, $http, $routeParams, $location) {
        // 화면이 처음 로딩 중인지 여부를 나타내는 플래그.
        // true면 "로딩 스피너" 같은 걸 보여줄 때 쓸 수 있다.
        $scope.loading = true;

        // 저장 버튼을 눌렀을 때, 중복 클릭을 막기 위한 플래그.
        // 저장 중이면 true, 아니면 false.
        $scope.saving = false;

        // 삭제 버튼을 눌렀을 때, 중복 클릭을 막기 위한 플래그.
        // 삭제 중이면 true, 아니면 false.
        $scope.deleting = false;

        // 라우트 파라미터에서 게시판 코드(code)를 읽어온다.
        // 예: "#/board/bus/edit/123" 에서 bus 부분이 code.
        // toUpperCase()로 항상 'BUS', 'NORM' 이런 대문자 형태로 맞춘다.
        const code = String($routeParams.code || '').toUpperCase(); // 'BUS' / 'NORM'

        // 라우트 파라미터에서 게시글 키의 타입(type)을 읽어온다.
        // 기본값은 'str' 이고, 숫자 ID를 쓰면 'num'으로도 올 수 있다.
        // 예: type === 'num' 이면 /api/posts/{id}, 'str' 이면 /api/posts/key/{uuid} 식으로 구분.
        const type = String($routeParams.type || 'str'); // 'num' | 'str'

        // 라우트 파라미터에서 게시글 식별자(key)를 가져온다.
        // 숫자 ID일 수도 있고, 문자열(예: uuid)일 수도 있다.
        const key = $routeParams.key;

        // 목록 화면으로 돌아가는 내부 함수.
        // 게시판 코드에 맞게 '#/board/bus', '#/board/norm' 같은 경로로 이동한다.
        function backToList() {
            // path는 '/board/bus' 또는 '/board/norm' 같은 형태가 된다.
            const path = '/board/' + code.toLowerCase();

            // $location.path()로 AngularJS 라우터의 경로를 변경.
            // .search({}) 로 쿼리스트링 파라미터를 모두 초기화(비우기).
            $location.path(path).search({});
        }

        // 취소 버튼 클릭 시 사용할 함수로 backToList를 연결한다.
        // 템플릿에서 ng-click="cancel()" 이런 식으로 호출할 수 있다.
        $scope.cancel = backToList;

        // ───────────────── 파일 선택 핸들러 ─────────────────
        // input[type="file"] 요소에서 파일이 선택되었을 때 호출되는 함수.
        // (file-model 디렉티브를 사용하면 이 함수를 안 써도 되지만,
        //  여기서는 직접 element.files를 읽어오는 방식으로 구현)
        // ★ 여러 개 파일을 지원하도록 수정된 버전이다.
        $scope.onFileChange = function (element) {
            // AngularJS의 소스 변경을 감지시키기 위해 $scope.$apply 사용.
            // (브라우저의 change 이벤트는 AngularJS 소속이 아니기 때문에 수동으로 알려줘야 함)
            $scope.$apply(function () {
                // $scope.form 객체가 없다면 새로 만든다.
                // (undefined일 수 있으니 안전하게 초기화)
                $scope.form = $scope.form || {};

                // element.files는 FileList 타입이라 배열처럼 보이지만 진짜 배열은 아니다.
                // Array.from(...)을 사용해서 진짜 배열로 변환해 준다.
                const files = Array.from(element.files || []); // FileList → 배열

                // 여러 개 파일을 form.files에 저장한다.
                // 나중에 이 배열을 돌면서 FormData에 첨부할 수 있다.
                $scope.form.files = files; // 여러 개 파일

                // 기존 코드와 호환성을 유지하기 위해,
                // 첫 번째 파일만 따로 form.file에 넣어둔다.
                // (예전에는 단일 파일만 처리하는 코드였을 수 있음)
                $scope.form.file = files[0] || null; // 기존 코드 호환용 (단일 파일)
            });
        };

        // ───────────────── 파일 메타데이터 정규화 함수 ─────────────────
        // ★ 서버에서 내려오는 "파일 정보" 형식이 제각각일 수 있어서,
        //   이 함수를 통해 { url, fileName, fileType } 형태로 통일한다.
        // ★ 전체 app.js 어디서든 쓸 수 있는 전역 헬퍼 함수로 수정
        //   (safeParseFileList, 목록/상세/에디터 모두에서 공통 사용)
        function normalizeFileMeta(raw) {
            // 인자로 아무 것도 안 들어왔으면 null 반환.
            if (!raw) return null;

            // 파일을 다운로드/보기 위한 URL을 여러 후보 중에서 하나 골라서 사용.
            // 서버 구현에 따라 속성 이름이 url, fileUrl, downloadUrl, path, link 등 제각각일 수 있기 때문에
            // "있으면 그걸 쓰고, 없으면 다음 후보" 식으로 찾는다.
            const url =
                raw.url || // 일반적인 url 필드
                raw.fileUrl || // fileUrl로 보내는 경우
                raw.downloadUrl || // downloadUrl로 보내는 경우
                raw.path || // 단순 파일 경로로 보내는 경우
                raw.link || // 링크 형태로 보내는 경우
                null; // 다 없으면 null

            // 파일 이름도 마찬가지로 서버에서 어떤 이름으로 보내는지 다를 수 있어서
            // 가능한 후보들을 차례로 검사해서 하나를 선택한다.
            const fileName =
                raw.originalFilename || // 흔히 쓰는 originalFilename
                raw.fileName || // fileName
                raw.filename || // filename (소문자)
                raw.name || // name
                raw.originName || // originName
                null; // 아무 것도 없으면 null

            // 파일의 MIME 타입(예: "image/png", "application/pdf")도
            // 필드명이 fileType, type, contentType 등 다양할 수 있어서
            // 이 중에서 있는 값을 하나 사용한다.
            const fileType =
                raw.fileType || // fileType
                raw.type || // type
                raw.contentType || // contentType
                null; // 없으면 null

            // 최종적으로 화면에서 쓰기 편한 표준 구조로 묶어서 반환.
            return {
                url: url, // 실제 파일을 열거나 다운로드할 때 사용할 URL
                fileName: fileName, // 사용자에게 보여줄 파일 이름
                fileType: fileType, // MIME 타입 정보
            };
        }

        // ★ file_list_json 문자열을 배열로 안전하게 파싱 + 정규화
        function safeParseFileList(json) {
            // 인자로 넘어온 json이 비어있거나(null, undefined, '') 거짓이면
            // "첨부 파일 없음"으로 보고 바로 빈 배열 반환
            if (!json) return [];

            try {
                // JSON 문자열을 실제 JS 값(객체/배열 등)으로 파싱
                // 예: '[{...}, {...}]' → 배열, '{"files":[...]} ' → 객체
                const v = JSON.parse(json);

                // 최종적으로 사용할 "임시 배열" 변수
                let arr = [];

                // 1️⃣ 이미 배열이면 그대로 사용
                if (Array.isArray(v)) arr = v;
                // 2️⃣ { files: [...] } 구조면 그 안의 files 배열 사용
                else if (v && Array.isArray(v.files)) arr = v.files;
                // 3️⃣ { list: [...] } 구조면 그 안의 list 배열 사용
                else if (v && Array.isArray(v.list)) arr = v.list;
                // 4️⃣ 객체 하나만 온 경우({url:'...', fileName:'...'} 형태)
                //    → 배열이 아니므로, 그 객체 하나를 배열로 감싸서 처리
                else if (v && typeof v === 'object') arr = [v];
                // 5️⃣ 그 외의 경우(문자열, 숫자 등 쓸 수 없는 구조)는 빈 배열
                else arr = [];

                // 최종적으로 "정규화된" 파일 메타만 담을 배열
                const norm = [];

                // arr에 들어있는 각 요소(one)에 대해 반복
                arr.forEach(function (one) {
                    // normalizeFileMeta(one):
                    //  - 다양한 키 이름(url, fileUrl, path, link 등)을 하나의 통일된 형태로 맞춰 주는 함수
                    //  - 내부에서 { url, fileName, fileType, fileSize, fileContentType ... } 같이 표준화된 객체로 변환
                    const m = normalizeFileMeta(one);

                    // m이 존재하고, 그 안에 url이 있으면 정상적인 파일 메타라고 판단 → norm 배열에 추가
                    if (m && m.url) norm.push(m);
                });

                // 최종적으로 "정리된 파일 메타 데이터 배열" 반환
                // 예: [
                //   { url: '/uploads/xxx.png', fileName: 'xxx.png', fileType: 'IMAGE', ... },
                //   { url: '/uploads/yyy.pdf', fileName: 'yyy.pdf', fileType: 'FILE', ... }
                // ]
                return norm;
            } catch (e) {
                // JSON.parse 중에 에러가 나면(문자열이 깨져 있거나 잘못된 JSON 형식)
                // 콘솔에 경고 로그를 남기고
                console.warn('file_list_json parse error:', e, json);
                // 안전하게 "첨부 없음"으로 처리 → 빈 배열 반환
                return [];
            }
        }

        // ─────────────────────────────
        // 첨부 이미지 미리보기 크기 상태 + 토큰과 연동
        // ─────────────────────────────
        $scope.previewWidths = []; // 첨부파일별 width(%) 저장

        // form.content 안에서 [[file:n width=60]] 같은 토큰에서 width 읽기
        function getWidthFromContent(index) {
            if (!$scope.form) return null;
            var content = $scope.form.content || '';
            var n = index + 1; // file 번호는 1부터
            var re = new RegExp('\\[\\[file\\s*:\\s*' + n + '(?:\\s+width\\s*=\\s*(\\d+))?\\s*\\]\\]');
            var m = re.exec(content);
            if (!m) return null;

            if (m[1]) {
                var w = parseInt(m[1], 10);
                if (isFinite(w) && w > 0 && w <= 100) return w;
            }
            return null;
        }

        // form.content 안에 [[file:n ...]] 토큰을 width=X 형태로 반영해 주는 함수
        // 이미 토큰이 있으면 width 부분만 수정하고, 없다면 새 토큰을 본문 끝에 추가한다.
        function applyWidthToContent(index, width) {
            // 아직 $scope.form 자체가 없으면(안 불러왔으면) 그냥 아무 것도 안 하고 종료
            if (!$scope.form) return;

            // 내부적으로는 파일 인덱스를 0부터 쓰지만,
            // 토큰 표기([[file:1]], [[file:2]]...)는 1부터 시작하는 형태라서 +1 해준다.
            var n = index + 1;

            // 현재 에디터에 들어있는 본문 내용 가져오기
            // 내용이 없을 수도 있으니 기본값을 ''(빈 문자열)로 처리
            var content = $scope.form.content || '';

            // 정규식으로 [[file:n ...]] 형태의 토큰을 찾기 위한 패턴을 만든다.
            //   \\[\\[        → 실제 문자열에서는 [[ 를 의미
            //   file\\s*:\\s* → "file:숫자" 앞뒤로 공백이 있어도 허용
            //   ' + n + '     → 우리가 수정하려는 파일 번호 (예: 1, 2, 3...)
            //   (?:\\s+width\\s*=\\s*\\d+)? → width=숫자 부분이 있으면 잡고, 없으면 생략 가능
            //   \\s*\\]\\]    → 마지막 ]] 앞뒤 공백 허용
            var re = new RegExp('\\[\\[file\\s*:\\s*' + n + '(?:\\s+width\\s*=\\s*\\d+)?\\s*\\]\\]');

            // 우리가 최종적으로 만들고 싶은 토큰 형태
            // 예: [[file:1 width=80]]
            var token = '[[file:' + n + ' width=' + width + ']]';

            // 만약 본문에 이미 해당 파일 번호의 토큰이 있다면
            if (re.test(content)) {
                // 기존 토큰을 우리가 만든 token으로 교체한다.
                // 즉, width 값을 새 width로 덮어쓰는 효과
                content = content.replace(re, token);
            } else {
                // 해당 파일 번호의 토큰이 본문에 전혀 없다면

                // content가 비어 있지 않으면 줄바꿈을 하나 넣고,
                // 비어 있다면 줄바꿈 없이 바로 token만 넣는다.
                // 즉, "기존 내용 + 개행 + [[file:n width=...]]" 형태로 본문 뒤에 추가
                content = (content ? content + '\n' : '') + token;
            }

            // 수정된 본문 내용을 다시 폼에 반영
            $scope.form.content = content;
        }

        // 버튼에서 호출: 토큰 수정 + 미리보기 width 반영
        $scope.setFileWidth = function (index, width) {
            // width 인자가 숫자(30, 60, 100 등)로 들어오면
            // 100 이하는 % 단위로, 100 초과는 px 단위로 쓰도록 문자열로 변환
            var w = width;
            if (typeof w === 'number') {
                if (w > 0 && w <= 100) {
                    // 0~100 => 퍼센트
                    w = w + '%'; // 예: 30 -> "30%"
                } else {
                    // 100 초과 => px
                    w = parseInt(w, 10) + 'px';
                }
            }

            // 토큰에 width 값 반영
            applyWidthToContent(index, w);

            // 미리보기용 숫자 값 저장 (퍼센트/px 상관 없이 숫자만 뽑기)
            var num = parseInt(w, 10);
            $scope.previewWidths[index] = isFinite(num) && num > 0 ? num : 100;
        };

        // 게시글 1건을 서버에서 가져와 수정 폼에 채워 넣는 함수
        function fetchOne() {
            // 로딩 중이라는 표시를 켜준다. (spinner 같은 거 표시할 때 사용)
            $scope.loading = true;

            // 요청을 보낼 URL을 담을 변수. 처음에는 null로 선언.
            let url = null;

            // 게시글 키가 숫자 타입(type === 'num')이면
            //   → /api/posts/{id} 형식의 URL로 요청
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            // 그 외(문자열 키, 예: uuid)면
            //   → /api/posts/key/{uuid} 형식의 URL로 요청
            else url = '/api/posts/key/' + encodeURIComponent(key);

            // 실제로 서버에 GET 요청을 보내는 부분
            $http
                .get(url) // 위에서 만든 URL로 GET 요청
                .then(function (res) {
                    // 서버 응답 본문(res.data)을 p라는 변수에 담는다.
                    // 만약 res.data가 없으면 빈 객체 {}를 사용.
                    const p = res.data || {};

                    // ───────────────── 파일 리스트 정리 ─────────────────

                    // ★ 서버에서 내려온 file_list_json(또는 fileListJson)을
                    //    자바스크립트 배열로 변환한다.
                    //    safeParseFileList는 JSON.parse 랑 비슷하지만,
                    //    에러가 나면 빈 배열([])을 반환해 주는 "안전한" 헬퍼 함수라고 보면 된다.
                    let fileList = safeParseFileList(p.fileListJson || p.file_list_json);

                    // ★ 예전(구) 스키마에서는 첨부파일을 "단일 파일" 형태로만 관리해서
                    //    fileUrl, fileName, fileType만 있는 경우가 있다.
                    //    그럴 때는 위에서 만든 fileList가 비어 있으므로,
                    //    이 단일 파일 정보를 이용해서 배열 형식으로 맞춰준다.
                    if ((!fileList || fileList.length === 0) && p.fileUrl) {
                        fileList = [
                            {
                                // 파일 다운로드/보기용 URL
                                url: p.fileUrl,
                                // 파일 이름 (없으면 '첨부파일'이라는 기본 이름 사용)
                                fileName: p.fileName || '첨부파일',
                                // MIME 타입 (예: image/png, application/pdf 등), 없으면 null
                                fileType: p.fileType || null,
                            },
                        ];
                    }

                    // ───────────────── 폼 데이터 세팅 ─────────────────

                    // 화면에서 수정할 폼(form)에 값을 채워 넣는다.
                    $scope.form = {
                        // 제목: 서버에서 받은 p.title, 없으면 빈 문자열
                        title: p.title || '',
                        // 내용: 서버에서 받은 p.content, 없으면 빈 문자열
                        content: p.content || '',
                        // file: "새로 업로드할 단일 파일" 자리.
                        //       실제 파일 선택은 onFileChange에서 이 값을 채운다.
                        file: null, // 새 파일은 사용자가 선택할 때만
                        // files: "여러 개 파일 업로드"를 위한 배열 자리.
                        //        역시 onFileChange에서 채워진다.
                        files: [],
                    };

                    // 메타 정보(작성자, 생성일, 첨부파일 메타 등)를 별도의 객체에 모아 둔다.
                    // 이건 주로 화면 표시용/참고용으로 사용.
                    $scope.meta = {
                        writerId: p.writerId, // 작성자 ID
                        writerName: p.writerName, // 작성자 이름
                        postId: p.postId, // 게시글 ID (숫자 PK 등)
                        uuid: p.uuid, // 게시글 UUID (문자열 PK 등)
                        createdAt: p.createdAt, // 생성 시간
                        updatedAt: p.updatedAt, // 마지막 수정 시간

                        // 구(旧) 스키마에서 쓰이던 단일 파일 정보도 그대로 보관
                        fileUrl: p.fileUrl,
                        fileType: p.fileType,
                        fileName: p.fileName,

                        // 새 스키마 기준의 "첨부파일 리스트"
                        fileList: fileList, // 첨부파일 배열
                        fileCount: fileList.length, // 첨부파일 개수
                    };

                    // ───────────────── 이미지/파일 미리보기 width 설정 ─────────────────

                    // 각 첨부파일에 대해 "미리보기 너비"를 관리하는 배열.
                    // 예: [[file:0 width=50]] 이런 토큰이 본문에 있으면 그 값(50)을 읽어서 반영.
                    $scope.previewWidths = [];

                    // fileList가 있으면 인덱스별로 한 번씩 돌면서 width 값을 계산.
                    (fileList || []).forEach(function (_, i) {
                        // getWidthFromContent(i):
                        //   본문(content)에서 [[file:i width=숫자]] 토큰을 찾아서
                        //   width 숫자를 반환해 주는 헬퍼 함수라고 보면 된다.
                        var w = getWidthFromContent(i);

                        // 토큰에서 width를 찾았으면 그 값 사용,
                        // 없으면 기본값 100을 사용.
                        $scope.previewWidths[i] = w || 100;
                    });
                })
                // then 성공/실패와 상관 없이 마지막에 무조건 실행되는 부분
                .finally(function () {
                    // 요청이 끝났으니 로딩 상태를 false로 돌려준다.
                    $scope.loading = false;
                });
        }

        // 🔥 수정: 파일까지 같이 보내는 multipart/form-data 버전 (여러 개 파일 지원)
        $scope.save = function () {
            // ▶ 저장 버튼 눌렀을 때 실행되는 함수 정의
            const title = ($scope.form.title || '').trim(); // ▶ form에 들어있는 제목을 꺼내서, null이면 ''로 바꾸고 양쪽 공백 제거
            const content = ($scope.form.content || '').trim(); // ▶ form에 들어있는 내용도 꺼내서, null 방지 후 공백 제거
            if (!title) return alert('제목을 입력하세요.'); // ▶ 제목이 비어 있으면 저장하지 않고 경고창 띄우고 함수 종료

            if ($scope.saving) return; // ▶ 이미 저장 중이면(중복 클릭 방지용 플래그) 다시 실행하지 않음
            $scope.saving = true; // ▶ 지금부터 저장 작업 시작했다고 표시 (버튼 비활성화 등에서 사용 가능)

            const fd = new FormData(); // ▶ 브라우저에서 제공하는 FormData 객체 생성 (multipart/form-data 전송용)
            fd.append('title', title); // ▶ FormData에 'title' 필드로 제목 추가
            fd.append('content', content); // ▶ FormData에 'content' 필드로 내용 추가

            const files = $scope.form.files || []; // ▶ 사용자가 선택한 파일 목록(form.files)을 꺼내고, 없으면 빈 배열 사용
            if (files && files.length > 0) {
                // ▶ files가 존재하고, 1개 이상 선택되어 있으면
                files.forEach(function (f) {
                    // ▶ 파일 배열을 하나씩 돌면서
                    fd.append('file', f); // ▶ FormData에 'file'이라는 이름으로 파일을 계속 추가(여러 개 가능)
                    //    └ 같은 key('file')로 여러 번 append하면 서버에서 배열처럼 받을 수 있음
                });
            }

            let url = null; // ▶ 요청을 보낼 URL을 담을 변수
            if (type === 'num')
                // ▶ 현재 게시글의 PK 타입이 숫자형(id 같은 숫자 PK)일 때
                url = '/api/posts/' + encodeURIComponent(key); // ▶ /api/posts/{id} 형태의 URL로 설정 (예: /api/posts/123)
            // ▶ PK가 문자열(uuid 같은 경우)일 때
            else url = '/api/posts/key/' + encodeURIComponent(key); // ▶ /api/posts/key/{uuid} 형태의 URL로 설정

            $http // ▶ AngularJS의 $http 서비스 사용해서 HTTP 요청 시작
                .put(url, fd, {
                    // ▶ PUT 메서드로 위에서 만든 url에 FormData(fd)를 전송
                    headers: { 'Content-Type': undefined }, // ▶ Content-Type을 undefined로 두면
                    //    브라우저가 자동으로 multipart/form-data + boundary를 설정해 줌
                    transformRequest: angular.identity, // ▶ Angular가 fd를 건드리지 않고, 있는 그대로 전송하게 함
                })
                .then(function () {
                    // ▶ 요청이 성공했을 때 실행되는 콜백
                    alert('수정 완료'); // ▶ “수정 완료” 알림창 띄우고
                    backToList(); // ▶ 목록 화면으로 이동하는 함수 호출 (이전에 정의되어 있음)
                })
                .catch(function (err) {
                    // ▶ 요청이 실패했을 때 실행되는 콜백
                    console.error('수정 실패', err); // ▶ 콘솔에 에러 로그 찍고
                    alert('수정 실패: ' + (err.status || '오류')); // ▶ 상태코드가 있으면 같이 보여주고, 없으면 '오류'라고 표시
                })
                .finally(function () {
                    // ▶ 성공/실패 상관없이 마지막에 항상 실행되는 부분
                    $scope.saving = false; // ▶ 저장 중 플래그를 false로 되돌림 (버튼 다시 클릭 가능하게)
                });
        };

        fetchOne(); // ▶ 컨트롤러 초기화 시점에 한 번 실행해서
        //    서버에서 해당 게시글 상세 정보를 불러오고
        //    제목/내용/기존 첨부파일 목록을 화면에 채워 넣음
    }); // ▶ app.controller('BoardEditCtrl', function (...) { ... }); 의 마지막 닫는 괄호/세미콜론

    // ───────────────── 게시글 상세 보기 컨트롤러 ─────────────────
    // src/main/resources/static/app.js 안의 BoardViewCtrl 부분
    // ───────────────── 게시글 상세 보기 컨트롤러 ─────────────────
    // src/main/resources/static/app.js 안의 BoardViewCtrl 부분
    app.controller('BoardViewCtrl', function ($scope, $http, $routeParams, $location, AuthService, $sce) {
        // 처음에 로딩 중 상태를 true로 설정 (스피너 등 표시용)
        $scope.loading = true;
        // 현재 보고 있는 게시글 데이터 객체 (서버에서 받아서 채움)
        $scope.post = null;
        // 토큰([[file:n ...]])이 치환된 HTML 버전 본문을 저장할 변수
        // renderedContent는 “원래 글 내용(content)을 HTML 형태로 변환해서 화면에 보여줄 때 쓰는 변수”
        $scope.renderedContent = null; // ← 본문 HTML 버전

        // URL 파라미터에서 게시판 코드 추출 (bus / norm / big 등, 소문자로 통일)
        const rawCode = String($routeParams.code || '').toLowerCase();
        // URL 파라미터에서 게시글 식별자(숫자 ID든, 문자열 key든) 가져오기
        const key = $routeParams.key;
        // 쿼리스트링 ?type=num | ?type=str 에서 타입을 읽고 소문자로 통일
        const type = String($location.search().type || 'str').toLowerCase(); // 'num' | 'str'

        // 📌 게시판 코드 → 목록 화면 경로 매핑
        function getListPath(code) {
            switch (code) {
                case 'bus':
                    return '/board/bus'; // 대구버스 게시판
                case 'norm':
                case 'normal':
                    return '/board/normal'; // 일반 게시판
                case 'big':
                    return '/board/big'; // 대용량 게시판 테스트
                default:
                    // 혹시 이상한 값이면 기본 대구버스 게시판으로
                    return '/board/bus';
            }
        }

        // 목록 화면으로 돌아가는 함수 (버튼에서 호출)
        function backToList() {
            // getListPath는 “게시글 목록을 가져올 때 호출할 URL(경로)을 만들어 주는 함수 이름”
            const path = getListPath(rawCode);
            $location.path(path).search({});
        }
        // HTML에서 ng-click="backToList()" 로 쓸 수 있도록 scope에 연결
        $scope.backToList = backToList;

        // ───────────────── 파일 메타 정규화 ─────────────────
        // 백엔드/DB에서 내려오는 파일 정보의 키 이름이 제각각일 수 있으므로
        // 프론트에서 쓰기 편하게 {url, fileName, fileType, size} 형식으로 통일
        // normalizeFileMeta = “파일 정보(raw)를 받아서, 프론트에서 쓰기 편한 통일된 형태로 바꿔주는 함수”
        function normalizeFileMeta(raw) {
            // null/undefined면 바로 null 리턴
            if (!raw) return null;
            // url 후보들 중 먼저 존재하는 것을 선택 (url, fileUrl, downloadUrl, path, link 등)
            const url = raw.url || raw.fileUrl || raw.downloadUrl || raw.path || raw.link || null;
            // 파일명 후보들 중 먼저 존재하는 것을 선택
            const fileName = raw.originalFilename || raw.fileName || raw.filename || raw.name || raw.originName || null;
            // 타입(MIME) 후보들 중 먼저 존재하는 것을 선택
            const fileType = raw.fileType || raw.type || raw.contentType || null;
            // 파일 크기 후보들 중 먼저 존재하는 것을 선택
            const size = raw.fileSize || raw.size || null;
            // 통일된 형태의 객체로 반환
            return { url, fileName, fileType, size };
        }

        // file_list_json 문자열을 안전하게 파싱해서 첨부파일 배열로 변환하는 함수
        // safeParseFileList = “DB에 문자열(JSON)로 저장된 파일 목록을 → ‘안전하게’ JS 배열 + 표준 구조로 바꿔주는 함수”
        function safeParseFileList(json) {
            // 값이 없으면 첨부 없음 → 빈 배열
            if (!json) return [];
            try {
                // JSON 문자열을 객체/배열로 파싱
                const v = JSON.parse(json);
                let arr = [];

                // 1) 이미 배열이면 그대로 사용
                if (Array.isArray(v)) arr = v;
                // 2) { files: [...] } 구조면 그 안의 배열 사용
                else if (v && Array.isArray(v.files)) arr = v.files;
                // 3) { list: [...] } 구조면 list 배열 사용
                else if (v && Array.isArray(v.list)) arr = v.list;
                // 4) 단일 객체면 [객체]로 감싸서 1개짜리 배열로 취급
                else if (v && typeof v === 'object') arr = [v];
                // 5) 그 외에는 비정상 → 빈 배열
                else arr = [];

                // 정규화된 첨부파일 배열 생성
                const norm = [];
                arr.forEach(function (one) {
                    // raw 메타를 표준 형태로 바꾸기
                    const m = normalizeFileMeta(one);
                    // url이 있는 경우만 유효한 첨부로 인정
                    if (m && m.url) norm.push(m);
                });
                // 정리된 첨부파일 배열 반환
                return norm;
            } catch (e) {
                // JSON 파싱 실패 시 콘솔에 경고 찍고 빈 배열 반환
                console.warn('file_list_json parse error:', e, json);
                return [];
            }
        }

        // ───────────────── 유틸 ─────────────────
        // 파일 확장자를 뽑아내는 함수 (표시용)
        $scope.getFileExt = function (fileOrName) {
            // 값이 없으면 "확장자 없음" 반환
            if (!fileOrName) return '확장자 없음';
            // 우선 문자열이라고 가정
            var name = fileOrName;
            // 객체로 들어온 경우 fileName 또는 name 필드에서 실제 파일명 추출
            if (fileOrName.fileName) name = fileOrName.fileName;
            if (fileOrName.name) name = fileOrName.name;

            // 마지막 점(.) 위치 찾기
            var idx = name.lastIndexOf('.');
            // 점이 없으면 확장자 없음
            if (idx < 0) return '확장자 없음';
            // 점 뒤의 문자열을 잘라 소문자로 리턴 (예: "PNG" → "png")
            return name.substring(idx + 1).toLowerCase();
        };

        // 파일 크기를 사람이 보기 좋은 형태로 포맷팅
        $scope.formatFileSize = function (size) {
            // 숫자가 아니거나 무한대면 "알 수 없음"
            if (typeof size !== 'number' || !isFinite(size)) return '알 수 없음';
            // 1KB 미만이면 그대로 B(Byte) 단위
            if (size < 1024) return size + ' B';
            // KB 단위 변환
            var kb = size / 1024;
            if (kb < 1024) return kb.toFixed(1) + ' KB';
            // MB 단위 변환
            var mb = kb / 1024;
            if (mb < 1024) return mb.toFixed(2) + ' MB';
            // GB 단위 변환
            var gb = mb / 1024;
            return gb.toFixed(2) + ' GB';
        };

        // 이미지인지 판단하는 함수 (첨부파일이 이미지 파일이면 true)
        $scope.isImage = function (f) {
            // 값이 없으면 이미지 아님
            if (!f) return false;
            // fileType(MIME) 소문자 버전
            var t = String(f.fileType || '').toLowerCase();
            // 파일 이름
            var name = String(f.fileName || '');
            // MIME 타입이 image/ 로 시작하면 이미지로 판단
            if (t.indexOf('image/') === 0) return true;
            // 아니면 확장자가 이미지 확장자인지 정규식으로 검사
            return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name);
        };

        // HTML 이스케이프 (본문 텍스트를 태그로 오동작하지 않게 보호)
        function escapeHtml(str) {
            // &, <, >, ", ' 을 HTML 엔티티로 치환
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // ───────────────── 본문 토큰 치환 ─────────────────
        // [[file:1 width=60]] 같은 토큰을 <img> 또는 <a> 태그로 바꾸는 함수
        // width / w 옵션을 파싱해서 스타일(width: xx%)에 반영
        function buildRenderedContent(p) {
            // 게시글이나 본문이 없으면 null 반환
            if (!p || !p.content) return null;

            // content 를 문자열로 캐스팅
            var text = String(p.content || '');

            // "[ [[file:1]]" 같은 잘못된 형태를 "[[file:1]]" 로 정리 (공백+대괄호 제거)
            text = text.replace(/\[\s*\[\s*file/gi, '[[file');

            // 첨부파일 목록 (게시글 객체에 미리 세팅해둔 attachments 사용)
            // attachments = “글에 같이 붙어오는 파일들(이미지, 문서, 압축파일 등)”
            var attachments = p.attachments || [];

            // [[file:숫자 ...]] 를 찾는 전역 정규식
            var re = /\[\[\s*file\s*:(\d+)([^\]]*)\]\]/gi;
            // 결과 HTML을 누적해서 만들 문자열
            var result = '';
            // 마지막으로 처리한 인덱스 (앞부분 일반 텍스트 잘라내는 용도)
            var lastIndex = 0;
            // 정규식 매치 결과를 담을 변수
            var m;

            // 정규식으로 본문 전체를 돌면서 토큰 하나씩 처리
            while ((m = re.exec(text)) !== null) {
                // 현재 토큰 앞에 있는 일반 텍스트 부분
                var before = text.slice(lastIndex, m.index);
                // 그 부분을 HTML escape + 줄바꿈을 <br/>로 치환해서 결과에 추가
                result += escapeHtml(before).replace(/\n/g, '<br/>');

                // m[1] = file 번호 (1부터 시작), 정수로 변환
                var n = parseInt(m[1], 10); // 파일 번호(1-base)
                // 배열 인덱스는 0부터이므로 n-1
                var idx = isNaN(n) ? -1 : n - 1;
                // 해당 첨부파일 객체 (없으면 undefined)
                var att = attachments[idx];

                // m[2]는 토큰 안의 옵션 문자열 (예: " width=60" 같은 부분)
                var paramStr = m[2] || '';
                // width=30, width=60%, w=100 등 형태를 찾는 정규식
                var widthMatch = paramStr.match(/(?:width|w)\s*=\s*([0-9]{1,4}%?)/i);
                // 캡쳐된 값이 있으면 widthVal, 없으면 null
                var widthVal = widthMatch && widthMatch[1] ? widthMatch[1] : null;

                // 인라인 스타일 문자열을 담을 변수
                var styleAttr = '';

                // 🔹 width 지정이 없는 경우 기본 100%로 설정 (본문 폭 꽉 채우기)
                if (!widthVal) {
                    widthVal = '100%';
                }

                // 값이 "%" 로 끝나면 퍼센트 단위
                if (/%$/.test(widthVal)) {
                    // 예: widthVal = "60%" → width:60% + max-width:100% + 가운데 정렬 스타일
                    styleAttr = 'style="max-width:100%;width:' + widthVal + ';height:auto;border-radius:10px;display:block;margin:0 auto;"';
                } else {
                    // 그 외에는 px 단위로 가정 (예: width=600 → 600px)
                    styleAttr = 'style="max-width:100%;width:' + parseInt(widthVal, 10) + 'px;height:auto;border-radius:10px;display:block;margin:0 auto;"';
                }

                // 해당 번호에 해당하는 첨부가 실제로 존재하고, url도 있으면
                if (att && att.url) {
                    // img src 로 쓸 안전한 URL (여기서는 그대로 사용)
                    var safeUrl = att.url;
                    // alt, 링크 텍스트로 쓸 파일명 (escape 해서 사용)
                    var safeName = escapeHtml(att.fileName || '첨부파일 ' + n);

                    // 이미지 파일이면 <img> 태그로 치환
                    if ($scope.isImage(att)) {
                        // 이미지 태그를 감싸는 div + img 태그 HTML을 result에 추가
                        result += '<div class="inline-img-wrap">' + '<img class="inline-img" src="' + safeUrl + '" alt="' + safeName + '" ' + styleAttr + '/>' + '</div>';
                    } else {
                        // 이미지가 아니면 일반 파일 다운로드 링크로 치환
                        result += '<div class="inline-file-link-wrap">' + '<a class="inline-file-link" href="' + safeUrl + '" download="' + safeName + '">' + '📎 ' + safeName + '</a>' + '</div>';
                    }
                } else {
                    // 첨부 배열에서 해당 번호를 못 찾으면, 토큰 그대로 글자로 출력
                    result += escapeHtml(m[0]);
                }

                // 마지막 처리 위치를 현재 토큰 끝으로 업데이트
                lastIndex = re.lastIndex;
            }

            // while 루프가 끝난 뒤, 마지막 토큰 이후의 나머지 일반 텍스트
            var tail = text.slice(lastIndex);
            // 역시 escape + 줄바꿈 → <br/> 처리 후 결과에 추가
            result += escapeHtml(tail).replace(/\n/g, '<br/>');

            // 완성된 HTML을 AngularJS가 신뢰할 수 있는 HTML로 표시하도록 표시(신뢰) 객체로 래핑
            return $sce.trustAsHtml(result);
        }

        // ───────────────── 게시글 로딩 ─────────────────
        // 서버에서 게시글 한 건을 가져오는 함수
        function loadOne() {
            // 로딩 시작
            $scope.loading = true;
            let url = null;
            // type이 'num'이면 /api/posts/{숫자id} 사용
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            // 그 외에는 문자열 key (uuid 등)를 사용하는 /api/posts/key/{key}
            else url = '/api/posts/key/' + encodeURIComponent(key);

            // 정해진 url로 GET 요청
            $http
                .get(url)
                .then(function (res) {
                    // 서버 응답에서 게시글 객체 추출 (없으면 빈 객체)
                    const p = res.data || {};

                    // file_list_json 또는 file_list_json 형태로 넘어온 JSON 문자열을 파싱
                    let fileList = safeParseFileList(p.fileListJson || p.file_list_json);
                    // 만약 새 스키마(file_list_json)가 비어 있고, 예전 단일 파일 스키마(fileUrl)가 있다면
                    // 그걸 기반으로 1개의 첨부파일 배열을 만들어줌 (구버전 호환)
                    if ((!fileList || fileList.length === 0) && p.fileUrl) {
                        fileList = [
                            {
                                url: p.fileUrl,
                                fileName: p.fileName || '첨부파일',
                                fileType: p.fileType || null,
                                size: p.fileSize || null,
                            },
                        ];
                    }

                    // 정리된 첨부파일 배열을 p.attachments에 담기
                    p.attachments = fileList || [];
                    // 첨부파일 개수를 fileCount에 저장 (UI에 "첨부 3개" 이런 식으로 표시용)
                    p.fileCount = p.attachments.length;

                    // scope에 게시글 전체 객체를 저장 → HTML에서 post.title 등으로 사용
                    $scope.post = p;

                    // 🔥 본문 content 안의 [[file:n width=...]] 토큰을 실제 HTML(<img>, <a>)로 바꿔서 저장
                    $scope.renderedContent = buildRenderedContent(p);
                })
                .finally(function () {
                    // 요청 성공/실패와 상관없이 로딩 종료
                    $scope.loading = false;
                });
        }

        // 현재 로그인 사용자 정보를 서버(/api/me)에서 불러오기
        AuthService.loadMe().finally(function () {
            // loadMe() 완료 후(성공/실패 관계 없이) me 정보를 scope에 세팅
            $scope.me = AuthService.getMe();
        });

        // 컨트롤러 생성 시점에 바로 게시글 1건을 로딩해서 화면에 보여주기
        loadOne();
    });

    // ───────────────── 게시판 라우트별 컨트롤러 ─────────────────
    app.controller('BoardBusCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope })); // extend:상속
        $scope.boardCode = 'BUS';
        $scope.loadPosts();
    });

    app.controller('BoardNormalCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope }));
        $scope.boardCode = 'NORM';
        $scope.loadPosts();
    });

    // ───────────────── 게시판 라우트별 컨트롤러 ─────────────────
    app.controller('BoardBusCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope })); // extend:상속
        $scope.boardCode = 'BUS';
        $scope.loadPosts();
    });

    app.controller('BoardNormalCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope }));
        $scope.boardCode = 'NORM';
        $scope.loadPosts();
    });

    app.controller('BoardBigCtrl', function ($scope, $controller, $http) {
        // Base 기능 상속
        angular.extend(this, $controller('BoardBaseCtrl', { $scope: $scope }));

        $scope.boardCode = 'BIG';

        // --- Lazy Load 설정 ---
        const CHUNK_SIZE = 100; // 스크롤 한 번 = 100개 증가
        const MAX_LIMIT = 1000; // 최대 1000개
        let desiredLoadCount = 100; // 첫 화면 = 100개
        let lastId = null; // keyset anchor
        let loadingMore = false; // 중복 요청 방지

        // BaseCtrl에서 쓰는 pageSize는 1000 고정 (페이지 이동용)
        $scope.pageSize = 1000;
        $scope.pageSizes = [1000];

        // UI에서 사용할 "전용 배열"
        // BaseCtrl.posts는 더 이상 UI에 직접 사용하지 않음!!! (중요)
        $scope.viewPosts = [];

        // ===========================================
        // BaseCtrl.loadPosts 오버라이드
        // ===========================================
        const originalLoadPosts = $scope.loadPosts;

        $scope.loadPosts = function () {
            originalLoadPosts.call($scope);

            const unwatch = $scope.$watch('posts', async function (newVal) {
                if (!Array.isArray(newVal) || newVal.length === 0) return;

                // Full 1000개 목록을 정렬 (id DESC)
                const fullList = angular.copy(newVal).sort((a, b) => b.id - a.id);

                // UI에서 쓰는 viewPosts는 우리가 직접 관리
                $scope.viewPosts = [fullList[0]];
                lastId = fullList[0].id;

                // BaseCtrl.posts 와의 연결 해제
                unwatch();

                // lazy-load로 원하는 개수(100개)까지 채움
                await loadUntil(desiredLoadCount);
            });
        };

        // ===========================================
        // desiredLoadCount 까지 chunk 로딩
        // ===========================================
        async function loadUntil(targetCount) {
            if (targetCount > MAX_LIMIT) targetCount = MAX_LIMIT;

            while ($scope.viewPosts.length < targetCount) {
                const need = targetCount - $scope.viewPosts.length;
                const size = Math.min(CHUNK_SIZE, need);

                const list = await fetchChunk(size);
                if (!list || list.length === 0) return;

                // 중복 ID 방지하면서 push
                list.forEach((item) => {
                    if (!$scope.viewPosts.some((p) => p.id === item.id)) {
                        $scope.viewPosts.push(item);
                    }
                });

                // 가장 끝 anchor 갱신
                lastId = list[list.length - 1].id;

                $scope.$applyAsync();
            }
        }

        // ===========================================
        // chunk API 요청
        // ===========================================
        function fetchChunk(size) {
            return $http
                .get('/api/big-board/chunk', {
                    params: {
                        lastId: lastId,
                        size: size,
                    },
                })
                .then((res) => res.data.list || [])
                .catch(() => []);
        }

        // ===========================================
        // 스크롤 → Lazy Load
        // ===========================================
        window.addEventListener('scroll', async function () {
            if (loadingMore) return;
            if ($scope.loading) return;

            // 화면 거의 밑에 도달
            const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;

            if (!nearBottom) return;

            // 이미 1000개면 더 로딩 X
            if (desiredLoadCount >= MAX_LIMIT) return;

            loadingMore = true;

            // 100개 증가하여 다음 목표 설정
            desiredLoadCount = Math.min(desiredLoadCount + CHUNK_SIZE, MAX_LIMIT);

            await loadUntil(desiredLoadCount);

            loadingMore = false;
        });

        // ===========================================
        // 처음 로딩
        // ===========================================
        $scope.loadPosts();
    });

    // ───────────────── Roles ─────────────────
    app.controller('RolesCtrl', function ($scope, $http, $timeout, AuthService) {
        $scope.isAdmin = false;
        $scope.loading = true;
        $scope.saving = false;
        $scope.rows = [];
        $scope.sourceRows = [];
        $scope.msg = '';
        $scope.msgType = 'info';

        $scope.q = { type: 'username', keyword: '' };

        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10;
        $scope.page = 0;
        $scope.filtered = [];
        $scope.paged = [];
        $scope.pages = 1;

        function notify(type, text, ms) {
            $scope.msgType = type;
            $scope.msg = text;
            if (ms) $timeout(() => ($scope.msg = ''), ms);
        }

        function num(v, def) {
            const n = parseInt(v, 10);
            return isFinite(n) ? n : def == null ? 0 : def;
        }

        $scope.pageSizeNum = function () {
            return Math.max(1, num($scope.pageSize, 10));
        };

        $scope.pagesCount = function () {
            const total = ($scope.filtered || []).length;
            const size = $scope.pageSizeNum();
            return Math.max(1, Math.ceil(total / size));
        };

        function matchRow(row, q) {
            const kw = String(q.keyword || '')
                .trim()
                .toLowerCase();
            if (!kw) return true;

            if (q.type === 'username') {
                const userStr = [row.username, row.userId, row.name, row.email].filter(Boolean).join(' ').toLowerCase();
                return userStr.indexOf(kw) >= 0;
            }

            if (q.type === 'role') {
                const roleStr = String(row.role || 'ROLE_USER').toLowerCase();
                return roleStr.indexOf(kw) >= 0;
            }

            return true;
        }

        function repage() {
            const size = $scope.pageSizeNum();
            const pages = $scope.pagesCount();

            if ($scope.page >= pages) $scope.page = pages - 1;
            if ($scope.page < 0) $scope.page = 0;

            const start = $scope.page * size;
            $scope.paged = ($scope.filtered || []).slice(start, start + size);
            $scope.rows = $scope.paged;
            $scope.pages = pages;
        }

        function refilter() {
            $scope.filtered = ($scope.sourceRows || []).filter((r) => matchRow(r, $scope.q));
            $scope.page = 0;
            repage();
        }

        $scope.applySearch = function () {
            refilter();
        };

        $scope.resetSearch = function () {
            $scope.q = { type: 'username', keyword: '' };
            refilter();
        };

        $scope.onSize = function () {
            $scope.page = 0;
            repage();
        };

        $scope.first = function () {
            if ($scope.page > 0) {
                $scope.page = 0;
                repage();
            }
        };

        $scope.prev = function () {
            if ($scope.page > 0) {
                $scope.page--;
                repage();
            }
        };

        $scope.next = function () {
            const pages = $scope.pagesCount();
            if ($scope.page < pages - 1) {
                $scope.page++;
                repage();
            }
        };

        $scope.last = function () {
            const pages = $scope.pagesCount();
            if ($scope.page < pages - 1) {
                $scope.page = pages - 1;
                repage();
            }
        };

        $scope.go = function (p) {
            const pages = $scope.pagesCount();
            p = num(p, 0);
            if (p >= 0 && p < pages && p !== $scope.page) {
                $scope.page = p;
                repage();
            }
        };

        $scope.pageRange = function () {
            const pages = $scope.pagesCount();
            const cur = num($scope.page, 0);
            const arr = [];
            const start = Math.max(0, cur - 2);
            const end = Math.min(pages - 1, cur + 2);
            for (let i = start; i <= end; i++) arr.push(i);
            return arr;
        };

        $scope.$watchGroup(['pageSize', () => ($scope.filtered || []).length], repage);

        $scope.load = function () {
            $scope.loading = true;
            $http
                .get('/api/admin/roles')
                .then((res) => {
                    $scope.sourceRows = Array.isArray(res.data) ? res.data : [];
                    $scope.rows = $scope.sourceRows.slice(0);
                    notify('info', '권한 목록을 불러왔습니다.', 1200);
                    refilter();
                })
                .catch((err) => {
                    if (err && err.status === 403) notify('error', '관리자 전용 페이지입니다.', 2500);
                    else notify('error', '권한 목록을 불러오지 못했습니다.', 2500);

                    $scope.sourceRows = [];
                    $scope.rows = [];
                    $scope.filtered = [];
                    $scope.paged = [];
                    $scope.pages = 1;
                })
                .finally(() => {
                    $scope.loading = false;
                });
        };

        $scope.changeRole = function (row, newRole) {
            if (!row || !row.username || !$scope.isAdmin) return;

            const target = String(newRole || '').toUpperCase();
            if (target !== 'ROLE_ADMIN' && target !== 'ROLE_USER') return;

            $scope.saving = true;

            $http
                .put('/api/roles/' + encodeURIComponent(row.username), { role: target })
                .then(() => {
                    row.role = target;
                    notify('success', '저장되었습니다.', 1200);

                    const idx = ($scope.sourceRows || []).findIndex((r) => r.username === row.username);
                    if (idx >= 0) $scope.sourceRows[idx].role = target;

                    refilter();
                })
                .catch((err) => notify('error', err && err.data ? err.data : '저장 중 오류가 발생했습니다.', 2500))
                .finally(() => {
                    $scope.saving = false;
                });
        };

        AuthService.loadMe(true).finally(() => {
            $scope.isAdmin = isAdminFrom(AuthService.getMe());
            if ($scope.isAdmin) $scope.load();
            else {
                $scope.loading = false;
                $scope.sourceRows = [];
                $scope.rows = [];
                $scope.filtered = [];
                $scope.paged = [];
                $scope.pages = 1;
            }
        });
    });

    // ───────────────── DB Users ─────────────────
    app.controller('DbUsersCtrl', function ($scope, $http, $q, $location, AuthService) {
        $scope.isAdmin = false;

        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';

        $scope.q = { type: 'username', keyword: '' };

        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10;
        $scope.page = 0;
        $scope.pages = 1;
        $scope.filtered = [];
        $scope.paged = [];

        function toIntLocal(v, def) {
            if (typeof v === 'number' && isFinite(v)) return v;
            const n = parseInt(v, 10);
            return isFinite(n) ? n : def == null ? 0 : def;
        }

        function setUserStatus(type, msg, ms) {
            $scope.userStatusType = type;
            $scope.userStatusMessage = msg;
            if (ms) setTimeout(() => $scope.$applyAsync(() => ($scope.userStatusMessage = '')), ms);
        }

        function buildKeySet(obj) {
            if (!obj) return new Set();
            return new Set([obj.user_id, obj.userId, obj.id, obj.email, obj.username, obj.name].filter(Boolean).map((s) => String(s).trim().toLowerCase()));
        }

        function makeRoleIndex(roleRows) {
            const idx = new Map();
            (roleRows || []).forEach((r) => buildKeySet(r).forEach((k) => idx.set(k, { role: r.role })));
            return idx;
        }

        function attachRolesToUsers(users, roleIndex) {
            (users || []).forEach((u) => {
                let matched = null;
                buildKeySet(u).forEach((k) => {
                    if (!matched && roleIndex.has(k)) matched = roleIndex.get(k);
                });
                const role = matched ? matched.role : null;
                u._role = role;
                u._isAdmin = !!(role && String(role).toUpperCase().includes('ADMIN'));
                u.roleLabel = roleToLabel(role);
                u.roleClass = roleToClass(role);
            });
        }

        function matchUser(u, q) {
            const kw = String(q.keyword || '')
                .trim()
                .toLowerCase();
            if (!kw) return true;

            if (q.type === 'username') {
                const userStr = [u.name, u.username, u.user_id, u.userId, u.id].filter(Boolean).join(' ').toLowerCase();
                return userStr.indexOf(kw) >= 0;
            }
            if (q.type === 'email') {
                return String(u.email || '')
                    .toLowerCase()
                    .includes(kw);
            }
            if (q.type === 'phone') {
                const phoneStr = [u.phone, u.tel, u.phoneNumber].filter(Boolean).join(' ').toLowerCase();
                return phoneStr.indexOf(kw) >= 0;
            }
            if (q.type === 'role') {
                const roleRaw = String(u._role || u.role || '').toLowerCase();
                const roleLabel = String(u.roleLabel || '').toLowerCase();
                return roleRaw.indexOf(kw) >= 0 || roleLabel.indexOf(kw) >= 0;
            }
            return true;
        }

        function repage() {
            const size = Math.max(1, toIntLocal($scope.pageSize, 10));
            const total = ($scope.filtered || []).length;
            $scope.pages = Math.max(1, Math.ceil(total / size));

            if ($scope.page >= $scope.pages) $scope.page = $scope.pages - 1;
            if ($scope.page < 0) $scope.page = 0;

            const start = $scope.page * size;
            $scope.paged = ($scope.filtered || []).slice(start, start + size);
        }

        function refilter() {
            $scope.filtered = ($scope.users || []).filter((u) => matchUser(u, $scope.q));
            $scope.page = 0;
            repage();
        }

        $scope.applySearch = function () {
            refilter();
        };

        $scope.resetSearch = function () {
            $scope.q = { type: 'username', keyword: '' };
            refilter();
        };

        $scope.onSize = function () {
            $scope.pageSize = toIntLocal($scope.pageSize, 10);
            $scope.page = 0;
            repage();
        };

        $scope.first = function () {
            if ($scope.page > 0) {
                $scope.page = 0;
                repage();
            }
        };

        $scope.prev = function () {
            if ($scope.page > 0) {
                $scope.page--;
                repage();
            }
        };

        $scope.next = function () {
            if ($scope.page < $scope.pages - 1) {
                $scope.page++;
                repage();
            }
        };

        $scope.last = function () {
            if ($scope.page < $scope.pages - 1) {
                $scope.page = $scope.pages - 1;
                repage();
            }
        };

        $scope.go = function (p) {
            p = toIntLocal(p, 0);
            if (p >= 0 && p < $scope.pages && p !== $scope.page) {
                $scope.page = p;
                repage();
            }
        };

        $scope.pageRange = function () {
            const arr = [];
            const start = Math.max(0, $scope.page - 2);
            const end = Math.min($scope.pages - 1, $scope.page + 2);
            for (let i = start; i <= end; i++) arr.push(i);
            return arr;
        };

        $scope.$watchGroup(['page', 'pageSize', () => ($scope.filtered || []).length], repage);

        $scope.loadUsers = function () {
            if (!$scope.isAdmin) return;

            setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');

            const usersP = $http.get('/user').then((res) => normalizeList(res.data));
            const rolesP = $http
                .get('/api/roles')
                .then((res) => (Array.isArray(res.data) ? res.data : []))
                .catch(() => []);

            $q.all([usersP, rolesP])
                .then(function ([users, roles]) {
                    attachRolesToUsers(users, makeRoleIndex(roles));
                    $scope.users = users;
                    setUserStatus('success', '👤 사용자 ' + $scope.users.length + '명 불러왔습니다.', 1500);
                    refilter();
                })
                .catch(function () {
                    setUserStatus('error', '❌ 사용자 목록을 불러오지 못했습니다.', 2500);
                });
        };

        $scope.startEdit = function (u) {
            if (!$scope.isAdmin) return;
            u._editing = true;
            u._editName = u.name;
            u._editPhone = u.phone || u.tel || u.phoneNumber || '';
            u._editEmail = u.email;
        };

        $scope.cancelEdit = function (u) {
            if (!$scope.isAdmin) return;
            u._editing = false;
            u._editName = '';
            u._editPhone = '';
            u._editEmail = '';
        };

        $scope.saveEdit = function (u) {
            if (!$scope.isAdmin) return;

            const idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return setUserStatus('error', 'ID를 찾을 수 없어 수정할 수 없습니다.', 2000);

            const payload = {};

            const name = (u._editName || '').trim();
            const phone = (u._editPhone || '').trim();
            const email = (u._editEmail || '').trim();

            if (name && name !== u.name) payload.name = name;
            if (phone && phone !== (u.phone || u.tel || u.phoneNumber)) payload.phone = phone;
            if (email && email !== u.email) {
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);
                payload.email = email;
            }

            if (!Object.keys(payload).length) return $scope.cancelEdit(u);

            setUserStatus('info', '⏳ 수정 중... (ID: ' + idKey + ')', 0);
            $http
                .put('/user/' + encodeURIComponent(idKey), payload)
                .then(function (res) {
                    const updated = res.data || {};
                    u.name = updated.name ?? name ?? u.name;
                    u.phone = updated.phone ?? phone ?? u.phone;
                    u.email = updated.email ?? email ?? u.email;

                    $scope.cancelEdit(u);
                    setUserStatus('success', '✅ 수정 완료 (ID: ' + idKey + ')', 1500);
                    refilter();
                })
                .catch(function () {
                    setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };

        $scope.deleteUser = function (u) {
            if (!$scope.isAdmin) return;

            const idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return setUserStatus('error', 'ID를 찾을 수 없어 삭제할 수 없습니다.', 2000);

            if (!confirm('정말로 삭제할까요? (ID: ' + idKey + ')')) return;

            $http
                .delete('/user/' + encodeURIComponent(idKey))
                .then(function () {
                    $scope.users = $scope.users.filter((row) => (row.user_id || row.userId || row.id) !== idKey);
                    setUserStatus('success', '🗑️ 삭제 완료 (ID: ' + idKey + ')', 1500);
                    refilter();
                })
                .catch(function () {
                    setUserStatus('error', '❌ 삭제에 실패했습니다.', 2500);
                });
        };

        $scope.goToNew = function () {
            if ($scope.isAdmin) $location.path('/users/new');
        };

        AuthService.loadMe(true).finally(() => {
            $scope.isAdmin = isAdminFrom(AuthService.getMe());
            if ($scope.isAdmin) $scope.loadUsers();
        });
    });

    // ───────────────── UsersNew ─────────────────
    app.controller('UsersNewCtrl', function ($scope, $http, $q, $location) {
        $scope.rows = [{ user_id: '', name: '', phone: '', email: '' }];
        $scope.saving = false;

        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const uidRe = /^[A-Za-z0-9_]{1,16}$/;

        $scope.addRow = function () {
            $scope.rows.push({ user_id: '', name: '', phone: '', email: '' });
        };

        $scope.removeRow = function (i) {
            $scope.rows.splice(i, 1);
            if ($scope.rows.length === 0) $scope.addRow();
        };

        $scope._touched = {};
        $scope.touch = function (i, field) {
            ($scope._touched[i] = $scope._touched[i] || {})[field] = true;
        };

        function rowValid(r) {
            if (!r) return false;
            if (!(r.name && r.name.trim())) return false;
            if (!(r.email && emailRe.test(r.email.trim()))) return false;
            if (r.user_id && !uidRe.test(r.user_id.trim())) return false;
            return true;
        }

        $scope.allValid = function () {
            return $scope.rows.every(rowValid);
        };

        $scope.saveAll = function (frm) {
            if (frm.$invalid || !$scope.allValid() || $scope.saving) return;

            $scope.saving = true;
            const tasks = $scope.rows.map(function (r) {
                const payload = {
                    name: (r.name || '').trim(),
                    phone: (r.phone || '').trim() || null,
                    email: (r.email || '').trim(),
                };
                const uid = (r.user_id || '').trim();
                if (uid) {
                    payload.user_id = uid;
                    payload.userId = uid;
                }
                return $http.post('/user', payload);
            });

            $q.all(tasks)
                .then(function () {
                    alert('저장 완료!');
                    $location.path('/db-users');
                })
                .catch(function (e) {
                    console.error(e);
                    alert('일부 저장 실패. 콘솔을 확인하세요.');
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };

        $scope.goBack = function () {
            $location.path('/db-users');
        };
    });

    // ───────────────── Demo ─────────────────
    app.controller('DemoController', function ($http) {
        var vm = this;
        vm.result = '(아직 요청 전)';

        vm.load = function () {
            $http
                .get('/api/users')
                .then(function (res) {
                    vm.result = res.data;
                })
                .catch(function (err) {
                    vm.result = err.data || err;
                });
        };
    });
})();
