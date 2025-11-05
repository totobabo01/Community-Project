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
        return { loadTree: () => fetchAll().then(buildTree) };
    });

    // ───────────────── Routing ─────────────────
    app.config(function ($routeProvider, $locationProvider) {
        // $routeProvider는 **AngularJS(1.x)**에서 라우팅(페이지 전환)을 설정하는 핵심 서비스 객체
        // 앱의 구성 단계에서 라우팅/URL 전략을 설정(의존성: ngRoute)

        $locationProvider.hashPrefix(''); // URL의 '#!'(해시뱅) 대신 그냥 '#'을 사용하도록 접두어 제거

        $routeProvider // 라우트 매핑 시작
            .when('/users', {
                // 경로가 '#/users'일 때
                template: '<div></div>', // 인라인 템플릿 사용(비워두고 컨트롤러 없이 화면만 차지)
            })
            .when('/users/new', {
                // '#/users/new' 진입 시
                templateUrl: '/users-new.html', // 서버에서 해당 템플릿 파일 로드(ng-view에 삽입)
                controller: 'UsersNewCtrl', // 이 화면을 관리할 컨트롤러 지정
            })
            .when('/board/bus', {
                // '#/board/bus' (버스 게시판)
                templateUrl: '/tpl/board/bus.html', // 버스 게시판 전용 템플릿
                controller: 'BoardBusCtrl', // 버스 게시판 컨트롤러(베이스 컨트롤러 믹스인 후 boardCode='BUS')
            })
            .when('/board/normal', {
                // '#/board/normal' (일반 게시판)
                templateUrl: '/tpl/board/normal.html', // 일반 게시판 전용 템플릿
                controller: 'BoardNormalCtrl', // 일반 게시판 컨트롤러(boardCode='NORM')
            })
            .when('/roles', {
                // '#/roles' (권한/역할 관리 화면)
                templateUrl: '/roles.html', // 역할 목록/변경 UI 템플릿
                controller: 'RolesCtrl', // 관리자만 접근 가능하도록 컨트롤러에서 로직/가드 처리
            })
            .when('/db-users', {
                // '#/db-users' (DB 사용자 관리/목록)
                templateUrl: '/db-users.html', // DB 사용자 템플릿
                controller: 'DbUsersCtrl', // DB 사용자 목록/CRUD 컨트롤러
            })
            .otherwise({
                // 위 경로에 해당하지 않을 때(404 대용)
                redirectTo: '/users', // 기본 경로로 리다이렉트
            });
    });

    // '#!/' 진입 호환
    app.run(function ($window) {
        if ($window.location.hash.indexOf('#!/') === 0) {
            $window.location.replace('#/' + $window.location.hash.slice(3));
        }
    });

    // ───────────────── Root (탭/메뉴 제어) ─────────────────
    app.controller('RootCtrl', function ($scope, $location, $document, $timeout, AuthService, MenuService) {
        $scope.me = null;
        $scope.menus = [];
        $scope.location = $location;

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

        const docClickHandler = function () {
            $scope.$applyAsync(() => closeAllMenus());
        };
        $document.on('click', docClickHandler);
        $scope.$on('$destroy', function () {
            $document.off('click', docClickHandler);
        });

        MenuService.loadTree().then((tree) => {
            (tree || []).forEach(decorateMenuNode);
            $scope.menus = tree || [];
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
            const usersP = $http.get('/user').then((res) => (Array.isArray(res.data) ? res.data : []));
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
        // AngularJS 컨트롤러 등록: 이름 'BoardBaseCtrl'
        // 주입되는 의존성:
        //  - $scope : 뷰(템플릿)와 데이터를 바인딩하는 객체
        //  - $http  : 서버와 통신(ajax)용 서비스
        //  - AuthService : 현재 로그인 사용자(me) 정보를 다루는 커스텀 서비스

        $scope.posts = [];
        // 현재 화면에 표시할 "게시글 목록" 배열.
        // 서버에서 받아온 데이터 중 '현재 페이지'에 해당하는 것만 담김.

        $scope.loading = false;
        // 목록 로딩 중 여부(스피너/“불러오는 중” 같은 UI 제어에 사용).
        // 네트워크 요청 시작 시 true, 종료 시 false.

        $scope.newPost = { title: '', content: '' };
        // 새 글 작성 폼의 양식 상태(양방향 바인딩 대상).
        // 사용자가 입력한 제목/내용을 서버에 전송할 때 이 값을 사용.

        // ▼▼▼ 페이지네이션 상태 ▼▼▼
        $scope.pageSizes = [5, 10, 15, 20];
        // 한 페이지에 몇 개를 보여줄지 선택할 수 있는 옵션 목록(드롭다운의 source).

        $scope.pageSize = 10;
        // 현재 선택된 "페이지 당 개수". 초기값 10.
        // 서버 요청 시 쿼리 파라미터 size 로 함께 전송됨.

        $scope.page = 0;
        // 현재 페이지 인덱스(0부터 시작하는 zero-based).
        // 1페이지를 의미하려면 값이 0, 2페이지는 1 … 이 값으로 서버에 page를 보냄.

        $scope.total = 0;
        // 전체 게시글 개수(서버 응답으로 내려주는 total 또는 totalElements 사용).
        // 페이징 버튼 구성 시 총 페이지 수 계산에 쓰임.

        $scope.pages = 0;
        // 전체 페이지 수. 보통 Math.ceil(total / pageSize) 로 계산해서 갱신.
        // 페이지 버튼(1, 2, 3 …) 범위를 만들 때 사용.

        // ▲▲▲ 페이지네이션 상태 ▲▲▲

        AuthService.loadMe().finally(() => {
            // 현재 로그인 사용자(me) 정보를 비동기로 로드
            $scope.me = AuthService.getMe(); // 로드가 끝난 뒤(성공/실패 무관) $scope.me 에 반영
        }); // → 이후 권한 체크(관리자/본인 여부)에 사용

        const isNum = (v) => typeof v === 'number' && isFinite(v);
        // 유틸: 값이 숫자 타입이고 NaN/Infinity가 아닌지 검사(안전한 숫자 판별)

        const isNonEmptyStr = (s) => typeof s === 'string' && s.trim().length > 0;
        // 유틸: 공백을 제거했을 때 길이가 1 이상인 문자열인지 판별

        function canEditPost(p) {
            // 게시글 수정/삭제 권한 판별
            return (
                $scope.me && // me가 있고
                ($scope.me.isAdmin || // 관리자이거나
                    $scope.me.username === p.writerId)
            ); // 글 작성자와 로그인 사용자가 동일하면 true
        }

        function canEditComment(c) {
            // 댓글 수정/삭제 권한 판별
            return (
                $scope.me && // me가 있고
                ($scope.me.isAdmin || // 관리자이거나
                    $scope.me.username === c.writerId)
            ); // 댓글 작성자와 동일 사용자면 true
        }

        function resolvePostKey(p) {
            // 서버 요청에 사용할 “게시글 식별 키” 결정
            if (isNum(p.postId))
                // 1) postId가 숫자형 PK면 최우선 사용
                return { type: 'num', key: p.postId };
            const candidates = [
                // 2) 그 외 문자열 키 후보들(스키마 차이 대응)
                p.postKey,
                p.postIdStr,
                p.post_uuid,
                p.postUuid,
                p.uuid,
                p.id,
                p.key,
            ].filter(isNonEmptyStr); // 빈 문자열/undefined/null 제거
            if (candidates.length)
                // 후보가 하나라도 있으면
                return { type: 'str', key: candidates[0] }; // 첫 번째 유효 문자열 키 사용
            return { type: 'none', key: null }; // 3) 어떤 키도 없으면 none → 수정/삭제 불가 안내
        }

        function makePostUid(p, idx) {
            // ng-repeat track by 용 안정적 UID 생성
            const cand = [
                // 가능한 고유 식별자들을 우선순위로 나열
                isNum(p.postId) ? String(p.postId) : null, // 숫자형 postId 우선
                isNum(p.id) ? String(p.id) : null, // 그 다음 숫자형 id
                p.post_uuid,
                p.postUuid,
                p.uuid, // 다양한 uuid 필드들
                p.idStr,
                p.postIdStr,
                p.key, // 문자열형 키들
                p._key != null ? String(p._key) : null, // 컨트롤러가 부여한 _key(있다면)
            ].filter(isNonEmptyStr); // 유효한 문자열만 남김
            if (cand.length) return cand[0]; // 첫 번째 유효 식별자를 UID로 사용
            // 아무 키도 없을 때: 시간 + 인덱스/랜덤으로 충돌 위험 낮은 임시 UID 생성
            return 'tmp-' + Date.now() + '-' + (idx == null ? Math.random().toString(36).slice(2) : idx);
        }

        // 목록 로드(+페이지네이션)
        $scope.loadPosts = function () {
            // 게시글 목록(현재 페이지) 불러오기
            if (!$scope.boardCode) return; // 게시판 코드(BUS/NORM)가 없으면 중단
            $scope.loading = true; // 로딩 스피너 ON
            $http
                .get('/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', {
                    params: { page: $scope.page, size: $scope.pageSize }, // 서버에 page/size 전달
                })
                .then((res) => {
                    // 요청 성공 시
                    const data = res.data || {}; // 응답 본문(방어적 기본값 {})
                    // 응답 포맷 호환: content(일반적) → rows(커스텀) → 배열 자체
                    const list = Array.isArray(data.content) ? data.content : Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : [];

                    // 전체 개수: total 우선 → totalElements(스프링 Data) → list.length(폴백)
                    $scope.total = isNum(data.total) ? data.total : isNum(data.totalElements) ? data.totalElements : list.length;

                    // 현재 페이지 번호: page 우선 → number(스프링 Data) → 기존 값 유지
                    $scope.page = isNum(data.page) ? data.page : isNum(data.number) ? data.number : $scope.page;

                    // 페이지 크기: 서버가 size를 회신했으면 동기화, 아니면 유지
                    $scope.pageSize = isNum(data.size) ? data.size : $scope.pageSize;

                    // 총 페이지 수 재계산(최소 1페이지)
                    $scope.pages = Math.max(1, Math.ceil($scope.total / $scope.pageSize));

                    // 화면용 아이템으로 가공: 각 행에 식별 키/UID 부여
                    $scope.posts = list.map((p, i) => {
                        const r = resolvePostKey(p); // 이 글의 서버 측 식별 키 계산
                        p._keyType = r.type; // 'num' | 'str' | 'none'
                        p._key = r.key; // 실제 키 값
                        p._uid = makePostUid(p, i); // ng-repeat track by용 고유값
                        return p;
                    });
                })
                .catch(() => {
                    // 요청 실패 시
                    $scope.posts = []; // 목록 비우기(안전)
                })
                .finally(() => {
                    // 성공/실패 무관 후처리
                    $scope.loading = false; // 로딩 스피너 OFF
                });
        };

        // [ADD] 카드 헤더의 “새로 고침” 버튼용 헬퍼 (현재 페이지 유지)
        $scope.reload = function () {
            $scope.loadPosts();
        };

        // 페이지 이동/사이즈 변경 ------------------------------

        $scope.first = function () {
            // « 첫 페이지로 이동
            if ($scope.page > 0) {
                // 이미 첫 페이지면 무시
                $scope.page = 0;
                $scope.loadPosts(); // 새 페이지 기준 재조회
            }
        };

        $scope.prev = function () {
            // ‹ 이전 페이지
            if ($scope.page > 0) {
                // 0보다 클 때만 이동
                $scope.page--;
                $scope.loadPosts();
            }
        };

        $scope.next = function () {
            // 다음 › 페이지
            if ($scope.page < $scope.pages - 1) {
                // 마지막 이전까지만 이동
                $scope.page++;
                $scope.loadPosts();
            }
        };

        $scope.last = function () {
            // 끝 » 페이지
            if ($scope.page < $scope.pages - 1) {
                // 이미 마지막이면 무시
                $scope.page = $scope.pages - 1;
                $scope.loadPosts();
            }
        };

        $scope.go = function (p) {
            // 숫자 버튼(특정 페이지) 이동
            if (p >= 0 && p < $scope.pages && p !== $scope.page) {
                // 유효 범위 & 현재와 다를 때만
                $scope.page = p;
                $scope.loadPosts();
            }
        };

        $scope.changeSize = function () {
            // 페이지 크기 변경 시
            $scope.page = 0; // 보통 첫 페이지로 리셋
            $scope.loadPosts(); // 새 size 기준으로 재조회
        };

        $scope.pageRange = function () {
            // 페이지 버튼 그룹 생성(현재 중심 ±2)
            const pages = [];
            const start = Math.max(0, $scope.page - 2); // 시작 인덱스(최소 0)
            const end = Math.min($scope.pages - 1, $scope.page + 2); // 끝 인덱스(최대 마지막)
            for (let i = start; i <= end; i++) pages.push(i); // [start..end] 배열 채우기
            return pages; // 예: 현재 5라면 [3,4,5,6,7]
        };

        // 글 작성
        $scope.createPost = function () {
            // 새 게시글을 생성하는 스코프 함수(버튼 클릭 등으로 호출)
            const t = ($scope.newPost.title || '').trim(); // 입력값 방어: 제목이 없으면 빈 문자열로 대체 후 좌우 공백 제거
            const c = ($scope.newPost.content || '').trim(); // 입력값 방어: 내용이 없으면 빈 문자열로 대체 후 좌우 공백 제거
            if (!t || !c) return; // 제목 또는 내용이 비었으면 서버 호출 없이 즉시 종료(유효성 검사)

            $http // AngularJS의 HTTP 서비스로 AJAX 요청 시작
                .post(
                    // HTTP POST 메서드: 서버에 새 글 생성 요청
                    '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', // REST 경로: 게시판 코드별 글 생성 엔드포인트
                    { title: t, content: c } // 요청 본문(JSON): 서버가 필요한 최소 필드만 전송
                )
                .then(() => {
                    // 요청 성공 콜백(2xx 응답)
                    // 새 글은 보통 첫 페이지로 보여주는 UX
                    $scope.newPost = { title: '', content: '' }; // 입력 폼 초기화(사용자 입력칸 비우기)
                    $scope.page = 0; // 새 글이 목록 상단에 보이도록 페이지를 첫 페이지(0)로 이동
                    $scope.loadPosts(); // 최신 목록 다시 불러오기(페이지네이션/정렬 반영)
                })
                .catch((err) => {
                    // 요청 실패 콜백(4xx/5xx/네트워크 오류)
                    alert(
                        // 사용자에게 에러 메시지 안내
                        (err && err.data && (err.data.message || err.data.error)) || // 서버가 보낸 구체적 메시지가 있으면 우선 표시
                            '등록 실패' // 없으면 기본 메시지
                    );
                });
        };

        $scope.startEditPost = function (p) {
            // 게시글 p에 대해 "수정 모드"로 전환하는 함수
            if (!canEditPost(p))
                // 권한/소유자 검사: 현재 사용자가 p를 수정할 수 있는지 확인
                return alert('본인이 쓴 글만 수정할 수 있습니다.'); // 불가하면 얼럿을 띄우고 함수 즉시 종료(수정 모드 진입 X)

            p._editing = true; // 수정 모드 진입 플래그(템플릿에서 편집 UI를 보이게 하는 토글)
            p._editTitle = p.title; // 현재 제목을 편집용 버퍼에 복사(폼에서 이 값을 수정)
            p._editContent = p.content; // 현재 내용을 편집용 버퍼에 복사
        };

        $scope.cancelEditPost = function (p) {
            // 게시글 p의 "수정 모드"를 취소하는 함수
            p._editing = false; // 수정 모드 종료(템플릿에서 읽기 모드 UI로 복귀)
            p._editTitle = ''; // 편집 버퍼 초기화(취소 시 입력값 폐기)
            p._editContent = ''; // 편집 버퍼 초기화
        };

        $scope.savePost = function (p) {
            // 게시글 p의 편집 내용을 서버에 저장하는 함수
            if (!canEditPost(p))
                // 1) 권한/소유자 확인(프런트 1차 가드)
                return alert('본인이 쓴 글만 수정할 수 있습니다.'); //    불가하면 알림 후 종료

            const payload = {
                // 2) 서버에 보낼 요청 본문 구성
                title: (p._editTitle || '').trim(), //    편집 버퍼에서 제목 추출 + 공백 제거
                content: (p._editContent || '').trim(), //    편집 버퍼에서 내용 추출 + 공백 제거
            };
            if (!payload.title || !payload.content) return; //    빈 값이면 요청하지 않음(간단 검증)

            const onOk = () => {
                // 3) 성공 콜백: 낙관적 갱신 + 편집모드 종료
                p.title = payload.title; //    화면의 원본 필드를 새 값으로 반영
                p.content = payload.content;
                $scope.cancelEditPost(p); //    편집모드 끄고 버퍼 초기화
            };
            const onErr = (err, msg) => {
                // 4) 실패 콜백: 상태코드에 따라 메시지 분기
                if (err && err.status === 403)
                    //    서버가 권한 없음(403)을 준 경우
                    alert('본인이 쓴 글만 수정할 수 있습니다.'); //    소유자 제약 메시지
                //    그 외(404/500/네트워크 등)
                else alert(msg); //    호출 지점에서 넘긴 기본 메시지 표시
            };

            if (p._keyType === 'num') {
                // 5) 숫자 PK 방식(postId)을 사용하는 글
                $http
                    .put('/api/posts/' + encodeURIComponent(p._key), payload) //    PUT /api/posts/{id}
                    .then(onOk) //    성공 → onOk
                    .catch((e) => onErr(e, '수정 실패')); //    실패 → 공통 에러 처리
            } else if (p._keyType === 'str') {
                // 6) 문자열 키(UUID 등) 방식인 글
                $http
                    .put('/api/posts/key/' + encodeURIComponent(p._key), payload) //    PUT /api/posts/key/{uuid}
                    .then(onOk)
                    .catch((e) => onErr(e, '수정 실패(키)'));
            } // 7) 키 타입 정보가 없으면
            else alert('이 게시글은 수정 키 정보를 알 수 없어 수정할 수 없습니다.'); //    방어적 종료(엔드포인트를 결정할 수 없음)
        };

        $scope.deletePost = function (p) {
            // 게시글 p를 삭제하는 스코프 함수
            if (!canEditPost(p))
                // 1) 프런트 1차 가드: 소유자/관리자 여부 확인
                return alert('본인이 쓴 글만 삭제할 수 있습니다.'); //    권한 없으면 안내 후 종료
            if (!confirm('이 게시글을 삭제할까요?')) return; // 2) 사용자 확인(취소 누르면 종료)

            const afterDeleteReload = () => {
                // 3) 삭제 후 목록/페이지 보정 로직
                // 현재 페이지가 비면 이전 페이지로 보정
                $scope.loadPosts(); //    먼저 목록을 새로 불러 total/page 수치 갱신
                // 보정은 loadPosts 후 total/pages 값이 갱신된 다음 한 번 더 호출
                setTimeout(function () {
                    //    digest/비동기 순서를 고려해 한 틱 뒤에 보정
                    if ($scope.total > 0 && $scope.page >= $scope.pages) {
                        //    (예) 3페이지 마지막 아이템 삭제로 페이지 수가 줄어든 경우
                        $scope.page = $scope.pages - 1; //    현재 페이지 인덱스를 마지막 유효 페이지로 이동
                        $scope.loadPosts(); //    다시 로드하여 화면을 유효 페이지의 목록으로 갱신
                    }
                }, 0);
            };

            const tryDeleteByNumericId = () => {
                // 4) 숫자 PK(id/postId)로 삭제를 시도하는 보조 함수
                const numId =
                    typeof p.postId === 'number' && isFinite(p.postId)
                        ? p.postId //    postId가 숫자면 사용
                        : typeof p.id === 'number' && isFinite(p.id)
                        ? p.id //    아니면 id가 숫자면 사용
                        : null; //    둘 다 아니면 실패
                if (numId == null) return Promise.reject(); //    숫자 ID가 없으면 즉시 실패 Promise 반환
                return $http.delete('/api/posts/' + encodeURIComponent(numId)); //    숫자 PK 경로로 DELETE 요청
            };

            const onErr = (err, msg) => {
                // 5) 공통 에러 처리 콜백
                if (err && err.status === 403)
                    //    서버에서 403(권한 없음)이면
                    alert('본인이 쓴 글만 삭제할 수 있습니다.'); //    소유자 제약 메시지
                else alert(msg); //    그 외(404/500/네트워크 등)는 기본 메시지
            };

            if (p._keyType === 'num') {
                // 6) 이 글이 "숫자 키" 방식이라고 명시된 경우
                $http
                    .delete('/api/posts/' + encodeURIComponent(p._key)) //    DELETE /api/posts/{id}
                    .then(afterDeleteReload) //    성공 → 목록/페이지 보정
                    .catch((e) => onErr(e, '삭제 실패')); //    실패 → 에러 표시
            } else if (p._keyType === 'str') {
                // 7) 이 글이 "문자열 키(UUID 등)" 방식인 경우
                $http
                    .delete('/api/posts/key/' + encodeURIComponent(p._key)) //    DELETE /api/posts/key/{uuid}
                    .then(afterDeleteReload) //    성공 → 보정
                    .catch(
                        () =>
                            //    실패 시 폴백 전략: 숫자 PK로도 한 번 더 시도
                            tryDeleteByNumericId()
                                .then(afterDeleteReload) //    폴백 성공 → 보정
                                .catch((e2) => onErr(e2, '삭제 실패(키/ID 모두 실패)')) //    폴백 실패 → 최종 에러
                    );
            } else {
                // 8) 키 타입 정보를 알 수 없는 경우(백업 경로)
                tryDeleteByNumericId() //    그래도 숫자 PK로 시도
                    .then(afterDeleteReload) //    성공 → 보정
                    .catch((e) => onErr(e, '이 게시글은 삭제 키/ID 정보를 알 수 없어 삭제할 수 없습니다.')); // 실패 → 메시지
            }
        };

        $scope.toggleComments = function (p) {
            // 특정 게시글 p의 '댓글 영역' 토글 함수
            p._showComments = !p._showComments; // 현재 표시 상태를 반전(true/false)
            if (p._showComments && !p._commentsLoaded)
                // 처음 열었고, 아직 댓글을 불러오지 않았다면
                $scope.loadComments(p); // 서버에서 해당 글의 댓글 목록 로딩
        };

        function decorateComments(arr) {
            // 댓글 배열에 UI용 보조 속성들을 부착하는 헬퍼
            const baseTs = Date.now(); // 임시 ID 생성 시 충돌 방지를 위한 기준 타임스탬프
            return (arr || []).map((c, i) => {
                // 댓글 목록을 순회하면서 각 원소를 가공
                if (!c) return c; // null/undefined 안전 처리
                c._uid = // 각 댓글 블록을 위한 고유 키(ng-repeat track by 등에서 사용)
                    (c.uuid && 'c-' + c.uuid) || //   1) 서버가 uuid 제공 시: 'c-<uuid>'
                    (typeof c.commentId === 'number' && isFinite(c.commentId) && 'c-' + c.commentId) || //   2) 숫자 PK 제공 시: 'c-<commentId>'
                    'c-tmp-' + baseTs + '-' + i; //   3) 둘 다 없으면 임시 키: 'c-tmp-<ts>-<index>'
                c._replying = false; // 대댓글 입력 폼 표시 여부(초기 감춤)
                c._replyText = ''; // 대댓글 입력창의 바인딩 값(초기 공백)
                return c; // 가공된 댓글 객체 반환
            });
        }

        $scope.loadComments = function (p) {
            // 서버로부터 댓글 목록을 가져와 p에 주입
            const url = // 글 식별 방식에 따라 적절한 API 경로를 선택
                p._keyType === 'num'
                    ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' // 1) 숫자 PK: /api/posts/{id}/comments
                    : p._keyType === 'str'
                    ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' // 2) 문자열 키: /api/posts/key/{uuid}/comments
                    : null; // 3) 키 타입을 모르면 null

            if (!url) {
                // URL을 만들 수 없으면(식별자 정보 부족)
                p.comments = []; // 댓글은 빈 배열로 세팅
                p._commentsLoaded = true; // '이미 불러옴' 플래그를 켜서 재시도 루프 방지
                return; // 조용히 종료(또는 필요시 알림)
            }

            $http.get(url).then((res) => {
                // GET 요청으로 댓글 목록 조회
                p.comments = decorateComments(
                    // 서버 응답을 배열로 단정하고(아니면 빈 배열)
                    Array.isArray(res.data) ? res.data : [] //   → UI용 필드 첨가(decorateComments)
                );
                p._commentsLoaded = true; // 최초 로딩 완료 플래그
                p._newComment = ''; // 새 댓글 입력창 초기화(UX)
            });
        };

        // ── 최상위 댓글 작성 ──
        $scope.addComment = function (p) {
            // 특정 게시글 p에 새 댓글을 추가하는 함수
            const text = (p._newComment || '').trim(); // 1) 입력값 방어: null/undefined → '' 처리 후 공백 제거
            if (!text) return; // 2) 빈 문자열이면 서버 호출 없이 종료

            const url = // 3) 글 식별 방식에 따라 댓글 API URL 결정
                p._keyType === 'num'
                    ? '/api/posts/' + encodeURIComponent(p._key) + '/comments' //    숫자 PK:  /api/posts/{id}/comments
                    : p._keyType === 'str'
                    ? '/api/posts/key/' + encodeURIComponent(p._key) + '/comments' //    문자열 키: /api/posts/key/{uuid}/comments
                    : null; //    식별 불가 시 null

            if (!url) return alert('이 글은 댓글 기능을 사용할 수 없습니다.'); // 4) 키 타입을 몰라 URL 생성 실패 → 사용자 안내 후 종료

            $http.post(url, { content: text }).then((res) => {
                // 5) POST 요청: 본문은 최소 필드 {content}
                const created = res.data || {}; // 6) 서버가 반환한 생성된 댓글 DTO(없으면 빈 객체)
                p.comments = p.comments || []; // 7) p.comments 배열이 없을 수 있어 방어적으로 초기화
                p.comments.push(created); // 8) 목록 맨 뒤에 방금 생성된 댓글을 추가(낙관적 갱신)
                p._newComment = ''; // 9) 입력창 비우기(UX)
            });
        };

        // ── 대댓글(답글) 입력창 열기/닫기 ──
        $scope.startReply = function (c) {
            c._replying = true;
            c._replyText = '';
        };
        $scope.cancelReply = function (c) {
            c._replying = false;
            c._replyText = '';
        };

        // ── 대댓글 등록 ──
        $scope.submitReply = function (p, parent) {
            // 게시글 p의 특정 부모 댓글(parent)에 대댓글을 등록
            const text = (parent._replyText || '').trim(); // 1) 입력값 방어: null/undefined → '' 처리 후 공백 제거
            if (!text) return; // 2) 빈 문자열이면 서버 호출 없이 종료

            if (!parent || !parent.uuid)
                // 3) 대댓글은 반드시 '부모 댓글의 uuid'가 필요
                return alert('이 댓글은 대댓글 키(uuid)를 알 수 없습니다.'); //    uuid 없으면 안내 후 종료

            const url = '/api/comments/key/' + encodeURIComponent(parent.uuid) + '/replies';
            // 4) 대댓글 등록 REST 경로 구성:
            //    POST /api/comments/key/{parentUuid}/replies

            $http
                .post(url, { content: text }) // 5) 서버에 대댓글 생성 요청(본문은 최소 필드 {content})
                .then((res) => {
                    // 6) 성공 콜백
                    const created = res.data || {}; //    서버가 반환한 생성된 대댓글 DTO(없으면 빈 객체)
                    p.comments = p.comments || []; //    댓글 배열이 없을 수 있어 방어적으로 초기화
                    p.comments.push(created); //    목록에 새 대댓글 추가(낙관적 갱신)
                    parent._replying = false; //    부모 댓글의 '답글 입력창 열림' 상태 해제
                    parent._replyText = ''; //    입력창 비우기(UX)
                })
                .catch(() => {
                    // 7) 실패 콜백(네트워크/4xx/5xx)
                    alert('대댓글 등록에 실패했습니다.'); //    단순 에러 안내
                });
        };

        $scope.startEditComment = function (c) {
            // 특정 댓글 c를 "수정 모드"로 전환하는 함수
            if (!canEditComment(c))
                // 1) 현재 사용자가 이 댓글을 수정할 권한이 있는지(작성자/관리자) 체크
                return alert('본인이 쓴 댓글만 수정할 수 있습니다.'); //    권한 없으면 안내 후 즉시 종료

            c._editing = true; // 2) 수정 모드 토글 ON → 템플릿에서 편집 UI가 보이도록 제어
            c._editContent = c.content; // 3) 원본 본문을 편집용 버퍼(_editContent)로 복사
        }; //    (저장 전까진 원본 c.content는 바꾸지 않음 → 취소가 쉬움)

        $scope.cancelEditComment = function (c) {
            // 댓글 c의 "수정 모드"를 취소하는 함수
            c._editing = false; // 1) 수정 모드 OFF → 읽기 UI로 되돌아감
            c._editContent = ''; // 2) 편집 버퍼 초기화(입력값 폐기)
        };

        $scope.saveComment = function (p, c) {
            // 게시글 p의 댓글 c에 대해 "수정 내용을 저장"하는 함수
            if (!canEditComment(c))
                // 1) 프런트 1차 가드: 작성자 본인/관리자만 허용
                return alert('본인이 쓴 댓글만 수정할 수 있습니다.'); //    불가 시 안내 후 종료

            const newText = (c._editContent || '').trim(); // 2) 편집 버퍼에서 텍스트 가져와 공백 제거(널 안전 처리)
            if (!newText) return; // 3) 빈 내용은 저장하지 않음(간단 유효성 검사)

            if (!c.uuid)
                // 4) 서버에 수정 요청하려면 댓글 식별자(uuid)가 필수
                return alert('이 댓글은 수정용 키를 알 수 없어 수정할 수 없습니다.'); //    uuid가 없으면 요청 불가 → 안내 후 종료

            // (여기서 일반적으로)
            // - PUT /api/comments/key/{uuid} 로 {content: newText} 전송
            // - 성공 시: c.content = newText; c._editing = false; c._editContent = '';
            // - 실패 시: 상태 코드(401/403/500 등)에 따라 안내

            $http
                .put(
                    // HTTP PUT 메서드로 서버에 '수정' 요청 전송
                    '/api/comments/key/' + encodeURIComponent(c.uuid), // 엔드포인트: 댓글 UUID를 경로 변수로 사용
                    { content: newText } // 요청 본문(JSON): 변경할 내용만 전달
                )
                .then(function (res) {
                    // 성공 콜백(2xx 응답)
                    c.content = newText; // 화면의 원본 본문을 새 텍스트로 즉시 반영(낙관적 갱신)
                    if (res && res.data && res.data.updatedAt)
                        // 서버가 updatedAt(수정시간)을 내려줬다면
                        c.updatedAt = res.data.updatedAt; // 댓글의 수정 시각도 최신 값으로 갱신
                    c._editing = false; // 수정 모드 종료(편집 UI → 보기 UI 전환)
                    c._editContent = ''; // 편집 버퍼 초기화(다음 편집을 위해 비움)
                })
                .catch(function (err) {
                    // 실패 콜백(4xx/5xx/네트워크 오류)
                    if (err && err.status === 403)
                        // 403이면 권한 부족(작성자 불일치) 시나리오
                        alert('본인이 쓴 댓글만 수정할 수 있습니다.'); // 사용자에게 권한 안내
                    // 그 외 에러(401/404/500/네트워크 등)
                    else alert('수정에 실패했습니다.'); // 일반 실패 메시지
                });
        };

        $scope.deleteComment = function (p, c) {
            // 게시글 p의 댓글 c를 삭제하는 함수
            if (!canEditComment(c))
                // 1) 프런트 1차 가드: 작성자 본인/관리자만 허용
                return alert('본인이 쓴 댓글만 삭제할 수 있습니다.'); //    권한 없으면 안내 후 종료
            if (!confirm('댓글을 삭제할까요?')) return; // 2) 사용자 확인(취소 시 종료)

            if (c && c.uuid) {
                // 3) 댓글이 UUID 식별자를 갖는 경우(현행 스키마)
                $http
                    .delete('/api/comments/key/' + encodeURIComponent(c.uuid)) //    DELETE /api/comments/key/{uuid}
                    .then(function () {
                        //    성공 콜백
                        p.comments = (p.comments || []).filter(function (x) {
                            //    화면 목록에서 해당 댓글만 제거
                            return x.uuid !== c.uuid; //    uuid 불일치만 남김
                        });
                    })
                    .catch(function (err) {
                        //    실패 콜백
                        if (err && err.status === 403)
                            //    403이면 작성자 불일치/권한 부족
                            alert('본인이 쓴 댓글만 삭제할 수 있습니다.');
                        else alert('삭제 실패'); //    그 외(401/404/500/네트워크 등)
                    });
                return; //    UUID 경로 처리 끝
            }

            const id = c && c.commentId; // 4) 레거시: 숫자 PK(commentId) 사용 가능성 점검
            if (typeof id === 'number' && isFinite(id)) {
                //    정상 숫자이면
                $http
                    .delete('/api/comments/' + encodeURIComponent(id)) //    DELETE /api/comments/{id} (레거시 호환)
                    .then(function () {
                        //    성공 콜백
                        p.comments = (p.comments || []).filter(function (x) {
                            //    목록에서 해당 ID 댓글 제거
                            return x.commentId !== id; //    id 불일치만 남김
                        });
                    })
                    .catch(function () {
                        //    실패 콜백(간단 처리)
                        alert('삭제 실패');
                    });
                return; //    숫자 PK 경로 처리 끝
            }

            alert('이 댓글은 삭제용 키를 알 수 없어 삭제할 수 없습니다.'); // 5) uuid도, 숫자 PK도 없으면 삭제 불가 안내
        };
    });

    // ───────────────── 게시판 라우트별 컨트롤러 ─────────────────
    // 게시판(버스) 목록 화면용 컨트롤러 정의
    app.controller('BoardBusCtrl', function ($scope, $controller) {
        // DI로 $scope(뷰 모델)와 $controller(컨트롤러 재사용 도우미) 주입
        angular.extend(
            // 대상 객체에 속성을 복사/혼합(Mixin)하는 유틸 함수
            this, // 현재 컨트롤러 인스턴스(= BoardBusCtrl)
            $controller('BoardBaseCtrl', { $scope }) // 'BoardBaseCtrl'을 생성해 반환되는 컨트롤러 인스턴스의 멤버를 가져온다
        ); // → 결과적으로 BoardBusCtrl이 BoardBaseCtrl의 함수/속성을 그대로 갖게 됨(상속/믹스인 효과)

        $scope.boardCode = 'BUS'; // 공통 베이스 로직이 참조할 게시판 코드(버스 전용) 지정
        $scope.loadPosts(); // 베이스 컨트롤러가 제공한 목록 로더 호출(현재 boardCode='BUS'로 게시글 조회)
    });

    // 게시판(일반) 목록 화면용 컨트롤러 정의
    app.controller('BoardNormalCtrl', function ($scope, $controller) {
        // 동일하게 $scope/$controller 주입
        angular.extend(
            // 베이스 컨트롤러 기능을 섞어서 재사용
            this, // 현재 컨트롤러 인스턴스(= BoardNormalCtrl)
            $controller('BoardBaseCtrl', { $scope }) // 같은 $scope를 넘겨 동일한 모델/메서드를 공유하도록 생성
        );

        $scope.boardCode = 'NORM'; // 일반 게시판 코드 지정
        $scope.loadPosts(); // 현재 boardCode='NORM'로 목록 로딩
    });

    // ───────────────── Roles ─────────────────
    app.controller('RolesCtrl', function ($scope, $http, AuthService) {
        $scope.isAdmin = false;
        $scope.loading = true;
        $scope.saving = false;
        $scope.rows = [];
        $scope.msg = '';
        $scope.msgType = 'info';
        function notify(type, text, ms) {
            $scope.msgType = type;
            $scope.msg = text;
            if (ms) setTimeout(() => $scope.$applyAsync(() => ($scope.msg = '')), ms);
        }

        $scope.load = function () {
            $scope.loading = true;
            $http
                .get('/api/admin/roles')
                .then((res) => {
                    $scope.rows = Array.isArray(res.data) ? res.data : [];
                    notify('info', '권한 목록을 불러왔습니다.', 1200);
                })
                .catch((err) => {
                    if (err && err.status === 403) notify('error', '관리자 전용 페이지입니다.', 2500);
                    else notify('error', '권한 목록을 불러오지 못했습니다.', 2500);
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
                })
                .catch((err) => notify('error', err && err.data ? err.data : '저장 중 오류가 발생했습니다.', 2500))
                .finally(() => {
                    $scope.saving = false;
                });
        };

        AuthService.loadMe(true).finally(() => {
            $scope.isAdmin = isAdminFrom(AuthService.getMe());
            if ($scope.isAdmin) $scope.load();
            else $scope.loading = false;
        });
    });

    // ───────────────── DB Users ─────────────────
    app.controller('DbUsersCtrl', function ($scope, $http, $q, $location, AuthService) {
        $scope.isAdmin = false;
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';

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

        $scope.loadUsers = function () {
            if (!$scope.isAdmin) return;
            setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');
            const usersP = $http.get('/user').then((res) => (Array.isArray(res.data) ? res.data : []));
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
