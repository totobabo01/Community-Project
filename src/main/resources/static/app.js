// src/main/resources/static/app.js
(function () {
    'use strict';

    const app = angular.module('busApp', ['ngRoute']);

    // HTML 태그 + data:image base64 + [[file:...]] 토큰 + "파일 2" 같은 레이블 지우는 필터
    // HTML 태그 + data:image base64 + [[file:...]] 토큰 + "파일 2" 같은 레이블 지우는 필터
    app.filter('stripHtml', function () {
        return function (input) {
            if (!input) return '';

            var text = String(input);

            // 0) [[file:...]] 토큰 제거 (예: [[file:1 width=100]])
            text = text.replace(/\[\[file:[^\]]+\]\]/gi, '');

            // 1) HTML 태그 제거
            text = text.replace(/<[^>]+>/g, '');

            // 2) data:image ... base64=~~~ 이런 거 통째로 제거
            text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '');

            // 3) 토큰/메타에서 남은 "파일 1", "[파일 2]" 같은 텍스트 제거
            text = text.replace(/\[?\s*파일\s*\d+\\s*\]?/g, '');

            // 4) "첨부 파일" 문구 제거
            text = text.replace(/첨부\s*파일/gi, '');

            // ✅ 4.5) &nbsp; → 일반 공백으로
            text = text.replace(/&nbsp;/gi, ' ');

            // 5) 공백 정리
            text = text.replace(/\s+/g, ' ');

            return text.trim();
        };
    });

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
            .when('/board/:code/view/:type/:key', {
                templateUrl: '/tpl/board/post-view.html', // 실제 파일 위치에 맞게
                controller: 'BoardViewCtrl',
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
        // ================== 버스 지도/검색 ==================
        const DAEJEON_CENTER = [127.3845, 36.3504]; // 경도, 위도 (대전 중심)

        $scope.keyword = '';
        $scope.statusMessage = '';
        $scope.statusType = '';

        let ngiiMap = null; // ngii_wmts.map 객체 (OpenLayers 기반)
        // 나중에 정류장 마커용 레이어를 올리려면 여기서 따로 관리하면 됨
        // let markerLayer = null;

        // 상태 메시지 헬퍼
        function setStatus(type, msg, ms) {
            setTimed($scope, 'statusType', 'statusMessage', type, msg, ms, $timeout);
        }

        // ✅ 국토지리정보원 지도 초기화 (ngii_wmts.map 사용)
        function initMap() {
            if (ngiiMap) return; // 한 번만 생성

            if (!window.ngii_wmts || !ngii_wmts.map) {
                console.error('[NGII] ngii_wmts.map 을 찾을 수 없습니다. 스크립트 로딩 확인 필요');
                return;
            }

            // 샘플 코드: new ngii_wmts.map("map1", { zoom: 2 });
            // 우리 프로젝트: id="busMap" 에 붙이고, 처음엔 한국 전체가 보이게 zoom 적당히 4~7 사이
            ngiiMap = new ngii_wmts.map('busMap', {
                zoom: 7, // 전국보다는 좀 더 확대된 정도
            });

            // center 옵션은 샘플엔 없어서, 제공 여부가 애매해서
            // 먼저 map 생성 후 setCenter / setZoom 함수가 있으면 사용
            try {
                if (ngiiMap.setCenter && ngiiMap.setZoom) {
                    // 좌표계는 NGII 설명대로 EPSG:5179(중부원점)일 가능성이 큼.
                    // 대부분의 래퍼에서 경도, 위도를 그대로 넘기면 내부에서 변환해주므로 일단 그대로 사용.
                    ngiiMap.setCenter(DAEJEON_CENTER[0], DAEJEON_CENTER[1]); // (x=경도, y=위도)
                    ngiiMap.setZoom(7);
                }
            } catch (e) {
                console.warn('[NGII] setCenter / setZoom 호출 중 오류 (무시 가능):', e);
            }
        }

        // Angular가 DOM을 만든 뒤 지도 초기화 한 번 실행
        $timeout(initMap, 0);

        // ================== (정류장 검색 부분은 그대로 유지: 나중에 지도 위 마커 연동 가능) ==================
        $scope.searchStops = function () {
            const kw = ($scope.keyword || '').trim();

            if (!kw) {
                setStatus('error', '정류장 이름을 입력해 주세요.', 1500);
                return;
            }

            initMap(); // 혹시 아직 안 만들어졌으면 생성

            setStatus('info', '⏳ 정류장 정보를 불러오는 중입니다...', 0);

            const params = {
                pageNo: 1,
                numOfRows: 300,
                stNm: kw, // 정류장 이름 검색
            };

            $http
                .get('/api/bus/stops', { params })
                .then(function (res) {
                    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

                    let list = [];
                    if (Array.isArray(data)) {
                        list = data;
                    } else if (data?.response?.body?.items) {
                        const it = data.response.body.items.item || data.response.body.items.bs || [];
                        list = Array.isArray(it) ? it : [it];
                    } else if (data?.body?.items) {
                        const it = data.body.items.item || data.body.items.bs || [];
                        list = Array.isArray(it) ? it : [it];
                    }

                    if (!Array.isArray(list) || !list.length) {
                        setStatus('error', '❗ "' + kw + '" 정류장을 찾지 못했습니다.', 2000);
                        return;
                    }

                    // 🔥 여기서부터는 “NGII 지도 위에 마커 올리기” 부분인데,
                    //   ngii_wmts 래퍼의 마커 API를 정확히 알아야 해서
                    //   일단은 검색 성공 메시지만 띄우고, 마커는 다음 단계에서 같이 맞춰보자.
                    //
                    // console.log(list);  // 좌표(xPos/yPos 또는 gpsX/gpsY)를 잘 넘어오는지 확인용

                    setStatus('success', '✅ "' + kw + '" 관련 정류장 ' + list.length + '곳을 찾았습니다. (지도 마커는 다음 단계에서 추가 예정)', 2500);
                })
                .catch(function () {
                    setStatus('error', '❌ 정류장 정보를 불러오지 못했습니다.', 2500);
                });
        };

        // ================== (아래는 기존 "사용자 미니 관리" 그대로) ==================
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
    // src/main/resources/static/app.js 중 일부

    app.controller('BoardBaseCtrl', function ($scope, $http, AuthService, $location, $routeParams) {
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

        // ───── 게시판 코드 계산 ─────
        function getBoardCode() {
            // 컨트롤러에서 넣어준 boardCode 우선, 없으면 URL 파라미터 code 사용
            return String($scope.boardCode || $routeParams.code || 'BUS').toLowerCase();
        }

        // ───── 글 상세 보기 이동 ─────
        $scope.goView = function (p) {
            if (!p) return;

            var keyInfo = resolvePostKey(p);
            if (!keyInfo.key) return;

            var code = getBoardCode(); // bus, normal, big ...
            var type = keyInfo.type; // 'num' 또는 'str'
            var key = keyInfo.key;

            // 라우팅 규칙: /#/board/:code/view/:type/:key
            $location.path('/board/' + code + '/view/' + type + '/' + encodeURIComponent(key)).search({});
        };

        // ───── 글 수정 화면 이동 ─────
        $scope.goEdit = function (p) {
            if (!p) return;
            if (!canEditPost(p)) {
                alert('본인이 쓴 글만 수정할 수 있습니다.');
                return;
            }

            var keyInfo = resolvePostKey(p);
            if (!keyInfo.key) return;

            var code = getBoardCode();
            var type = keyInfo.type;
            var key = keyInfo.key;

            // 라우팅 규칙: /#/board/:code/edit/:type/:key
            $location.path('/board/' + code + '/edit/' + type + '/' + encodeURIComponent(key)).search({});
        };

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
            if ($scope.q.type === 'time') {
                params.type = 'time';
                if ($scope.q.from) params.from = $scope.q.from;
                if ($scope.q.to) params.to = $scope.q.to;
            } else {
                const kw = ($scope.q.keyword || '').trim();
                if (kw) {
                    params.type = $scope.q.type || 'author';
                    params.keyword = kw;
                }
            }

            // ────────── URL 결정 (일반 게시판 vs 대용량 게시판) ──────────
            let url;
            if ($scope.boardCode === 'BIG') {
                url = '/api/big-board/posts';
            } else {
                url = '/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts';
            }

            // ────────── 실제 HTTP GET 요청 ──────────
            $http
                .get(url, { params })
                .then((res) => {
                    const data = res.data || {};

                    const list = Array.isArray(data.content) ? data.content : Array.isArray(data.rows) ? data.rows : Array.isArray(data.list) ? data.list : Array.isArray(data) ? data : [];

                    const src = Array.isArray(list) ? list : [];

                    // ────────── 첨부파일/썸네일 정규화용 로컬 함수 ──────────
                    function normalizeFileMetaLocal(raw) {
                        if (!raw) return null;
                        const url = raw.url || raw.fileUrl || raw.downloadUrl || raw.path || raw.link || null;
                        const fileName = raw.originalFilename || raw.fileName || raw.filename || raw.name || raw.originName || null;
                        const fileType = raw.fileType || raw.type || raw.contentType || raw.fileContentType || null;
                        const size = raw.fileSize || raw.size || null;
                        return { url, fileName, fileType, size };
                    }

                    function safeParseFileListLocal(json) {
                        if (!json) return [];
                        try {
                            const v = JSON.parse(json);
                            let arr = [];
                            if (Array.isArray(v)) arr = v;
                            else if (v && Array.isArray(v.files)) arr = v.files;
                            else if (v && Array.isArray(v.list)) arr = v.list;
                            else if (v && typeof v === 'object') arr = [v];
                            else arr = [];

                            const norm = [];
                            arr.forEach(function (one) {
                                const m = normalizeFileMetaLocal(one);
                                if (m && m.url) norm.push(m);
                            });
                            return norm;
                        } catch (e) {
                            console.warn('file_list_json parse error (list):', e, json);
                            return [];
                        }
                    }

                    function isImageMeta(m) {
                        if (!m) return false;
                        const t = String(m.fileType || '').toLowerCase();
                        const name = String(m.fileName || '');
                        if (t.indexOf('image/') === 0) return true;
                        return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name);
                    }

                    // ────────── key / 첨부 / 썸네일 세팅 ──────────
                    const mapped = src.map((p, i) => {
                        // 기본 키 세팅
                        const r = resolvePostKey(p);
                        p._keyType = r.type;
                        p._key = r.key;
                        p._uid = makePostUid(p, i);

                        // 첨부파일 정리
                        let fileList = safeParseFileListLocal(p.fileListJson || p.file_list_json);

                        // 구버전: 단일 파일 컬럼만 있는 경우
                        if ((!fileList || fileList.length === 0) && p.fileUrl) {
                            fileList = [
                                normalizeFileMetaLocal({
                                    url: p.fileUrl,
                                    fileName: p.fileName,
                                    fileType: p.fileType,
                                    fileSize: p.fileSize,
                                }),
                            ].filter(Boolean);
                        }

                        if (fileList && fileList.length > 0) {
                            p.attachments = fileList;
                            const first = fileList[0];

                            // 목록 썸네일/아이콘용 필드 채우기
                            if (!p.fileUrl) p.fileUrl = first.url;
                            if (!p.fileName) p.fileName = first.fileName;
                            if (!p.fileSize && first.size != null) p.fileSize = first.size;

                            if (!p.fileType) {
                                p.fileType = isImageMeta(first) ? 'IMAGE' : 'FILE';
                            }
                        } else {
                            p.attachments = p.attachments || [];
                        }

                        return p;
                    });

                    // ────────── 대용량 게시판 vs 일반 게시판 ──────────
                    if ($scope.boardCode === 'BIG') {
                        $scope._allBigPosts = mapped || [];
                        $scope.lazyLoaded = Math.min($scope.lazyChunkSize, $scope._allBigPosts.length);
                        $scope.posts = $scope._allBigPosts.slice(0, $scope.lazyLoaded);
                    } else {
                        $scope.posts = mapped;
                    }

                    // ────────── 페이지 관련 값 세팅 ──────────
                    $scope.page = typeof data.page === 'number' ? data.page : typeof data.number === 'number' ? data.number : $scope.page;

                    $scope.pageSize = toInt(typeof data.size === 'number' ? data.size : $scope.pageSize, 10);

                    const hasTotal = typeof data.total === 'number' || typeof data.totalElements === 'number';
                    const serverTotal = typeof data.total === 'number' ? data.total : data.totalElements;
                    const serverTotalPages = typeof data.totalPages === 'number' ? data.totalPages : typeof data.pages === 'number' ? data.pages : undefined;

                    if (hasTotal) {
                        $scope.total = serverTotal;
                        $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
                    } else if (serverTotalPages !== undefined) {
                        $scope.pages = Math.max(1, serverTotalPages);
                        $scope.total = $scope.pages * Math.max(1, toInt($scope.pageSize, 10));
                    } else {
                        const curLen = Array.isArray(src) ? src.length : 0;
                        $scope.total = Math.max($scope.total || 0, curLen * Math.max(1, toInt($scope.pageSize, 10)));
                        $scope.pages = Math.max(1, Math.ceil($scope.total / Math.max(1, toInt($scope.pageSize, 10))));
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

        // ✅ BIG 전용: 아래로 더 스크롤하거나 버튼 눌렀을 때 100개씩 더 보이게
        $scope.loadMore = function () {
            if ($scope.boardCode !== 'BIG') return;
            if (!$scope._allBigPosts || !$scope._allBigPosts.length) return;

            var next = $scope.lazyLoaded + $scope.lazyChunkSize;
            if (next > $scope._allBigPosts.length) {
                next = $scope._allBigPosts.length;
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
        // ====== ★ 게시글 CRUD(추가) — 저장 후 항상 새로고침 ======
        $scope.createPost = function () {
            if (!$scope.newPost) $scope.newPost = {};

            // 🔁 TinyMCE 내용에서 data-file-index 가진 <img>를 [[file:n]] 토큰으로 변환
            if (window.tinymce) {
                var editor = window.tinymce.get('busEditor');
                if (editor) {
                    var html = editor.getContent() || '';

                    html = html.replace(/<img[^>]*data-file-index="(\d+)"[^>]*>/gi, function (full, idxStr) {
                        var idx = parseInt(idxStr, 10);
                        if (!isFinite(idx)) idx = 0;
                        var n = idx + 1; // 0-base → 1-base
                        // 필요하면 width 옵션은 나중에 커스터마이징 가능
                        return '[[file:' + n + ' width=100%]]';
                    });

                    $scope.newPost.content = html;
                }
            }

            const title = ($scope.newPost.title || '').trim();
            const content = ($scope.newPost.content || '').trim();

            if (!title) {
                alert('제목을 입력하세요.');
                return;
            }

            const isFolder = !!$scope.newPost.isFolder;
            const folderName = ($scope.newPost.folderName || '').trim();

            const files = $scope.newPost.files || [];
            const fileInput = document.getElementById('postFile');

            const fd = new FormData();
            fd.append('title', title);
            fd.append('content', content);

            if (isFolder) {
                fd.append('isFolder', 'true');
                if (folderName) fd.append('folderName', folderName);
            } else {
                if (files && files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        fd.append('file', files[i]);
                    }
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
    });

    // ───────────────── 게시글 편집 전용 컨트롤러 ─────────────────
    // AngularJS 모듈(app)에 "BoardEditCtrl" 이라는 이름의 컨트롤러를 등록한다.
    // src/main/resources/static/app.js 안의 BoardEditCtrl 전체 교체

    // src/main/resources/static/app.js 中 일부: BoardEditCtrl 전체 교체
    app.controller('BoardEditCtrl', function ($scope, $http, $routeParams, $location, $sce, $timeout) {
        'use strict';

        $scope.loading = true;
        $scope.saving = false;
        $scope.deleting = false;

        const code = String($routeParams.code || '').toUpperCase(); // 'BUS' / 'NORM' / 'BIG'
        const type = String($routeParams.type || 'str'); // 'num' | 'str'
        const key = $routeParams.key; // 글 id 또는 uuid

        // BIG 게시판만 그대로 HTML, 그 외(BUS/NORM)는 토큰 사용
        const USE_TOKEN = code !== 'BIG';

        // 편집 폼
        $scope.form = {
            title: '',
            content: '', // 서버로 보낼 최종 문자열 (BUS/NORM → 토큰 문자열, BIG → HTML)
            files: null, // 새로 선택한 파일들
        };

        // 메타/첨부 정보
        $scope.meta = null;
        $scope.attachments = [];

        // ───────────────── 목록으로 돌아가기 ─────────────────
        function backToList() {
            let pathCode;

            switch (code) {
                case 'BUS':
                    pathCode = 'bus';
                    break;
                case 'NORM': // 일반 게시판은 /board/normal
                    pathCode = 'normal';
                    break;
                case 'BIG':
                    pathCode = 'big';
                    break;
                default:
                    pathCode = code.toLowerCase();
            }

            $location.path('/board/' + pathCode).search({});
        }

        // 템플릿에서 쓰는 이름 둘 다 연결
        $scope.cancel = backToList;
        $scope.goList = backToList;

        // ───────────────── 메타 정규화 ─────────────────
        function normalizeMeta(p) {
            const meta = angular.copy(p.meta || {}) || {};

            if (!meta.fileList && p.fileList) meta.fileList = p.fileList;
            if (!meta.fileList && p.file_list_json) {
                if (angular.isString(p.file_list_json)) {
                    try {
                        meta.fileList = JSON.parse(p.file_list_json);
                    } catch (e) {
                        meta.fileList = [];
                    }
                } else if (angular.isArray(p.file_list_json)) {
                    meta.fileList = p.file_list_json;
                }
            }
            meta.fileList = meta.fileList || [];

            meta.fileUrl = meta.fileUrl || p.fileUrl || p.file_url || null;
            meta.fileName = meta.fileName || p.fileName || p.file_name || null;
            meta.fileType = meta.fileType || p.fileType || p.file_type || null;

            meta.writerName = meta.writerName || p.writerName || p.writer_name || null;
            meta.writerId = meta.writerId || p.writerId || p.writer_id || null;
            meta.createdAt = meta.createdAt || p.createdAt || p.created_at || null;
            meta.updatedAt = meta.updatedAt || p.updatedAt || p.updated_at || null;

            return meta;
        }

        // ───────────────── 토큰 → 에디터용 HTML ─────────────────
        // [[file:n width=.. align=..]] → <img data-file-index="..."> + style
        function tokensToEditorHtml(content, meta) {
            if (!USE_TOKEN) return content || '';

            const m = meta || {};
            let html = content || '';

            // 예전 "[파일 2]", "첨부 파일" 같은 찌꺼기 제거
            html = html.replace(/\[?\s*파일\s*\d+\s*\]?/gi, '').replace(/첨부\s*파일/gi, '');

            const tokenRe = /\[\[file:(\d+)([^\]]*)\]\]/gi;

            html = html.replace(tokenRe, function (_, numStr, attrStr) {
                const n = parseInt(numStr, 10);
                const idx = n - 1;

                let widthRaw = null; // "50", "50%", "300px"
                let align = 'center';

                attrStr = attrStr || '';

                // width=50 / width=50% / width=300px
                const mWidth = /width\s*=\s*([0-9]{1,4}(?:px|%)?)/i.exec(attrStr);
                if (mWidth && mWidth[1]) widthRaw = mWidth[1];

                // align=left|right|center
                const mAlign = /align\s*=\s*(left|right|center)/i.exec(attrStr);
                if (mAlign && mAlign[1]) align = mAlign[1].toLowerCase();

                let url = null;
                let fileName = null;

                if (m.fileList && m.fileList.length >= n) {
                    const f = m.fileList[idx] || {};
                    url = f.url || f.fileUrl || f.downloadUrl || f.path || null;
                    fileName = f.fileName || f.originalFilename || f.filename || f.name || '파일 ' + n;
                } else if ((!m.fileList || m.fileList.length === 0) && n === 1) {
                    // 예전 단일 파일 방식
                    url = m.fileUrl || m.url || null;
                    fileName = m.fileName || '첨부 파일';
                }

                // url 이 없으면 아예 제거
                if (!url) return '';

                // style 조립
                const styleParts = [];

                if (widthRaw) {
                    if (/^\d+$/.test(widthRaw)) {
                        // 숫자만 오면 %로 간주
                        styleParts.push('width:' + parseInt(widthRaw, 10) + '%');
                    } else {
                        styleParts.push('width:' + widthRaw);
                    }
                    styleParts.push('max-width:100%');
                } else {
                    styleParts.push('max-width:100%');
                }

                styleParts.push('height:auto');
                styleParts.push('border-radius:8px');

                if (align === 'left') {
                    styleParts.push('float:left');
                    styleParts.push('margin:8px 12px 8px 0');
                } else if (align === 'right') {
                    styleParts.push('float:right');
                    styleParts.push('margin:8px 0 8px 12px');
                } else {
                    // center
                    styleParts.push('display:block');
                    styleParts.push('margin:16px auto');
                }

                const styleAttr = styleParts.join(';');

                return '<img src="' + url + '" data-file-index="' + idx + '" style="' + styleAttr + ';" alt="' + (fileName || '') + '"/>';
            });

            return html;
        }

        // ───────────────── 에디터 HTML → 토큰 ─────────────────
        // img[data-file-index] → [[file:n width=.. align=..]]
        function editorHtmlToTokens(html) {
            if (!USE_TOKEN) return html || '';
            if (!window.jQuery) return html || '';

            const $ = window.jQuery;
            const $root = $('<div>').html(html || '');

            $root.find('img[data-file-index]').each(function () {
                const $img = $(this);
                const idx = parseInt($img.attr('data-file-index'), 10);

                if (isNaN(idx) || idx < 0) {
                    $img.remove();
                    return;
                }

                const n = idx + 1;
                let widthRaw = null;
                let align = 'center';

                const style = $img.attr('style') || '';

                // width: 50%; / width: 300px;
                const mWidth = /width\s*:\s*([0-9\.]+(?:px|%)?)/i.exec(style);
                if (mWidth && mWidth[1]) widthRaw = mWidth[1];

                // 정렬 추출
                if (/float\s*:\s*left/i.test(style) || /margin-right\s*:\s*\d+px/i.test(style)) {
                    align = 'left';
                } else if (/float\s*:\s*right/i.test(style) || /margin-left\s*:\s*\d+px/i.test(style)) {
                    align = 'right';
                } else {
                    align = 'center';
                }

                // 토큰 문자열 생성
                let token = '[[file:' + n;
                if (widthRaw) token += ' width=' + widthRaw;
                if (align) token += ' align=' + align;
                token += ']]';

                $img.replaceWith(token);
            });

            return $root.html() || '';
        }

        // ───────────────── Summernote 에디터 초기화 ─────────────────
        function initEditor(initialHtml) {
            $timeout(function () {
                if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.summernote) return;

                const $ = window.jQuery;
                const $editor = $('#editEditor');
                if (!$editor.length) return;

                if ($editor.data('summernote')) {
                    $editor.summernote('destroy');
                }

                $editor.summernote({
                    height: 260,
                    placeholder: '내용을 입력하세요.',
                    lang: 'ko-KR',
                    toolbar: [
                        ['style', ['bold', 'italic', 'underline', 'clear']],
                        ['para', ['ul', 'ol', 'paragraph']],
                        ['insert', ['link', 'picture']],
                        ['view', ['codeview']],
                    ],
                    callbacks: {
                        onInit: function () {
                            const html = initialHtml != null ? initialHtml : tokensToEditorHtml($scope.form.content || '', $scope.meta);
                            $editor.summernote('code', html);
                        },
                        onChange: function (contents) {
                            $scope.$applyAsync(function () {
                                $scope.form.content = editorHtmlToTokens(contents);
                            });
                        },
                        // 에디터 안으로 직접 드롭/붙여넣기 했을 때
                        onImageUpload: function (files) {
                            if (!files || !files.length) return;

                            Array.prototype.slice.call(files).forEach(function (file) {
                                $scope.$applyAsync(function () {
                                    // form.files 를 항상 배열로 유지
                                    var cur = $scope.form && $scope.form.files;
                                    var list;
                                    if (Array.isArray(cur)) {
                                        list = cur;
                                    } else if (cur && typeof cur.length === 'number' && typeof cur.item === 'function') {
                                        list = Array.prototype.slice.call(cur);
                                    } else if (cur) {
                                        list = [cur];
                                    } else {
                                        list = [];
                                    }

                                    $scope.form.files = list;

                                    if (file._previewed) return;
                                    file._previewed = true;

                                    var idx = $scope.form.files.push(file) - 1;

                                    var reader = new FileReader();
                                    reader.onload = function (e) {
                                        $('#editEditor').summernote('insertImage', e.target.result, function ($img) {
                                            $img.attr('data-file-index', idx);
                                        });
                                    };
                                    reader.readAsDataURL(file);
                                });
                            });
                        },
                    },
                });

                $scope._editEditorEl = $editor;
            }, 0);
        }

        // 파일 input으로 선택했을 때 자동 미리보기
        $scope.$watch(
            function () {
                return $scope.form && $scope.form.files;
            },
            function (newVal) {
                if (!newVal || !window.jQuery) return;

                const $ = window.jQuery;
                const $editor = $('#editEditor');
                if (!$editor.length || !$editor.data('summernote')) return;

                let list;
                if (Array.isArray(newVal)) {
                    list = newVal;
                } else if (typeof newVal.length === 'number' && typeof newVal.item === 'function') {
                    list = Array.prototype.slice.call(newVal);
                } else {
                    list = [newVal];
                }

                list.forEach(function (file, idx) {
                    if (!file || file._previewed) return;
                    file._previewed = true;

                    var reader = new FileReader();
                    reader.onload = function (e) {
                        $editor.summernote('insertImage', e.target.result, function ($img) {
                            $img.attr('data-file-index', idx);
                        });
                    };
                    reader.readAsDataURL(file);
                });
            }
        );

        // 컨트롤러 파괴 시 에디터 정리
        $scope.$on('$destroy', function () {
            if (window.jQuery) {
                const $ = window.jQuery;
                const $editor = $('#editEditor');
                if ($editor.length && $editor.data('summernote')) {
                    $editor.summernote('destroy');
                }
            }
        });

        // ───────────────── 단건 조회 (수정 진입 시) ─────────────────
        function fetchOne() {
            $scope.loading = true;

            let url = null;
            if (code === 'BIG' && type === 'num') {
                url = '/api/big-board/' + encodeURIComponent(key);
            } else if (type === 'num') {
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            $http
                .get(url)
                .then(function (res) {
                    const p = res.data || {};

                    $scope.meta = normalizeMeta(p);
                    $scope.attachments = ($scope.meta && $scope.meta.fileList) || [];

                    $scope.form = {
                        title: p.title || '',
                        content: p.content || '',
                        files: null,
                    };

                    // BUS/NORM 에서 예전 텍스트 찌꺼기 정리
                    if (USE_TOKEN) {
                        $scope.form.content = ($scope.form.content || '').replace(/\[?\s*파일\s*\d+\s*\]?/gi, '').replace(/첨부\s*파일/gi, '');
                    }

                    // 토큰이 없고 첨부파일만 있는 옛날 글 → 기본 토큰 추가
                    if (USE_TOKEN && $scope.meta.fileList && $scope.meta.fileList.length > 0 && !/\[\[file:\d+/.test($scope.form.content || '')) {
                        var extra = '';
                        $scope.meta.fileList.forEach(function (_, i) {
                            const n = i + 1;
                            extra += (extra ? '\n' : '\n\n') + '[[file:' + n + ' width=100]]';
                        });
                        $scope.form.content = ($scope.form.content || '').replace(/\s+$/, '') + extra;
                    }

                    const editorHtml = tokensToEditorHtml($scope.form.content, $scope.meta);
                    initEditor(editorHtml);
                })
                .catch(function (err) {
                    console.error('글 불러오기 실패', err);
                    alert('게시글을 불러오는 중 오류가 발생했습니다.');
                    backToList();
                })
                .finally(function () {
                    $scope.loading = false;
                });
        }

        // ───────────────── 저장 ─────────────────
        $scope.save = function () {
            if ($scope.saving) return;

            if (!$scope.form || !$scope.form.title) {
                alert('제목을 입력해 주세요.');
                return;
            }

            const payload = {
                title: $scope.form.title,
                content: $scope.form.content, // BUS/NORM → 토큰 문자열, BIG → HTML
            };

            let url = null;
            let method = 'PUT';

            if (code === 'BIG' && type === 'num') {
                url = '/api/big-board/' + encodeURIComponent(key);
            } else if (type === 'num') {
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            $scope.saving = true;

            let httpConfig;

            if (code === 'BIG') {
                httpConfig = {
                    method: method,
                    url: url,
                    data: payload,
                };
            } else if ($scope.form.files && $scope.form.files.length) {
                const fd = new FormData();
                fd.append('title', payload.title);
                fd.append('content', payload.content);

                Array.prototype.forEach.call($scope.form.files, function (f) {
                    fd.append('files', f);
                });

                httpConfig = {
                    method: method,
                    url: url,
                    data: fd,
                    transformRequest: angular.identity,
                    headers: { 'Content-Type': undefined },
                };
            } else {
                httpConfig = {
                    method: method,
                    url: url,
                    data: payload,
                };
            }

            $http(httpConfig)
                .then(function () {
                    alert('저장되었습니다.');
                    backToList(); // 저장 후 목록으로
                })
                .catch(function (err) {
                    console.error('저장 실패', err);
                    alert('저장 중 오류가 발생했습니다.');
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };

        // ───────────────── 삭제 ─────────────────
        $scope.remove = function () {
            if ($scope.deleting) return;
            if (!confirm('정말 삭제하시겠습니까?')) return;

            let url = null;

            if (code === 'BIG' && type === 'num') {
                url = '/api/big-board/' + encodeURIComponent(key);
            } else if (type === 'num') {
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            $scope.deleting = true;

            $http
                .delete(url)
                .then(function () {
                    alert('삭제되었습니다.');
                    backToList();
                })
                .catch(function (err) {
                    console.error('삭제 실패', err);
                    alert('삭제 중 오류가 발생했습니다.');
                })
                .finally(function () {
                    $scope.deleting = false;
                });
        };

        // 초기 로딩
        fetchOne();
    });

    // ───────────────── 게시글 상세 보기 컨트롤러 ─────────────────
    // src/main/resources/static/app.js 안의 BoardViewCtrl 부분
    // ───────────────── 게시글 상세 보기 컨트롤러 ─────────────────
    // src/main/resources/static/app.js 안의 BoardViewCtrl
    app.controller('BoardViewCtrl', function ($scope, $http, $routeParams, $location, AuthService, $sce) {
        $scope.loading = true;
        $scope.post = null;
        $scope.renderedContent = null;
        $scope.files = []; // ⬅ 첨부 목록(하단 리스트용)

        const rawCode = String($routeParams.code || '').toLowerCase(); // 'bus' | 'norm' | 'normal' | 'big'
        const key = $routeParams.key;
        const type = String($location.search().type || 'str').toLowerCase(); // 'num' | 'str'

        // ───────── 목록 경로 계산 ─────────
        function getListPath(code) {
            switch (code) {
                case 'bus':
                    return '/board/bus';
                case 'norm':
                case 'normal':
                    return '/board/normal';
                case 'big':
                    return '/board/big';
                default:
                    return '/board/bus';
            }
        }
        function backToList() {
            $location.path(getListPath(rawCode)).search({});
        }
        $scope.backToList = backToList;

        // ───────── 파일 메타 정규화 ─────────
        function normalizeFileMeta(raw) {
            if (!raw) return null;
            const url = raw.url || raw.fileUrl || raw.downloadUrl || raw.path || raw.link || null;
            const fileName = raw.originalFilename || raw.fileName || raw.filename || raw.name || raw.originName || null;
            const fileType = raw.fileType || raw.type || raw.contentType || raw.fileContentType || null;
            const size = raw.fileSize || raw.size || null;
            return { url, fileName, fileType, size };
        }

        function safeParseFileList(json) {
            if (!json) return [];
            try {
                const v = JSON.parse(json);
                let arr = [];
                if (Array.isArray(v)) arr = v;
                else if (v && Array.isArray(v.files)) arr = v.files;
                else if (v && Array.isArray(v.list)) arr = v.list;
                else if (v && typeof v === 'object') arr = [v];
                else arr = [];

                const norm = [];
                arr.forEach(function (one) {
                    const m = normalizeFileMeta(one);
                    if (m && m.url) norm.push(m);
                });
                return norm;
            } catch (e) {
                console.warn('file_list_json parse error:', e, json);
                return [];
            }
        }

        // ───────── 파일 관련 유틸 ─────────
        $scope.getFileExt = function (fileOrName) {
            if (!fileOrName) return '확장자 없음';
            var name = fileOrName;
            if (fileOrName.fileName) name = fileOrName.fileName;
            if (fileOrName.name) name = fileOrName.name;

            var idx = String(name).lastIndexOf('.');
            if (idx < 0) return '확장자 없음';
            return String(name)
                .substring(idx + 1)
                .toLowerCase();
        };

        $scope.formatFileSize = function (size) {
            if (typeof size !== 'number' || !isFinite(size)) return '알 수 없음';
            if (size < 1024) return size + ' B';
            var kb = size / 1024;
            if (kb < 1024) return kb.toFixed(1) + ' KB';
            var mb = kb / 1024;
            if (mb < 1024) return mb.toFixed(2) + ' MB';
            var gb = mb / 1024;
            return gb.toFixed(2) + ' GB';
        };

        $scope.isImage = function (f) {
            if (!f) return false;
            var t = String(f.fileType || '').toLowerCase();
            var name = String(f.fileName || '');
            if (t.indexOf('image/') === 0) return true;
            return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name);
        };

        function escapeAttr(str) {
            return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
        }

        // ───────── 토큰 → HTML (에디터와 100% 동일 로직) ─────────
        function tokensToHtml(content, meta) {
            // BIG 게시판은 토큰 안 쓰고 그대로 HTML 사용
            if (rawCode === 'big') return content || '';

            const m = meta || {};
            let html = content || '';

            // 예전에 남아 있던 "[파일 2]", "파일 3", "첨부 파일" 같은 텍스트 제거
            html = html
                .replace(/\[?\s*파일\s*\d+\s*\]?/gi, '') // [파일 2], 파일 3 등
                .replace(/첨부\s*파일/gi, '');

            const tokenRe = /\[\[file:(\d+)([^\]]*)\]\]/gi;

            html = html.replace(tokenRe, function (_, numStr, attrStr) {
                const n = parseInt(numStr, 10);
                const idx = n - 1;

                let widthRaw = null; // "50", "50%", "300px"
                let align = 'center';

                attrStr = attrStr || '';

                // width=50 / width=50% / width=300px
                const mWidth = /width\s*=\s*([0-9]{1,4}(?:px|%)?)/i.exec(attrStr);
                if (mWidth && mWidth[1]) widthRaw = mWidth[1];

                // align=left|right|center
                const mAlign = /align\s*=\s*(left|right|center)/i.exec(attrStr);
                if (mAlign && mAlign[1]) align = mAlign[1].toLowerCase();

                let url = null;
                let fileName = null;

                if (m.fileList && m.fileList.length >= n) {
                    const f = m.fileList[idx] || {};
                    url = f.url || f.fileUrl || f.downloadUrl || f.path || null;
                    fileName = f.fileName || f.originalFilename || f.filename || f.name || '파일 ' + n;
                } else if ((!m.fileList || m.fileList.length === 0) && n === 1) {
                    // 예전 단일 파일 방식
                    url = m.fileUrl || m.url || null;
                    fileName = m.fileName || '첨부 파일';
                }

                // url 이 없으면 토큰 자체 제거
                if (!url) return '';

                // style 조립
                const styleParts = [];

                if (widthRaw) {
                    if (/^\d+$/.test(widthRaw)) {
                        // 숫자만 오면 %로 간주
                        styleParts.push('width:' + parseInt(widthRaw, 10) + '%');
                    } else {
                        styleParts.push('width:' + widthRaw);
                    }
                    styleParts.push('max-width:100%');
                } else {
                    styleParts.push('max-width:100%');
                }

                styleParts.push('height:auto');
                styleParts.push('border-radius:8px');

                if (align === 'left') {
                    styleParts.push('float:left');
                    styleParts.push('margin:8px 12px 8px 0');
                } else if (align === 'right') {
                    styleParts.push('float:right');
                    styleParts.push('margin:8px 0 8px 12px');
                } else {
                    // center
                    styleParts.push('display:block');
                    styleParts.push('margin:16px auto');
                }

                const styleAttr = styleParts.join(';');

                return '<img src="' + escapeAttr(url) + '" data-file-index="' + idx + '" style="' + styleAttr + ';" alt="' + escapeAttr(fileName || '') + '"/>';
            });

            return html;
        }

        // ───────── 게시글 1건 불러오기 ─────────
        function loadOne() {
            $scope.loading = true;
            let url = null;

            if (rawCode === 'big' && type === 'num') {
                url = '/api/big-board/' + encodeURIComponent(key);
            } else if (type === 'num') {
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            $http
                .get(url)
                .then(function (res) {
                    const p = res.data || {};

                    // 첨부 파일 리스트 정리
                    let fileList = safeParseFileList(p.fileListJson || p.file_list_json);
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

                    p.attachments = fileList || [];
                    p.fileCount = p.attachments.length;

                    // 하단 첨부 파일 리스트용
                    $scope.files = (p.attachments || []).map(function (f) {
                        return {
                            url: f.url,
                            fileName: f.fileName,
                            fileType: f.fileType,
                            size: f.size,
                            sizeText: typeof f.size === 'number' ? $scope.formatFileSize(f.size) : null,
                        };
                    });

                    // 토큰 변환에 쓸 meta 구조 (편집쪽 normalizeMeta와 비슷하게)
                    const meta = {
                        fileList: p.attachments || [],
                        fileUrl: p.fileUrl || null,
                        fileName: p.fileName || null,
                        fileType: p.fileType || null,
                        writerName: p.writerName || p.writer_name || null,
                        writerId: p.writerId || p.writer_id || null,
                        createdAt: p.createdAt || p.created_at || null,
                        updatedAt: p.updatedAt || p.updated_at || null,
                    };

                    $scope.post = p;
                    const html = tokensToHtml(p.content || '', meta);
                    $scope.renderedContent = $sce.trustAsHtml(html);
                })
                .finally(function () {
                    $scope.loading = false;
                });
        }

        // ───────── 로그인 정보 로딩 ─────────
        AuthService.loadMe().finally(function () {
            $scope.me = AuthService.getMe();
        });

        // 초기 1회 로딩
        loadOne();
    });

    // ───────────────── 게시판 라우트별 컨트롤러 ─────────────────
    // src/main/resources/static/app.js
    app.controller('BoardNormalCtrl', function ($scope, $controller, $timeout, $http) {
        // 공통 게시판 기능 상속
        angular.extend(this, $controller('BoardBaseCtrl', { $scope: $scope }));

        // 이 컨트롤러는 일반 게시판(NORM) 고정
        $scope.boardCode = 'NORM';

        // ───────────────── 새 글 폼 기본값 + boardCode 보장 ─────────────────
        function ensureNewPost() {
            $scope.newPost = $scope.newPost || {};
            $scope.newPost.title = $scope.newPost.title || '';
            $scope.newPost.content = $scope.newPost.content || '';
            $scope.newPost.files = $scope.newPost.files || [];
            $scope.newPost.boardCode = $scope.boardCode; // 항상 NORM 세팅
        }
        ensureNewPost();

        // 검색 기본값
        if (!$scope.q) {
            $scope.q = {
                type: 'author',
                keyword: '',
                from: null,
                to: null,
            };
        }

        $scope.searchOpen = false;
        $scope.pageSizes = [5, 10, 15, 20];
        $scope.pageSize = $scope.pageSize || 10;
        $scope.page = $scope.page || 0;

        // ───────────────── Summernote 에디터 초기화 ─────────────────
        function initNormalEditor() {
            $timeout(function () {
                if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.summernote) return;

                var $ = window.jQuery;
                var $editor = $('#normalEditor'); // ★ 일반 게시판 전용 에디터 id
                if ($editor.length === 0) return;

                // 기존 에디터 제거
                if ($editor.data('summernote')) {
                    $editor.summernote('destroy');
                }

                $editor.summernote({
                    height: 260,
                    placeholder: '내용을 입력하세요.',
                    lang: 'ko-KR',
                    disableDragAndDrop: true,
                    toolbar: [
                        ['style', ['bold', 'italic', 'underline', 'clear']],
                        ['para', ['ul', 'ol', 'paragraph']],
                        ['insert', ['link', 'picture']],
                        ['view', ['codeview']],
                    ],
                    callbacks: {
                        onInit: function () {
                            ensureNewPost();
                            var html = ($scope.newPost && $scope.newPost.content) || '';
                            $editor.summernote('code', html);
                        },
                        onChange: function (contents) {
                            $scope.$applyAsync(function () {
                                ensureNewPost();
                                $scope.newPost.content = contents;
                            });
                        },
                        // 에디터 안으로 드롭/붙여넣기된 이미지
                        onImageUpload: function (files) {
                            if (!files || !files.length) return;
                            Array.prototype.slice.call(files).forEach(function (file) {
                                var reader = new FileReader();
                                reader.onload = function (e) {
                                    $editor.summernote('insertImage', e.target.result, function ($img) {
                                        $img.attr('draggable', 'false');
                                        $img.css({
                                            'max-width': '100%',
                                            height: 'auto',
                                        });
                                    });
                                };
                                reader.readAsDataURL(file);
                            });
                        },
                    },
                });

                $scope._normalEditorEl = $editor;
            }, 0);
        }

        // 뷰 로드 후: 폼이 열려 있으면 에디터 생성
        $scope.$on('$viewContentLoaded', function () {
            ensureNewPost();
            if ($scope.showComposer) {
                initNormalEditor();
            }
        });

        // 글쓰기 토글 감시
        $scope.$watch('showComposer', function (v) {
            if (v) {
                ensureNewPost();
                initNormalEditor();
            } else if (window.jQuery) {
                var $ = window.jQuery;
                var $editor = $('#normalEditor');
                if ($editor.length && $editor.data('summernote')) {
                    $editor.summernote('destroy');
                }
            }
        });

        /**
         * 🔥 파일 선택(하단 input type="file") → 에디터에 미리보기 자동 삽입
         *  - newPost.files 가 바뀔 때만 동작
         *  - Blob(File) 타입만 골라서 FileReader에 넘김
         */
        $scope.$watch('newPost.files', function (newVal) {
            if (!newVal || !window.jQuery) return;

            ensureNewPost();

            var $ = window.jQuery;
            var $editor = $('#normalEditor');
            if (!$editor.length || !$editor.data('summernote')) return;

            // --- newVal 을 "진짜 파일 배열"로 정규화 ---
            var list = [];

            // 1) 이미 배열
            if (Array.isArray(newVal)) {
                list = newVal;
            }
            // 2) File / Blob 한 개
            else if (newVal instanceof Blob) {
                list = [newVal];
            }
            // 3) {0: File, 1: File, length:2} 같은 유사 배열
            else if (typeof newVal === 'object') {
                Object.keys(newVal).forEach(function (k) {
                    var v = newVal[k];
                    if (v instanceof Blob) {
                        list.push(v);
                    }
                });
            }

            // --- 진짜 파일만 에디터에 삽입 ---
            list.forEach(function (file, idx) {
                if (!file || !(file instanceof Blob)) return;
                if (file._previewed) return;
                file._previewed = true;

                var reader = new FileReader();
                reader.onload = function (e) {
                    $editor.summernote('insertImage', e.target.result, function ($img) {
                        $img.attr('data-file-index', idx);
                        $img.attr('draggable', 'false');
                        $img.css({
                            'max-width': '100%',
                            height: 'auto',
                        });
                    });
                };
                reader.readAsDataURL(file);
            });
        });

        // ───────────────── 게시글 삭제 (버튼: ng-click="deletePost(p)") ─────────────────
        $scope.deletePost = function (p) {
            if (!p) return;
            if (!confirm('정말 삭제하시겠습니까?')) return;

            const code = String($scope.boardCode || 'NORM').toUpperCase();
            const hasUuid = !!p.uuid;
            const type = hasUuid ? 'str' : 'num';
            const key = hasUuid ? p.uuid : p.id;

            let url = null;
            if (code === 'BIG' && type === 'num') {
                // 일반 게시판에선 안 쓰지만, 혹시 공용 코드 재사용 고려해서 그대로 둠
                url = '/api/big-board/' + encodeURIComponent(key);
            } else if (type === 'num') {
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            $scope.loading = true;

            $http
                .delete(url)
                .then(function () {
                    alert('삭제되었습니다.');
                    if (typeof $scope.loadPosts === 'function') {
                        $scope.loadPosts();
                    }
                })
                .catch(function (err) {
                    console.error('삭제 실패', err);
                    alert('삭제 중 오류가 발생했습니다.');
                })
                .finally(function () {
                    $scope.loading = false;
                });
        };

        // 첫 진입 시 목록 로딩
        $scope.loadPosts && $scope.loadPosts();
    });

    // src/main/resources/static/app.js (일부)
    // 대용량 게시판 컨트롤러 등록
    app.controller('BoardBigCtrl', function ($scope, $controller, $http, $location, AuthService, $window, $timeout) {
        'use strict'; // JS 엄격 모드 활성화 (실수 줄이기용)

        console.log('[BIG] BoardBigCtrl 초기화'); // 콘솔에 컨트롤러 초기화 로그 출력

        // 공통 Base 기능 상속 (검색 토글, 검색 폼, 공통 페이지네이션 등)
        angular.extend(this, $controller('BoardBaseCtrl', { $scope: $scope }));

        // 이 컨트롤러가 담당하는 게시판 코드
        $scope.boardCode = 'BIG';

        // ─────────────────────────────────────
        // 상수 설정
        // ─────────────────────────────────────
        var PAGE_SIZE = 1000; // 서버에서 한 번의 요청으로 DB에서 최대 가져올 개수
        var CHUNK_SIZE = 100; // 스크롤 한 번에 화면에 추가로 보여줄 개수
        var MAX_PER_PAGE = 1000; // 한 화면에서 최대로 보여줄 개수
        var APPROX_TOTAL = 100000000; // totalElements를 못 받을 때 대략 총 개수(1억)
        var CHUNKS_PER_DB_PAGE = MAX_PER_PAGE / CHUNK_SIZE; // 한 DB 페이지(1000개)를 몇 chunk로 나누는지

        // ─────────────────────────────────────
        // 페이지 / 카운트 상태
        // ─────────────────────────────────────
        $scope.pageSize = PAGE_SIZE;
        $scope.pageSizes = [PAGE_SIZE];
        $scope.page = 0;
        $scope.pages = Math.ceil(APPROX_TOTAL / PAGE_SIZE); // Math.ceil(...) → 올림으로 조각 개수 계산
        $scope.total = APPROX_TOTAL; // APPROX_TOTAL → 대용량 게시판에서 실제 totalElements를 매번 세지 않고, 대략적인 총 게시글 수를 가정한 값
        $scope.totalCount = APPROX_TOTAL;
        $scope.totalPages = Math.ceil(APPROX_TOTAL / CHUNK_SIZE);
        $scope.logicalPage = 1;

        $scope.posts = []; // 실제 화면에 표시되는 게시글 목록
        $scope._pagePosts = []; // 서버에서 받아온 해당 DB 페이지 전체 목록
        $scope.displayCount = 0; // 현재 화면에 보여주고 있는 개수
        $scope.loading = false; // 서버에서 목록 로딩 중인지 여부
        $scope.loadingMore = false; // 스크롤로 추가 로딩 중인지 여부

        // ★ 렌더링(브라우저가 DOM 그리는 중) 로딩 표시용 플래그
        $scope.rendering = false;

        // ★ 렌더링 로딩 오버레이 헬퍼
        function withRenderLoading(fn) {
            // 렌더링 스피너 ON
            $scope.rendering = true;

            // 한 틱 뒤에 실제 무거운 작업 실행 (먼저 스피너를 그리기 위해)
            $timeout(function () {
                try {
                    fn();
                } finally {
                    // DOM 그리는 것도 한 틱 양보한 뒤 스피너 OFF
                    $timeout(function () {
                        $scope.rendering = false;
                    }, 0);
                }
            }, 0);
        }

        // 글쓰기 폼 & composer 표시 상태
        $scope.showComposer = false;
        $scope.form = {
            title: '',
            content: '',
        };
        $scope.saving = false;

        // ─────────────────────────────────────
        // 로그인 정보
        // ─────────────────────────────────────
        $scope.me = null;
        AuthService.loadMe().then(function (me) {
            $scope.me = me;
            console.log('[BIG] me =', me);
        });

        // ─────────────────────────────────────
        // BIG 전용 canEdit : 무조건 '내 글만' 수정/삭제
        // ─────────────────────────────────────
        $scope.canEdit = function (p) {
            var me = $scope.me;
            if (!me || !p) return false;

            var myId = (me.username || me.userId || me.id || '').toString();
            var writer = (p.writerId || p.writer || p.writerName || '').toString();
            if (!myId || !writer) return false;

            return myId === writer;
        };

        // ─────────────────────────────────────
        // 글쓰기 토글
        // ─────────────────────────────────────
        $scope.toggleComposer = function () {
            $scope.showComposer = !$scope.showComposer;
            if ($scope.showComposer && !$scope.form) {
                $scope.form = { title: '', content: '' };
            }
        };

        // ─────────────────────────────────────
        // 글 등록 (POST /api/big-board)
        // ─────────────────────────────────────
        $scope.submit = function () {
            if ($scope.saving) return;

            if (!$scope.form || !$scope.form.title) {
                alert('제목을 입력해 주세요.');
                return;
            }

            var me = $scope.me || {};
            var writerId = (me.username || me.userId || me.id || 'anonymous').toString();

            var payload = {
                title: $scope.form.title,
                content: $scope.form.content || '',
                writerId: writerId,
            };

            $scope.saving = true;

            $http
                .post('/api/big-board', payload)
                .then(function () {
                    alert('등록되었습니다.');
                    $scope.form = { title: '', content: '' };
                    $scope.showComposer = false;

                    $scope.page = 0;
                    $scope.loadPosts();
                    $window.scrollTo(0, 0);
                })
                .catch(function (err) {
                    console.error('BIG 글쓰기 실패', err);
                    alert('글 등록 중 오류가 발생했습니다.');
                })
                .finally(function () {
                    $scope.saving = false;
                });
        };

        // ─────────────────────────────────────
        // UI용 페이지 번호 계산 (100개 단위)
        // ─────────────────────────────────────
        function updateLogicalPage() {
            var base = ($scope.page || 0) * CHUNKS_PER_DB_PAGE;

            var chunkIndex = 0;
            if ($scope.displayCount && CHUNK_SIZE > 0) {
                chunkIndex = Math.max(0, Math.ceil($scope.displayCount / CHUNK_SIZE) - 1);
            }

            $scope.logicalPage = base + chunkIndex + 1;
        }

        // ─────────────────────────────────────
        // 목록 로딩 (서버에서 최대 1000개 가져오기)
        // ─────────────────────────────────────
        $scope.loadPosts = function () {
            if ($scope.loading) return;
            $scope.loading = true;

            var pageParam = $scope.page || 0;
            if (pageParam < 0) pageParam = 0;

            var q = $scope.q || {};
            var params = { page: pageParam };
            if (q.type) params.type = q.type;
            if (q.keyword) params.keyword = q.keyword;
            if (q.from) params.from = q.from;
            if (q.to) params.to = q.to;

            var url = '/api/big-board/posts';
            console.log('[BIG] 요청 URL =', url, 'params=', params);

            $http
                .get(url, { params: params })
                .then(function (res) {
                    var page = res.data || {};
                    console.log('[BIG] 응답 데이터 =', page);

                    // ★ 여기부터는 렌더링 로딩 오버레이로 감싸서 실행
                    withRenderLoading(function () {
                        var list;

                        if (Array.isArray(page)) {
                            list = page;
                        } else if (page.content && angular.isArray(page.content)) {
                            list = page.content;
                        } else if (page.items && angular.isArray(page.items)) {
                            list = page.items;
                        } else {
                            list = [];
                        }

                        $scope._pagePosts = list || [];

                        // 처음에는 100개(또는 그보다 적으면 그 개수만큼)만 표시
                        $scope.displayCount = Math.min(CHUNK_SIZE, $scope._pagePosts.length, MAX_PER_PAGE);
                        $scope.posts = $scope._pagePosts.slice(0, $scope.displayCount);

                        var size = page.size;
                        if (!size || size <= 0) size = PAGE_SIZE;
                        $scope.pageSize = size;

                        var total = page.totalElements;
                        if (typeof total !== 'number') total = APPROX_TOTAL;
                        $scope.total = total;

                        $scope.pages = Math.ceil(total / size) || 1;
                        $scope.totalPages = Math.ceil(total / CHUNK_SIZE) || 1;

                        var curPage;
                        if (typeof page.page === 'number') curPage = page.page;
                        else if (typeof page.pageNumber === 'number') curPage = page.pageNumber;
                        else curPage = pageParam;

                        if (curPage < 0) curPage = 0;
                        if (curPage >= $scope.pages) curPage = $scope.pages - 1;
                        $scope.page = curPage;

                        $scope.totalCount = total;

                        updateLogicalPage();
                        console.log('[BIG] 로딩 완료 → dbPage =', $scope.page, ', logicalPage =', $scope.logicalPage, ', 표시 =', $scope.displayCount);
                    });
                })
                .catch(function (err) {
                    console.error('BIG 게시판 로딩 실패', err);
                    alert('대용량 게시판 데이터를 불러오는 중 오류가 발생했습니다.');

                    $scope._pagePosts = [];
                    $scope.posts = [];
                    $scope.displayCount = 0;
                    $scope.logicalPage = 1;
                })
                .finally(function () {
                    $scope.loading = false;
                });
        };

        // 새로고침 버튼
        $scope.reload = function () {
            $scope.loadPosts();
            $window.scrollTo(0, 0);
        };

        // ─────────────────────────────────────
        // 스크롤로 100개씩 더 보기 (최대 1000까지)
        // ─────────────────────────────────────
        $scope.loadMoreInPage = function () {
            if ($scope.loadingMore) return;
            if (!$scope._pagePosts || !$scope._pagePosts.length) return;

            var limit = Math.min(MAX_PER_PAGE, $scope._pagePosts.length);
            if ($scope.displayCount >= limit) return;

            $scope.loadingMore = true;

            var next = $scope.displayCount + CHUNK_SIZE;
            if (next > limit) next = limit;

            // ★ 추가로 100개 붙이는 작업도 렌더링 오버레이 안에서 실행
            withRenderLoading(function () {
                $scope.displayCount = next;
                $scope.posts = $scope._pagePosts.slice(0, $scope.displayCount);

                updateLogicalPage();
                $scope.loadingMore = false;
            });
        };

        // ─────────────────────────────────────
        // 스크롤 이벤트
        // ─────────────────────────────────────
        var lastLoadScrollY = 0;

        function onScroll() {
            if ($scope.loading || $scope.loadingMore) return;

            var scrollBottom = window.innerHeight + window.scrollY;
            var docHeight = document.body.offsetHeight;

            var nearBottom = docHeight - scrollBottom <= 80;
            if (!nearBottom) return;

            if ($scope.displayCount > 0 && window.scrollY <= lastLoadScrollY + 40) {
                return;
            }

            $scope.$applyAsync(function () {
                var before = $scope.displayCount;
                $scope.loadMoreInPage();
                if ($scope.displayCount !== before) {
                    lastLoadScrollY = window.scrollY;
                }
            });
        }

        $window.addEventListener('scroll', onScroll);

        $scope.$on('$destroy', function () {
            $window.removeEventListener('scroll', onScroll);
        });

        // ─────────────────────────────────────
        // 페이지 이동 (DB 기준: 1000 단위)
        // ─────────────────────────────────────
        $scope.hasPrevPage = function () {
            return $scope.page > 0;
        };

        $scope.hasNextPage = function () {
            var morePage = ($scope.page + 1) * $scope.pageSize < $scope.total;
            if (!morePage) return false;

            var pageLimit = Math.min(MAX_PER_PAGE, ($scope._pagePosts || []).length);
            return $scope.displayCount >= pageLimit && pageLimit >= MAX_PER_PAGE;
        };

        $scope.goFirst = function () {
            if (!$scope.hasPrevPage()) return;
            $scope.page = 0;
            $scope.loadPosts();
            $window.scrollTo(0, 0);
        };

        $scope.goPrev = function () {
            if (!$scope.hasPrevPage()) return;
            $scope.page = $scope.page - 1;
            if ($scope.page < 0) $scope.page = 0;
            $scope.loadPosts();
            $window.scrollTo(0, 0);
        };

        $scope.goNext = function () {
            if (!$scope.hasNextPage()) return;
            $scope.page = $scope.page + 1;
            $scope.loadPosts();
            $window.scrollTo(0, 0);
        };

        $scope.goLast = function () {
            if (!$scope.hasNextPage()) return;
            $scope.page = $scope.pages - 1;
            if ($scope.page < 0) $scope.page = 0;
            $scope.loadPosts();
            $window.scrollTo(0, 0);
        };

        // ─────────────────────────────────────
        // 상세 보기 / 수정 / 삭제
        // ─────────────────────────────────────
        $scope.goView = function (p) {
            if (!p || !p.id) return;
            var path = '/board/big/view/' + encodeURIComponent(p.id);
            $location.path(path).search({ type: 'num' });
        };

        $scope.goEdit = function (p) {
            if (!p || !p.id) return;
            var path = '/board/big/edit/num/' + encodeURIComponent(p.id);
            $location.path(path).search({});
        };

        $scope.remove = function (p) {
            if (!p || !p.id) return;
            if (!confirm('정말 삭제하시겠습니까?')) return;

            $http
                .delete('/api/big-board/' + encodeURIComponent(p.id))
                .then(function () {
                    alert('삭제되었습니다.');
                    $scope.loadPosts();
                })
                .catch(function (err) {
                    console.error('BIG 삭제 실패', err);
                    alert('삭제 중 오류가 발생했습니다.');
                });
        };

        // ─────────────────────────────────────
        // 초기 로딩
        // ─────────────────────────────────────
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
