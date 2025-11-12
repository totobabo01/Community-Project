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
        return isFinite(n) && n > 0 ? n : fallback || 10;
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
            const cand = [obj.user_id, obj.userId, obj.id, obj.email, obj.username, obj.name]
                .filter(Boolean)
                .map(String)
                .map((s) => s.trim().toLowerCase());
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

    // ───────────────── 게시판 공통 (페이지네이션 포함) ─────────────────
    app.controller('BoardBaseCtrl', function ($scope, $http, AuthService) {
        $scope.posts = [];
        $scope.loading = false;
        $scope.newPost = { title: '', content: '' };
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
        }; // → 이 함수가 true면 필터링 로직을 수행.

        function toTs(d) {
            // 날짜/시간 값(d)을 타임스탬프(ms)로 변환하는 헬퍼.
            if (!d) return null; // 값이 없으면 null 반환.
            const t = new Date(d).getTime(); // Date로 파싱 후 ms 단위 숫자 취득(NaN 가능).
            return isFinite(t) ? t : null; // 유효 숫자면 그대로, 아니면 null(파싱 실패 방어).
        }

        function matchPostRow(row) {
            // 단일 게시글 row가 현재 검색 조건에 “매치”되는지 판단.
            const t = String($scope.q.type || 'author'); // 검색 타입을 문자열로, 기본값은 'author'.
            if (t === 'time') {
                // ① 시간 범위 검색일 때
                const from = toTs($scope.q.from), //   시작일(from)을 타임스탬프 변환
                    to = toTs($scope.q.to); //   종료일(to)을 타임스탬프 변환
                const cand = toTs(
                    //   후보 시간: row의 대표 시각(업데이트/생성/작성일 순으로 존재하는 것)
                    row.updatedAt ||
                        row.createdAt || //   → 백엔드/DB 필드 명 혼재를 포괄적으로 대응
                        row.writeTime ||
                        row.created_at
                );
                if (cand == null) return true; //   해당 row에 시간이 없으면 필터링에서 제외하지 않고 통과시킴.
                if (from != null && cand < from) return false; //   시작일 이전이면 제외.
                if (to != null && cand > to + 24 * 60 * 60 * 1000 - 1)
                    //   종료일의 “하루 끝(23:59:59.999)”을 포함하도록 보정.
                    return false; //   그보다 크면 제외.
                return true; //   범위 안이면 매치 성공.
            }
            const kw = String($scope.q.keyword || '') // ② 텍스트 검색일 때: 키워드 준비
                .trim()
                .toLowerCase();
            if (!kw) return true; //   키워드가 비어 있으면 필터링하지 않고 통과.
            const authorStr = [
                //   작성자 관련 텍스트를 모두 모아 하나의 문자열로
                row.writerName, //   (프로퍼티명이 환경마다 다를 수 있어 포괄적으로 결합)
                row.writerId,
                row.author,
                row.username,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase(); //   존재하는 값만 합치고 소문자화.
            const contentStr = [row.title, row.content] //   제목 + 본문 텍스트
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (t === 'author') return authorStr.indexOf(kw) >= 0; //   작성자 필드만 검색.
            if (t === 'content') return contentStr.indexOf(kw) >= 0; //   제목/본문만 검색.
            if (t === 'author_content')
                return (
                    authorStr.indexOf(kw) >= 0 || //   작성자 또는 제목/본문 중 하나라도 포함.
                    contentStr.indexOf(kw) >= 0
                );
            return true; //   정의 외 타입이면 필터 미적용(통과).
        }

        function filterAndSlice(list) {
            // 목록을 필터링하고, 현재 페이지의 “슬라이스”를 계산하는 핵심 함수.
            const src = Array.isArray(list) ? list : []; // 방어적: 리스트가 아니면 빈 배열로 처리.
            const filtered = $scope.searchActive() // 검색이 활성 상태면
                ? src.filter(matchPostRow) //   위에서 정의한 규칙으로 필터링,
                : src; // 아니면 전체 사용.

            const size = toInt($scope.pageSize, 10); // 페이지 크기(pageSize)를 정수 변환(외부의 toInt 헬퍼 전제).
            $scope.total = filtered.length; // 필터링 이후 총 건수.
            $scope.pages = Math.max(1, Math.ceil($scope.total / size)); // 총 페이지 수(최소 1페이지 보장).
            if ($scope.page >= $scope.pages)
                // 현재 페이지 인덱스가 범위를 넘으면
                $scope.page = $scope.pages - 1; // 마지막 페이지로 보정(0-based 인덱스).

            const start = $scope.page * size; // 현재 페이지의 시작 인덱스 계산.
            const pageRows = filtered.slice(start, start + size); // 해당 페이지에 보여줄 부분배열(슬라이스).

            $scope.posts = pageRows.map((p, i) => {
                // 화면 렌더링용으로 각 row에 파생 필드를 부여.
                const r = resolvePostKey(p); // 게시글 식별 키(숫자/문자) 판별 및 추출(외부 헬퍼 전제).
                p._keyType = r.type; //   예: 'id' | 'uuid'
                p._key = r.key; //   실제 키 값(예: 123, '550e8-...')
                p._uid = makePostUid(p, i); //   리스트 렌더링 안정용 고유 식별자(외부 헬퍼 전제).
                return p; //   변형된 객체를 반환(원본 p에 메타 붙여서 재사용).
            });
        }

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
        $scope.loadPosts = function () {
            // 게시판 코드가 없으면 종료 (boardCode는 어떤 게시판인지 구분)
            if (!$scope.boardCode) return;

            $scope.loading = true; // 로딩 상태 활성화 (로딩 스피너 등 표시용)

            // 검색이 활성화되어 있는지 여부 확인
            const isSearching = $scope.searchActive(); // $scope.searchActive는 **“지금 검색 조건이 실제로 켜져 있는가?”**를 판단해서 true/false를 돌려주는 헬퍼 함수
            // 요청 파라미터 객체 정의
            const params = {
                // 검색 중이면 항상 첫 페이지부터 로드, 아니면 현재 페이지 사용
                page: isSearching ? 0 : $scope.page,

                // 검색 중이면 한 번에 200개 불러오고, 아니면 페이지 크기(pageSize) 사용
                size: isSearching ? 200 : toInt($scope.pageSize, 10),
            };

            // 📅 검색 타입이 기간(time)인 경우 날짜 범위를 파라미터로 추가
            if ($scope.q.type === 'time') {
                if ($scope.q.from) params.from = $scope.q.from; // 시작일
                if ($scope.q.to) params.to = $scope.q.to; // 종료일
                params.qType = 'time'; // 검색 유형 표시
            }
            // 🔤 키워드 기반 검색인 경우
            else if (($scope.q.keyword || '').trim()) {
                params.qType = $scope.q.type; // 검색 기준(author, title 등)
                params.q = $scope.q.keyword.trim(); // 실제 검색어
            }

            $http
                .get('/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', { params })
                .then((res) => {
                    const data = res.data || {};
                    const list = Array.isArray(data.content) ? data.content : Array.isArray(data.rows) ? data.rows : Array.isArray(data.list) ? data.list : Array.isArray(data) ? data : [];

                    // 검색/비검색 공통: 프런트에서 필터 + 슬라이스
                    filterAndSlice(list);

                    // ─── 서버 페이지/전체 수치 동기화(비검색일 때 서버 값을 우선) ───
                    if (!isSearching) {
                        // 현재 페이지/페이지 크기
                        $scope.page = typeof data.page === 'number' ? data.page : typeof data.number === 'number' ? data.number : $scope.page;
                        $scope.pageSize = toInt(typeof data.size === 'number' ? data.size : $scope.pageSize, 10);

                        // 총합/총페이지 robust 파싱
                        const hasTotal = typeof data.total === 'number' || typeof data.totalElements === 'number';
                        const serverTotal = typeof data.total === 'number' ? data.total : data.totalElements;
                        const serverTotalPages = typeof data.totalPages === 'number' ? data.totalPages : typeof data.pages === 'number' ? data.pages : undefined;

                        if (hasTotal) {
                            $scope.total = serverTotal;
                            $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
                        } else if (serverTotalPages !== undefined) {
                            // totalElements가 없고 totalPages만 있을 때
                            $scope.pages = Math.max(1, serverTotalPages);
                            // total은 근사치로 pages*size (서버가 정확 totalElements를 안 줄 때 UI용 계산)
                            $scope.total = $scope.pages * Math.max(1, toInt($scope.pageSize, 10));
                        } else {
                            // 어떤 메타도 없으면 현재 목록 길이 기준으로 보수 계산
                            const curLen = Array.isArray(list) ? list.length : 0;
                            $scope.total = Math.max($scope.total || 0, curLen + $scope.page * Math.max(1, toInt($scope.pageSize, 10)));
                            $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
                        }
                    }
                })
                .catch(() => {
                    $scope.posts = [];
                    $scope.total = 0;
                    $scope.pages = 1;
                })
                .finally(() => {
                    $scope.loading = false;
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

        $scope.pageRange = function () {
            const totalPages = toInt($scope.pages, 1);
            const cur = toInt($scope.page, 0);
            const arr = [];
            const start = Math.max(0, cur - 2);
            const end = Math.min(totalPages - 1, cur + 2);
            for (let i = start; i <= end; i++) arr.push(i);
            return arr;
        };

        // (댓글/CRUD 이하 동일)
        // ... [생략: 기존 댓글/수정/삭제 로직 전부 동일] ...
        // ── 최상위 댓글 작성/대댓글/수정/삭제/토글 함수들은 원본 그대로 유지 ──

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
                c._uid = // 리스트 렌더링에 쓰는 고유 키(React의 key 같은 용도)
                    (c.uuid && 'c-' + c.uuid) || //   1) uuid가 있으면 그걸 사용
                    (typeof c.commentId === 'number' && isFinite(c.commentId) && 'c-' + c.commentId) || // 2) 숫자 id가 있으면 사용
                    'c-tmp-' + baseTs + '-' + i; //   3) 둘 다 없으면 임시 키 생성(낙관적 추가 대비)
                c._replying = false; // 대댓글 입력창 표시 상태(기본 숨김)
                c._replyText = ''; // 대댓글 입력값(초기 공란)
                return c; // 가공된 댓글 반환
            });
        }

        $scope.loadComments = function (p) {
            // 게시글 p의 댓글 목록을 서버에서 불러오기
            const url = p._keyType === 'num' ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' : p._keyType === 'str' ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' : null; // 게시글 식별 타입(num/str)에 따라 API URL 결정
            if (!url) {
                // 식별 키가 없으면 댓글 기능 비활성 처리
                p.comments = []; // 화면에 빈 배열 표시
                p._commentsLoaded = true; // 로딩 완료로 간주(다시 로드 시도하지 않게)
                return; // 종료
            }
            $http.get(url).then((res) => {
                // 서버에서 댓글 목록 GET
                p.comments = decorateComments(Array.isArray(res.data) ? res.data : []); // 응답을 배열로 강제 후 화면용 보정
                p._commentsLoaded = true; // 이 게시글에 대해 댓글이 로딩되었음을 표시
                p._newComment = ''; // 새 댓글 입력창 초기화
            });
        };

        $scope.addComment = function (p) {
            // 새 댓글 등록
            const text = (p._newComment || '').trim(); // 입력값 공백 제거
            if (!text) return; // 내용이 없으면 중단
            const url = p._keyType === 'num' ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' : p._keyType === 'str' ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' : null; // 게시글 식별 타입에 맞는 등록 URL
            if (!url) return alert('이 글은 댓글 기능을 사용할 수 없습니다.'); // 식별 불가
            $http.post(url, { content: text }).then((res) => {
                // POST로 댓글 작성
                const created = res.data || {}; // 서버가 돌려준 생성된 댓글 객체
                p.comments = p.comments || []; // 배열 방어
                p.comments.push(created); // 목록 뒤에 바로 추가(낙관적 갱신)
                p._newComment = ''; // 입력창 비우기
            });
        };

        $scope.startReply = function (c) {
            // 특정 댓글 c에 대댓글 입력 시작
            c._replying = true; // 입력창 표시
            c._replyText = ''; // 입력값 초기화
        };

        $scope.cancelReply = function (c) {
            // 대댓글 입력 취소
            c._replying = false; // 입력창 닫기
            c._replyText = ''; // 입력값 비우기
        };

        $scope.submitReply = function (p, parent) {
            // 대댓글 전송
            const text = (parent._replyText || '').trim(); // 입력값 정리
            if (!text) return; // 빈 문자열이면 중단
            if (!parent || !parent.uuid)
                // 부모 댓글의 uuid가 필수(키 기반 API)
                return alert('이 댓글은 대댓글 키(uuid)를 알 수 없습니다.');
            const url = '/api/comments/key/' + encodeURIComponent(parent.uuid) + '/replies'; // 대댓글 API
            $http
                .post(url, { content: text }) // 서버에 대댓글 등록
                .then((res) => {
                    const created = res.data || {}; // 생성된 대댓글
                    p.comments = p.comments || []; // 목록 방어
                    p.comments.push(created); // 현재 평면 목록 뒤에 추가(트리 변환은 렌더러에서 처리 가능)
                    parent._replying = false; // 입력창 닫기
                    parent._replyText = ''; // 입력값 비우기
                })
                .catch(() => {
                    alert('대댓글 등록에 실패했습니다.'); // 실패 안내
                });
        };

        $scope.startEditComment = function (c) {
            // 댓글 수정 시작
            if (!canEditComment(c))
                // 권한(작성자 본인) 체크
                return alert('본인이 쓴 댓글만 수정할 수 있습니다.');
            c._editing = true; // 수정 모드 진입
            c._editContent = c.content; // 현재 내용을 편집 버퍼에 복사
        };

        $scope.cancelEditComment = function (c) {
            // 댓글 수정 취소
            c._editing = false; // 수정 모드 해제
            c._editContent = ''; // 편집 버퍼 비우기
        };

        $scope.saveComment = function (p, c) {
            // 댓글 수정 저장
            if (!canEditComment(c))
                // 다시 한 번 권한 확인(이중 방어)
                return alert('본인이 쓴 댓글만 수정할 수 있습니다.');
            const newText = (c._editContent || '').trim(); // 편집 내용 정리
            if (!newText) return; // 빈 내용이면 중단
            if (!c.uuid)
                // 수정 API는 키(uuid) 기반 가정
                return alert('이 댓글은 수정용 키를 알 수 없어 수정할 수 없습니다.');
            $http
                .put(
                    '/api/comments/key/' + encodeURIComponent(c.uuid), // PUT으로 내용 갱신
                    { content: newText }
                )
                .then(function (res) {
                    c.content = newText; // 화면상 내용 반영
                    if (res && res.data && res.data.updatedAt)
                        // 서버가 갱신 시각을 주면
                        c.updatedAt = res.data.updatedAt; // 로컬에도 업데이트
                    c._editing = false; // 수정 모드 종료
                    c._editContent = ''; // 편집 버퍼 비우기
                })
                .catch(function (err) {
                    if (err && err.status === 403)
                        // 권한 오류면 친절히 메시지
                        alert('본인이 쓴 댓글만 수정할 수 있습니다.');
                    else alert('수정에 실패했습니다.'); // 기타 실패
                });
        };

        $scope.deleteComment = function (p, c) {
            // 댓글 삭제
            if (!canEditComment(c))
                // 삭제 권한(작성자 본인) 확인
                return alert('본인이 쓴 댓글만 삭제할 수 있습니다.');
            if (!confirm('댓글을 삭제할까요?')) return; // 사용자 확인
            if (c && c.uuid) {
                // 1) uuid 기반 삭제 경로
                $http
                    .delete('/api/comments/key/' + encodeURIComponent(c.uuid)) // 키 기반 DELETE
                    .then(function () {
                        p.comments = (p.comments || []).filter(function (x) {
                            // 클라이언트 목록에서 제거
                            return x.uuid !== c.uuid;
                        });
                    })
                    .catch(function (err) {
                        if (err && err.status === 403) alert('본인이 쓴 댓글만 삭제할 수 있습니다.');
                        else alert('삭제 실패');
                    });
                return; // 종료(아래 분기 타지 않게)
            }
            const id = c && c.commentId; // 2) 숫자 id 기반 삭제 경로(레거시 호환)
            if (typeof id === 'number' && isFinite(id)) {
                $http
                    .delete('/api/comments/' + encodeURIComponent(id)) // id 기반 DELETE
                    .then(function () {
                        p.comments = (p.comments || []).filter(function (x) {
                            return x.commentId !== id; // 목록에서 id로 제거
                        });
                    })
                    .catch(function () {
                        alert('삭제 실패');
                    });
                return;
            }
            alert('이 댓글은 삭제용 키를 알 수 없어 삭제할 수 없습니다.'); // 어떤 키도 없으면 실패 안내
        };

        // ====== ★ 게시글 CRUD(추가) — 저장 후 항상 새로고침 ======

        // 작성
        $scope.createPost = function () {
            const title = ($scope.newPost.title || '').trim();
            const content = ($scope.newPost.content || '').trim();
            if (!title) return alert('제목을 입력하세요.');
            const url = '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts';
            $http
                .post(url, { title, content })
                .then(function () {
                    // 목록을 서버 기준으로 다시 로드
                    $scope.newPost = { title: '', content: '' };
                    $scope.page = 0;
                    $scope.loadPosts();
                })
                .catch(function () {
                    alert('등록 실패');
                });
        };

        // 편집 시작/취소 (권한 가드 포함)
        $scope.startEditPost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');
            p._editing = true;
            p._editTitle = p.title;
            p._editContent = p.content;
        };
        $scope.cancelEditPost = function (p) {
            p._editing = false;
            p._editTitle = '';
            p._editContent = '';
        };

        // 저장: 로컬 값을 바꾸지 않고 목록 재조회(=새로고침)
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
                    // ✅ 반드시 서버 데이터로 재렌더
                    $scope.reload ? $scope.reload() : $scope.loadPosts();
                })
                .catch(function () {
                    alert('저장 실패');
                });
        };

        // 삭제: 성공 후 목록 재조회
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

        // ★★★ 목록 → 편집 전용 화면으로 이동 (분리 페이지)
        $scope.goEdit = function (p) {
            if (!p || !p._key || !p._keyType) return alert('수정용 키가 없습니다.');
            // 편집 화면은 권한 체크를 서버에서 다시 하므로, 여기서는 단순 이동만 담당
            var type = p._keyType === 'num' ? 'num' : 'str';
            var code = ($scope.boardCode || '').toLowerCase(); // 'BUS' → 'bus'
            // 예: #/board/bus/edit/str/550e8400-...  또는  #/board/bus/edit/num/42
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

        // 뒤로가기: 해당 게시판 목록으로
        function backToList() {
            const path = '/board/' + code.toLowerCase();
            $location.path(path).search({}); // 쿼리 제거
        }
        $scope.cancel = backToList;

        // 단건 로드
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
                    };
                    $scope.meta = {
                        writerId: p.writerId || p.author || '',
                        writerName: p.writerName || p.username || '',
                        createdAt: p.createdAt || p.writeTime || p.created_at || '',
                        updatedAt: p.updatedAt || '',
                    };
                })
                .catch(function () {
                    alert('게시글을 불러오지 못했습니다.');
                    backToList();
                })
                .finally(function () {
                    $scope.loading = false;
                });
        }
        fetchOne();

        // 저장
        $scope.save = function () {
            const title = ($scope.form.title || '').trim();
            const content = ($scope.form.content || '').trim();
            if (!title) return alert('제목을 입력하세요.');

            $scope.saving = true;
            let url = null;
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else url = '/api/posts/key/' + encodeURIComponent(key);

            $http
                .put(url, { title, content })
                .then(function () {
                    // ✅ 목록으로 이동(분리 화면의 목적: 저장 후 리스트 새로고침)
                    backToList();
                })
                .catch(function () {
                    alert('저장에 실패했습니다.');
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };

        // 삭제
        $scope.remove = function () {
            if (!confirm('정말 삭제할까요?')) return;
            $scope.deleting = true;
            let url = null;
            if (type === 'num') url = '/api/posts/' + encodeURIComponent(key);
            else url = '/api/posts/key/' + encodeURIComponent(key);

            $http
                .delete(url)
                .then(function () {
                    backToList();
                })
                .catch(function () {
                    alert('삭제에 실패했습니다.');
                })
                .finally(function () {
                    $scope.deleting = false;
                });
        };
    });

    // ───────────────── 게시판 라우트별 컨트롤러 ─────────────────
    app.controller('BoardBusCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope }));
        $scope.boardCode = 'BUS';
        $scope.loadPosts();
    });
    app.controller('BoardNormalCtrl', function ($scope, $controller) {
        angular.extend(this, $controller('BoardBaseCtrl', { $scope }));
        $scope.boardCode = 'NORM';
        $scope.loadPosts();
    });

    // ───────────────── Roles ─────────────────
    // ───────────────── Roles ─────────────────
    app.controller('RolesCtrl', function ($scope, $http, $timeout, AuthService) {
        $scope.isAdmin = false;
        $scope.loading = true;
        $scope.saving = false;

        // ⚠️ 뷰에서 쓰던 변수명을 유지하면서, 내부에서 원본을 따로 보관
        $scope.rows = []; // ← 화면에 뿌려지는 "현재 페이지" 데이터 (슬라이스 결과로 덮어씀)
        $scope.sourceRows = []; // ← 서버에서 받은 전체 원본 목록(필터/페이지 계산의 기준)

        $scope.msg = '';
        $scope.msgType = 'info';

        // ✅ 검색 + 페이지네이션 상태 (사용자/권한 + 5/10/15/20)
        $scope.q = { type: 'username', keyword: '' };
        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10; // 셀렉트에서 바뀌면 문자열일 수 있으므로 아래 num()로 항상 숫자화
        $scope.page = 0;
        $scope.filtered = [];
        $scope.paged = [];
        $scope.pages = 1; // ✅ 템플릿 호환(페이지 표시/버튼 비활성화에 사용)

        function notify(type, text, ms) {
            $scope.msgType = type;
            $scope.msg = text;
            if (ms) $timeout(() => ($scope.msg = ''), ms);
        }

        // 숫자 보정 유틸(전역 toInt와 동일한 동작, 여기선 즉시 사용하기 좋게 래핑)
        function num(v, def) {
            const n = parseInt(v, 10);
            return isFinite(n) ? n : def == null ? 0 : def;
        }
        // 현재 페이지 크기(항상 숫자)
        $scope.pageSizeNum = function () {
            return Math.max(1, num($scope.pageSize, 10));
        };
        // 총 페이지 수(항상 1 이상)
        $scope.pagesCount = function () {
            const total = ($scope.filtered || []).length;
            const size = $scope.pageSizeNum();
            return Math.max(1, Math.ceil(total / size));
        };

        // 검색 매칭: username / role
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

            // 현재 page가 범위를 벗어나면 보정
            if ($scope.page >= pages) $scope.page = pages - 1;
            if ($scope.page < 0) $scope.page = 0;

            const start = $scope.page * size;
            $scope.paged = ($scope.filtered || []).slice(start, start + size);

            // ✅ 템플릿이 rows로 렌더링하더라도 페이지가 적용되도록 rows를 슬라이스 결과로 덮어씀
            $scope.rows = $scope.paged;

            // ✅ 템플릿이 {{ pages }}와 ng-disabled="page>=pages-1"를 쓰므로 동기화
            $scope.pages = pages;
        }
        function refilter() {
            // ✅ 필터는 항상 원본(sourceRows)을 기준으로
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

        // pager controls (뷰에서 pagesCount()를 쓰므로 여기서도 동일 기준 사용)
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

        // 데이터/페이지크기/필터 길이 변화 시 항상 재계산
        $scope.$watchGroup(['pageSize', () => ($scope.filtered || []).length], repage);

        $scope.load = function () {
            $scope.loading = true;
            $http
                .get('/api/admin/roles')
                .then((res) => {
                    // ✅ 원본과 뷰 데이터를 분리 관리
                    $scope.sourceRows = Array.isArray(res.data) ? res.data : [];
                    $scope.rows = $scope.sourceRows.slice(0); // 초기엔 전체를 복사해 놓고,
                    notify('info', '권한 목록을 불러왔습니다.', 1200);
                    refilter(); // 즉시 필터/페이지 계산 → rows가 현재 페이지로 대체됨
                })
                .catch((err) => {
                    if (err && err.status === 403) notify('error', '관리자 전용 페이지입니다.', 2500);
                    else notify('error', '권한 목록을 불러오지 못했습니다.', 2500);
                    // 실패 시 안전 초기화
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
                    // 원본(sourceRows)에도 반영해 일관성 유지
                    const idx = ($scope.sourceRows || []).findIndex((r) => r.username === row.username);
                    if (idx >= 0) $scope.sourceRows[idx].role = target;
                    refilter(); // 검색/페이지 다시 반영
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
    // ───────────────── DB Users ─────────────────
    app.controller('DbUsersCtrl', function ($scope, $http, $q, $location, AuthService) {
        $scope.isAdmin = false;
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';

        // ✅ 검색 + 페이지네이션 상태
        $scope.q = { type: 'username', keyword: '' };
        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = 10;
        $scope.page = 0;
        $scope.pages = 1;
        $scope.filtered = [];
        $scope.paged = [];

        // ★ 숫자 보정 유틸 (문자열 '5' → 5)
        function toInt(v, def) {
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

        // ── 필터링(사용자/이메일/전화/권한) ──
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

        // ★ 페이지 계산(항상 숫자 보정해서 계산)
        function repage() {
            const size = Math.max(1, toInt($scope.pageSize, 10)); // ← 숫자화
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

        // pager controls
        $scope.onSize = function () {
            // ← select 변경
            $scope.pageSize = toInt($scope.pageSize, 10); // ★ 숫자화
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
            p = toInt(p, 0);
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

        // ★ 안전망: page/pageSize/filtered 길이가 바뀌면 자동 재계산
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
                    refilter(); // ← 목록 불러온 뒤 필터/페이지 갱신
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
