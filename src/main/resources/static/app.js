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
            // ★★★ 게시글 '수정 전용' 화면 (분리 페이지)
            //     예) #/board/bus/edit/num/42  또는  #/board/bus/edit/str/550e8400-...
            .when('/board/:code/edit/:type/:key', {
                templateUrl: '/tpl/board/edit.html',
                controller: 'BoardEditCtrl',
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
        //   예) <a href="/board"> → '#/board' 로 라우팅
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
                        const [k, v] = kv.split('=');
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
            const params = { pageNo: 1, numOfRows: 500 };
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
                    setTimed($scope, 'statusType', 'statusMessage', 'success', `✅ ${$scope.items.length}개의 데이터를 불러왔습니다.`, 1500, $timeout);
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
            $scope.filteredItems = $scope.items.filter((item) => ((item.bsNm || '') + '').toLowerCase().indexOf(kw) >= 0);
            setTimed(
                $scope,
                'statusType',
                'statusMessage',
                $scope.filteredItems.length ? 'success' : 'error',
                $scope.filteredItems.length ? `✅ '${($scope.keyword || '').trim()}' 관련 ${$scope.filteredItems.length}건을 찾았습니다.` : `❗ '${($scope.keyword || '').trim()}'에 대한 결과가 없습니다.`,
                1500,
                $timeout
            );
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
                    setUserStatus('success', `👤 사용자 ${$scope.users.length}명 불러왔습니다.`, 1500);
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
                    setUserStatus('success', `✅ 추가 완료 (ID: ${created.user_id || created.userId || created.id})`, 1500);
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

            setUserStatus('info', `⏳ 수정 중... (ID: ${idKey})`);
            $http
                .put('/user/' + encodeURIComponent(idKey), payload)
                .then(function (res) {
                    const updated = res.data || {};
                    u.name = updated.name ?? name ?? u.name;
                    u.phone = updated.phone ?? phone ?? u.phone;
                    u.email = updated.email ?? email ?? u.email;
                    $scope.cancelEdit(u);
                    setUserStatus('success', `✅ 수정 완료 (ID: ${idKey})`, 1500);
                })
                .catch(function () {
                    setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };

        $scope.deleteUser = function (u) {
            const idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return setUserStatus('error', 'ID를 찾을 수 없어 삭제할 수 없습니다.', 2000);
            if (!confirm(`정말로 삭제할까요? (ID: ${idKey})`)) return;
            $http
                .delete('/user/' + encodeURIComponent(idKey))
                .then(function () {
                    $scope.users = $scope.users.filter((row) => (row.user_id || row.userId || row.id) !== idKey);
                    setUserStatus('success', `🗑️ 삭제 완료 (ID: ${idKey})`, 1500);
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
    app.controller('BoardBaseCtrl', function ($scope, $http, AuthService) {
        $scope.posts = [];
        $scope.loading = false;
        $scope.newPost = { title: '', content: '', files: null }; // ← 파일 필드 추가
        $scope.showComposer = false;

        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10;
        $scope.page = 0;
        $scope.total = 0;
        $scope.pages = 0;

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

        // ──────── [ADD] 검색 창 토글/닫기 ────────
        $scope.searchOpen = false; // 검색 패널(툴바) 열림/닫힘 상태를 보관하는 플래그. 초깃값은 닫힘(false).

        $scope.toggleSearch = function (open) {
            // 검색 패널을 토글(또는 지정한 상태로) 여닫는 함수.
            $scope.searchOpen =
                typeof open === 'boolean' // 인자로 불린이 왔으면 그 값 그대로 쓰고,
                    ? open // (true/false 명시 제어)
                    : !$scope.searchOpen; // 아니면 현재 상태를 반전시킴(토글).
            if ($scope.searchOpen) {
                // 패널이 이제 열렸다면,
                setTimeout(function () {
                    // setTimeout은 **“지정한 시간(ms) 뒤에 함수를 한 번 실행”**시키는 브라우저/Node.js 내장 타이머
                    // DOM 렌더링이 완료된 다음에 실행하려고 0ms 지연 큐에 넣음.
                    // getElementById()는 HTML 문서 안에서 특정 id를 가진 요소(DOM 엘리먼트)를 찾아오는 함수
                    var el = document.getElementById('board-search-input'); // 검색 인풋 DOM 엘리먼트를 id로 가져오고,
                    if (el) el.focus(); // 존재하면 포커스를 줘서 바로 입력할 수 있게 함.
                }, 0);
            }
        };

        $scope.closeSearch = function (resetAlso) {
            // 검색 패널을 닫는 함수.
            if (resetAlso) $scope.resetSearch(); // 필요하면 검색 조건까지 초기화(별도 정의된 resetSearch 호출 전제).
            $scope.searchOpen = false; // 패널 상태를 닫힘으로 설정.
        };

        $scope.onSearchKey = function ($event) {
            // 검색 입력창에서 키 이벤트를 처리하는 핸들러.
            if ($event && $event.which === 13)
                // Enter 키(키코드 13)를 눌렀다면,
                $scope.applySearch(); // 검색 적용 함수 실행(별도 정의된 applySearch 호출 전제).
        }; // → 필드에서 엔터 치면 바로 검색 실행 UX.

        $scope.searchActive = function () {
            // 현재 검색 조건이 “실제로 활성”인지 판단.
            const kw = String($scope.q.keyword || '').trim(); // 키워드를 문자열로 안전 변환 후 좌우 공백 제거.
            return $scope.q.type === 'time' // 검색 타입이 'time'이면
                ? $scope.q.from || $scope.q.to // from 또는 to 중 하나라도 지정되어 있으면 활성(true)
                : !!kw; // 그 외 타입('author','content' 등)은 키워드가 비어있지 않으면 활성.
        }; // → 이 함수는 이제 "검색 조건 유무" 체크만 하고, 실제 필터링은 DAO/SQL에서 수행.

        // 🔍 검색 적용: 검색어가 입력되면 첫 페이지부터 다시 게시글을 로드
        $scope.applySearch = function () {
            $scope.page = 0; // 페이지 번호를 0(첫 페이지)으로 초기화
            $scope.loadPosts(); // 게시글 목록 로드 함수 호출
        };

        // 🔄 검색 초기화: 검색 조건을 기본값으로 되돌리고 첫 페이지 로드
        $scope.resetSearch = function () {
            $scope.q = {
                // 검색 조건 객체 초기화
                type: 'author', // 기본 검색 기준은 작성자(author)
                keyword: '', // 검색어 초기화
                from: null, // 시작일 초기화
                to: null, // 종료일 초기화
            };
            $scope.page = 0; // 페이지 번호를 0으로 초기화
            $scope.loadPosts(); // 게시글 목록 다시 로드
        };

        // 👤 로그인 사용자 정보 불러오기 (AuthService에서 현재 로그인한 사용자 정보 요청)
        AuthService.loadMe().finally(() => {
            $scope.me = AuthService.getMe(); // 가져온 사용자 정보를 $scope.me에 저장
        });

        // ✏️ 게시글 수정 가능 여부 체크 함수
        function canEditPost(p) {
            // 로그인한 사용자가 있고, 관리자이거나 자신이 작성한 글인 경우 true 반환
            return $scope.me && ($scope.me.isAdmin || $scope.me.username === p.writerId);
        }

        // 💬 댓글 수정 가능 여부 체크 함수
        function canEditComment(c) {
            // 로그인한 사용자가 있고, 관리자이거나 자신이 작성한 댓글인 경우 true 반환
            return $scope.me && ($scope.me.isAdmin || $scope.me.username === c.writerId);
        }

        // 🧩 게시글의 고유 키(숫자 또는 문자열) 판별 함수
        function resolvePostKey(p) {
            // postId가 숫자이면 type='num', key=postId로 반환
            if (isNum(p.postId)) return { type: 'num', key: p.postId };

            // 가능한 후보 키들을 배열에 담고, 비어있지 않은 문자열만 필터링
            const candidates = [p.postKey, p.postIdStr, p.post_uuid, p.postUuid, p.uuid, p.id, p.key].filter(isNonEmptyStr);

            // 후보가 있으면 첫 번째 값을 key로 반환
            if (candidates.length) return { type: 'str', key: candidates[0] };

            // 어떤 키도 없을 경우 'none' 반환
            return { type: 'none', key: null };
        }

        // 🪪 게시글 고유 UID 생성 함수
        function makePostUid(p, idx) {
            // 여러 가능한 ID 후보 중 비어있지 않은 문자열만 필터링
            const cand = [isNum(p.postId) ? String(p.postId) : null, isNum(p.id) ? String(p.id) : null, p.post_uuid, p.postUuid, p.uuid, p.idStr, p.postIdStr, p.key, p._key != null ? String(p._key) : null].filter(isNonEmptyStr);

            // 후보가 있으면 첫 번째 사용
            if (cand.length) return cand[0];

            // 없으면 임시 UID 생성 (시간 + 랜덤값)
            return 'tmp-' + Date.now() + '-' + (idx == null ? Math.random().toString(36).slice(2) : idx);
        }

        // 📥 게시글 목록 로드 함수
        //  ➜ **중요 변경점**: 더 이상 JS에서 리스트를 필터링하지 않고,
        //     검색 조건(type/keyword/from/to)을 그대로 서버로 넘겨서
        //     DAO(SQL)에서 WHERE 조건으로 필터링하도록 변경.
        $scope.loadPosts = function () {
            // 게시판 코드가 없으면 종료 (boardCode는 어떤 게시판인지 구분)
            if (!$scope.boardCode) return;

            $scope.loading = true; // 로딩 상태 활성화 (로딩 스피너 등 표시용)

            // 요청 파라미터 객체 정의 (페이지네이션은 항상 서버에서 처리)
            const params = {
                page: $scope.page, // 0-based 페이지 번호
                size: toInt($scope.pageSize, 10), // 페이지 크기
            };

            // 📅 검색 타입이 기간(time)인 경우 날짜 범위를 파라미터로 추가
            if ($scope.q.type === 'time') {
                // type = 'time' 으로 넘겨서 서버에서 "기간 검색"임을 인식할 수 있게 함
                params.type = 'time';
                if ($scope.q.from) params.from = $scope.q.from; // 시작일 (예: '2025-11-10')
                if ($scope.q.to) params.to = $scope.q.to; // 종료일
            }
            // 🔤 키워드 기반 검색인 경우
            else {
                const kw = ($scope.q.keyword || '').trim();
                if (kw) {
                    // type: author / content / author_content 등
                    params.type = $scope.q.type || 'author';
                    // keyword: 실제 검색어 문자열
                    params.keyword = kw;
                }
            }

            $http
                .get(
                    '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', // ① 요청 보낼 URL 문자열
                    { params } // ② 쿼리스트링으로 붙일 파라미터들
                )
                .then((res) => {
                    // ③ 요청이 성공했을 때 실행되는 콜백
                    const data = res.data || {}; // ④ 응답 본문(res.data)이 없으면 빈 객체로 방어
                    const list =
                        // ⑤ 여기서부터 응답 구조에 따라 "실제 목록 배열"만 뽑아내는 부분
                        Array.isArray(data.content)
                            ? data.content // ⑥ data.content가 배열이면 그걸 리스트로 사용 (Spring Page 스타일)
                            : Array.isArray(data.rows)
                            ? data.rows // ⑦ data.rows가 배열이면 그걸 사용 (rows 형태 응답 지원)
                            : Array.isArray(data.list)
                            ? data.list // ⑧ data.list가 배열이면 그걸 사용 (list 형태 응답 지원)
                            : Array.isArray(data)
                            ? data // ⑨ data 자체가 배열이면 그걸 사용 (응답이 바로 배열인 경우)
                            : []; // ⑩ 위에 모두 해당 안 되면 그냥 빈 배열 사용 (에러 방지용 기본값)

                    const src = Array.isArray(list) ? list : [];

                    // 🔁 서버에서 이미 WHERE + LIMIT + OFFSET으로 필터링/페이징 된 리스트를 그대로 사용
                    //    (JS에서 matchPostRow/filterAndSlice로 다시 필터링하지 않음)
                    $scope.posts = src.map((p, i) => {
                        const r = resolvePostKey(p); // 게시글 식별 키(숫자/문자) 판별 및 추출
                        p._keyType = r.type;
                        p._key = r.key;
                        p._uid = makePostUid(p, i);
                        return p;
                    });

                    // ─── 서버 페이지/전체 수치 동기화 ───
                    // 현재 페이지/페이지 크기
                    $scope.page =
                        typeof data.page === 'number'
                            ? data.page // 1순위: data.page
                            : typeof data.number === 'number'
                            ? data.number // 2순위: data.number
                            : $scope.page; // 없으면 기존 유지

                    $scope.pageSize = toInt(
                        typeof data.size === 'number' ? data.size : $scope.pageSize, // 서버 size 우선
                        10
                    );

                    // 총합/총페이지 robust 파싱
                    const hasTotal =
                        typeof data.total === 'number' || // 1) 응답 객체 data에
                        typeof data.totalElements === 'number'; //    - data.total 또는 data.totalElements 중

                    const serverTotal =
                        typeof data.total === 'number'
                            ? data.total // 2) 우선순위 1: data.total 필드가 숫자면 그대로 사용.
                            : data.totalElements; //    그렇지 않으면 data.totalElements(Spring Page 스타일)를 사용.

                    const serverTotalPages =
                        typeof data.totalPages === 'number'
                            ? data.totalPages // 3) 우선순위 1: data.totalPages(페이지 개수)가 있으면 사용.
                            : typeof data.pages === 'number'
                            ? data.pages //    우선순위 2: totalPages 대신 pages라는 이름으로 올 수도 있으므로 체크.
                            : undefined; //    둘 다 없으면 "정의되지 않음"(undefined)으로 둠.

                    if (hasTotal) {
                        // total 또는 totalElements가 있을 때
                        $scope.total = serverTotal; // 4) 서버가 알려준 total(또는 totalElements)을 그대로 전체 개수로 채택.
                        $scope.pages = Math.max(
                            1, //    최소 1페이지는 보장(0페이지는 말이 안 됨)
                            Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10)))
                        );
                    } else if (serverTotalPages !== undefined) {
                        // totalElements 없이 totalPages만 있을 때
                        $scope.pages = Math.max(1, serverTotalPages);

                        $scope.total = $scope.pages * Math.max(1, toInt($scope.pageSize, 10));
                    } else {
                        // 어떤 메타도 없으면 현재 목록 길이 기준으로 보수 계산
                        const curLen = Array.isArray(src) ? src.length : 0;
                        $scope.total = Math.max($scope.total || 0, curLen * Math.max(1, toInt($scope.pageSize, 10)));
                        $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
                    }
                })
                .catch(() => {
                    // HTTP 요청이 실패한 경우(네트워크/서버 에러 등)
                    $scope.posts = []; // 게시글 목록은 빈 배열로
                    $scope.total = 0; // 총 건수 0
                    $scope.pages = 1; // 페이지 수는 최소 1로 보정 (UI 깨지지 않게)
                })
                .finally(() => {
                    // 성공/실패 상관없이 마지막에 항상 실행
                    $scope.loading = false; // 로딩 상태 해제 → 스피너/버튼 비활성화 풀어줌
                });
        };

        $scope.reload = function () {
            $scope.loadPosts();
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

        // ⭐ 여기 수정됨: 최소 1페이지 보장 + 첫 페이지(0페이지)에서도 숫자 버튼이 항상 보이도록 보정
        $scope.pageRange = function () {
            // 전체 페이지 수
            var totalPages = parseInt($scope.pages, 10);
            if (!isFinite(totalPages) || totalPages < 1) totalPages = 1;

            // 현재 페이지 (0 기반)
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
            // 특정 게시글 p의 댓글 영역 열기/닫기 토글
            p._showComments = !p._showComments; // 현재 표시 상태를 반전
            if (p._showComments && !p._commentsLoaded) $scope.loadComments(p); // 처음 열 때만 서버에서 댓글을 로드
        };

        function decorateComments(arr) {
            // 댓글 배열에 화면용 보조 필드를 붙이는 함수
            const baseTs = Date.now(); // 임시 uid 생성에 쓸 기준 타임스탬프
            return (arr || []).map((c, i) => {
                // 안전하게 배열화 후 각 댓글 가공
                if (!c) return c; // 방어: null/undefined면 그대로 반환
                c._uid = (c.uuid && 'c-' + c.uuid) || (typeof c.commentId === 'number' && isFinite(c.commentId) && 'c-' + c.commentId) || 'c-tmp-' + baseTs + '-' + i;
                c._replying = false; // 대댓글 입력창 표시 상태(기본 숨김)
                c._replyText = ''; // 대댓글 입력값(초기 공란)
                return c; // 가공된 댓글 반환
            });
        }

        $scope.loadComments = function (p) {
            // 게시글 p의 댓글 목록을 서버에서 불러오기
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
                .put('/api/comments/key/' + encodeURIComponent(c.uuid), { content: newText })
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

        // 작성 (※ JSON → multipart/form-data 전송으로 변경)
        // app.js 의 BoardBaseCtrl 안
        // ✅ 새 게시글(폴더/파일/일반글) 생성 함수
        $scope.createPost = function () {
            // newPost 객체가 없다면 빈 객체로 초기화 (안전장치)
            if (!$scope.newPost) $scope.newPost = {};

            // 제목과 내용을 문자열로 가져온 뒤, 앞뒤 공백 제거
            const title = ($scope.newPost.title || '').trim();
            const content = ($scope.newPost.content || '').trim();

            // 제목이 비어 있으면 경고 후 함수 종료
            if (!title) {
                alert('제목을 입력하세요.');
                return;
            }

            // 체크박스 등에서 넘어온 isFolder 값을 boolean으로 변환
            const isFolder = !!$scope.newPost.isFolder;
            // 폴더 이름이 있을 경우 공백 제거 후 사용
            const folderName = ($scope.newPost.folderName || '').trim();

            // 🔹 newPost 를 files 배열로 사용하도록 변경
            //    (file-model="newPost.files" 로 연결되어 있음)
            const files = $scope.newPost.files || [];
            const file = files && files.length ? files[0] : null; // 현재는 첫 번째 파일만 업로드

            // 🔹 HTML 파일 인풋 요소를 직접 가져옴 (id="postFile")
            //    업로드 후 값을 비워 주기 위해 사용
            const fileInput = document.getElementById('postFile');

            // 서버에 multipart/form-data로 보낼 FormData 객체 생성
            const fd = new FormData();
            // 제목을 FormData에 추가
            fd.append('title', title);
            // 내용을 FormData에 추가
            fd.append('content', content);

            if (isFolder) {
                // 🔹 폴더 게시글일 때: 파일 업로드는 하지 않고 폴더 정보만 전송
                fd.append('isFolder', 'true'); // 서버에서 폴더 여부를 인식하기 위한 플래그
                if (folderName) {
                    // 폴더 이름이 있다면 함께 전송
                    fd.append('folderName', folderName);
                }
            } else {
                // 🔹 일반 게시글 + 파일/이미지 업로드 모드
                if (file) {
                    // 사용자가 선택한 파일이 있다면 FormData에 'file'로 추가
                    fd.append('file', file);
                }
            }

            // 로딩 상태 ON: 버튼 비활성화, 스피너 표시 등에 사용
            $scope.loading = true;

            // 게시글/폴더/파일을 서버에 전송 (POST 요청)
            $http
                .post(
                    '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', // 게시판 코드에 맞는 URL
                    fd, // FormData 전송
                    {
                        // Content-Type을 undefined로 두면 브라우저가 boundary 포함한 multipart/form-data 자동 설정
                        headers: { 'Content-Type': undefined },
                        // Angular가 데이터를 건드리지 않고 그대로 보내도록 설정
                        transformRequest: angular.identity,
                    }
                )
                .then(function () {
                    // 요청이 성공했을 때 실행
                    alert('등록되었습니다.');
                    // 폼 데이터 초기화 (제목/내용/폴더 옵션 등)
                    $scope.newPost = {};
                    // 파일 배열도 초기화
                    $scope.newPost.files = null;
                    // 파일 인풋이 존재한다면 선택된 파일 초기화
                    if (fileInput) fileInput.value = '';
                    // 게시글 목록을 다시 불러오기 (reload가 있으면 그걸 사용, 없으면 loadPosts 사용)
                    $scope.loadPosts && $scope.loadPosts();
                })
                .catch(function (err) {
                    // 요청 실패 시 로그와 사용자 알림
                    console.error('게시글 등록 실패', err);
                    alert('등록에 실패했습니다.');
                })
                .finally(function () {
                    // 성공/실패 상관 없이 로딩 상태 OFF
                    $scope.loading = false;
                });
        };

        // ✅ 게시글 수정 모드로 전환 (인라인 수정 시작)
        $scope.startEditPost = function (p) {
            // 현재 로그인 사용자가 이 글을 수정할 수 있는 권한이 있는지 체크
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');

            // 이 게시글을 "수정 중" 상태로 표시 (템플릿에서 ng-if/ng-show로 사용)
            p._editing = true;
            // 수정용 임시 제목 필드에 기존 제목 복사
            p._editTitle = p.title;
            // 수정용 임시 내용 필드에 기존 내용 복사
            p._editContent = p.content;
        };

        // ✅ 게시글 수정 취소
        $scope.cancelEditPost = function (p) {
            // 수정 모드 해제
            p._editing = false;
            // 임시 제목/내용 초기화(비움)
            p._editTitle = '';
            p._editContent = '';
        };

        // ✅ 게시글 수정 저장 요청
        $scope.savePost = function (p) {
            // 수정 권한 체크 (작성자 또는 관리자만)
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');

            // 임시 입력값에서 제목과 내용을 가져와 공백 제거
            const title = (p._editTitle || '').trim();
            const content = (p._editContent || '').trim();

            // 제목이 비어 있으면 경고 후 리턴
            if (!title) return alert('제목을 입력하세요.');

            // 이 게시글을 식별하기 위해 준비해 둔 키 타입/값
            const keyType = p._keyType; // 'str' 또는 'num'
            const key = p._key; // 실제 key 값(uuid 또는 숫자 PK 등)
            let url = null;

            // key 타입에 따라 사용할 API URL 분기
            if (keyType === 'str')
                // 문자열 키(uuid 등)를 사용할 때
                url = '/api/posts/key/' + encodeURIComponent(key);
            else if (keyType === 'num')
                // 숫자형 PK를 사용할 때
                url = '/api/posts/' + encodeURIComponent(key);
            // 둘 다 아니면 어떤 키로 수정해야 하는지 알 수 없으므로 에러
            else return alert('이 글의 수정용 키를 알 수 없습니다.');

            // PUT 요청으로 서버에 제목/내용 수정 요청
            $http
                .put(url, { title, content }) // 바디에 수정된 제목과 내용 전송
                .then(function () {
                    // 성공 시: 수정 모드 종료 및 임시 필드 초기화
                    p._editing = false;
                    p._editTitle = '';
                    p._editContent = '';

                    // reload 함수가 있으면 그걸 호출, 없으면 기본 loadPosts()로 목록 새로고침
                    $scope.reload ? $scope.reload() : $scope.loadPosts();
                })
                .catch(function () {
                    // 실패 시 알림
                    alert('저장 실패');
                });
        };

        // ✅ 게시글 삭제
        $scope.deletePost = function (p) {
            // 삭제 권한 체크 (작성자 또는 관리자만)
            if (!canEditPost(p)) return alert('본인이 쓴 글만 삭제할 수 있습니다.');

            // 사용자에게 정말 삭제할 것인지 확인
            if (!confirm('정말 삭제할까요?')) return;

            // 게시글의 식별 키 타입과 값
            const keyType = p._keyType;
            const key = p._key;
            let url = null;

            // key 타입에 따라 삭제용 API URL 결정
            if (keyType === 'str') url = '/api/posts/key/' + encodeURIComponent(key); // 문자열 키
            else if (keyType === 'num') url = '/api/posts/' + encodeURIComponent(key); // 숫자 키
            else return alert('이 글의 삭제용 키를 알 수 없습니다.');

            // DELETE 요청으로 서버에 삭제 요청
            $http
                .delete(url)
                .then(function () {
                    // 성공 시 목록 새로고침 (reload 우선, 없으면 loadPosts)
                    $scope.reload ? $scope.reload() : $scope.loadPosts();
                })
                .catch(function () {
                    // 실패 시 알림
                    alert('삭제 실패');
                });
        };

        $scope.goEdit = function (p) {
            // 게시글 하나(p)를 "수정 전용 화면"으로 보내는 함수.
            // 목록 화면에서 [수정] 버튼을 눌렀을 때 호출됨.

            if (!p || !p._key || !p._keyType)
                // 방어 코드:
                //  - p가 없거나(null/undefined)
                //  - p._key(글을 식별하는 실제 값) 가 없거나
                //  - p._keyType(키의 종류: 숫자인지 문자열인지 구분) 이 없으면
                //    → 수정에 필요한 식별 정보가 없다는 뜻이므로,
                return alert('수정용 키가 없습니다.');
            //    경고창을 띄우고 함수 종료.

            var type = p._keyType === 'num' ? 'num' : 'str';
            // type 변수에 'num' 또는 'str' 중 하나를 넣음.

            var code = ($scope.boardCode || '').toLowerCase(); // 'BUS' → 'bus'

            window.location.hash = '#/board/' + encodeURIComponent(code) + '/edit/' + type + '/' + encodeURIComponent(p._key);
        };

        // ====== // 게시글 CRUD 끝 ======
    });

    // ───────────────── 게시글 편집 전용 컨트롤러 ─────────────────
    app.controller('BoardEditCtrl', function ($scope, $http, $routeParams, $location) {
        $scope.loading = true;
        $scope.saving = false;
        $scope.deleting = false;

        const code = String($routeParams.code || '').toUpperCase(); // 'BUS' / 'NORM'
        const type = String($routeParams.type || 'str'); // 'num' | 'str'
        const key = $routeParams.key;

        function backToList() {
            const path = '/board/' + code.toLowerCase();
            $location.path(path).search({});
        }
        $scope.cancel = backToList;

        // 파일 선택 핸들러 (file-model 디렉티브를 쓰고 있으면 이 부분은 생략 가능)
        $scope.onFileChange = function (element) {
            $scope.$apply(function () {
                $scope.form = $scope.form || {};
                $scope.form.file = element.files[0] || null;
            });
        };

        function fetchOne() {
            $scope.loading = true;

            let url = null;
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else url = '/api/posts/key/' + encodeURIComponent(key);

            $http
                .get(url)
                .then(function (res) {
                    const p = res.data || {};
                    $scope.form = {
                        title: p.title || '',
                        content: p.content || '',
                        file: null, // 새 파일은 사용자가 선택할 때만 채움
                    };
                    $scope.meta = {
                        writerId: p.writerId,
                        writerName: p.writerName,
                        postId: p.postId,
                        uuid: p.uuid,
                        createdAt: p.createdAt,
                        updatedAt: p.updatedAt,

                        // 🔽 첨부파일 메타도 같이 넣어줌
                        fileUrl: p.fileUrl,
                        fileType: p.fileType,
                        fileName: p.fileName,
                    };
                })
                .finally(function () {
                    $scope.loading = false;
                });
        }

        $scope.save = function () {
            if ($scope.saving) return;

            $scope.saving = true;

            // 🔹 FormData로 multipart/form-data 요청 구성
            const fd = new FormData();
            fd.append('title', $scope.form.title || '');
            fd.append('content', $scope.form.content || '');

            // 새 파일이 선택된 경우에만 전송
            if ($scope.form.file) {
                fd.append('file', $scope.form.file);
            }

            let url = null;
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else url = '/api/posts/key/' + encodeURIComponent(key);

            $http
                .put(url, fd, {
                    headers: { 'Content-Type': undefined }, // ← 브라우저가 boundary 포함해서 자동 설정
                    transformRequest: angular.identity, // ← FormData 그대로 보내기
                })
                .then(function () {
                    alert('수정 완료');
                    backToList();
                })
                .catch(function (err) {
                    console.error(err);
                    alert('수정 실패: ' + (err.status || '오류'));
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };

        fetchOne();

        // 🔥 수정: 파일까지 같이 보내는 multipart/form-data 버전
        $scope.save = function () {
            const title = ($scope.form.title || '').trim();
            const content = ($scope.form.content || '').trim();
            if (!title) return alert('제목을 입력하세요.');
            if ($scope.saving) return; // 중복 클릭 방지

            $scope.saving = true;

            // 폼데이터 구성
            const fd = new FormData();
            fd.append('title', title);
            fd.append('content', content);
            // 파일을 새로 선택했을 때만 추가
            if ($scope.form.file) {
                // 'file' 이름은 @RequestParam("file") 이랑 반드시 같아야 함
                fd.append('file', $scope.form.file);
            }

            let url = null;
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else url = '/api/posts/key/' + encodeURIComponent(key);

            $http
                .put(url, fd, {
                    headers: { 'Content-Type': undefined }, // 브라우저가 boundary 포함해서 자동 설정
                    transformRequest: angular.identity, // FormData 그대로 전송
                })
                .then(function () {
                    alert('수정이 완료되었습니다.');
                    backToList();
                })
                .catch(function (err) {
                    console.error('수정 실패', err);
                    alert('저장에 실패했습니다. (' + (err.status || '오류') + ')');
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };
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
                return (
                    String(u.email || '')
                        .toLowerCase()
                        .indexOf(kw) >= 0
                );
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
                    setUserStatus('success', `👤 사용자 ${$scope.users.length}명 불러왔습니다.`, 1500);
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

            setUserStatus('info', `⏳ 수정 중... (ID: ${idKey})`);
            $http
                .put('/user/' + encodeURIComponent(idKey), payload)
                .then(function (res) {
                    const updated = res.data || {};
                    u.name = updated.name ?? name ?? u.name;
                    u.phone = updated.phone ?? phone ?? u.phone;
                    u.email = updated.email ?? email ?? u.email;
                    $scope.cancelEdit(u);
                    setUserStatus('success', `✅ 수정 완료 (ID: ${idKey})`, 1500);
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
            if (!confirm(`정말로 삭제할까요? (ID: ${idKey})`)) return;
            $http
                .delete('/user/' + encodeURIComponent(idKey))
                .then(function () {
                    $scope.users = $scope.users.filter((row) => (row.user_id || row.userId || row.id) !== idKey);
                    setUserStatus('success', `🗑️ 삭제 완료 (ID: ${idKey})`, 1500);
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
                const payload = { name: (r.name || '').trim(), phone: (r.phone || '').trim() || null, email: (r.email || '').trim() };
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
