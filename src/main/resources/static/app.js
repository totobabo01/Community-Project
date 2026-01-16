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
            // 게시판 통계 화면
            .when('/board/stats', {
                templateUrl: '/tpl/board/stats.html',
                controller: 'BoardStatsCtrl',
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
    app.controller('RootCtrl', function ($scope, $location, $document, $timeout, AuthService, MenuService, $rootScope) {
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

            // ✅✅✅ 핵심: autoCollect bootstrap이 $rootScope.showBusTab을 보고 붙으므로 미러링 필요
            $rootScope.showWelcome = $scope.showWelcome;
            $rootScope.showBusTab = $scope.showBusTab;
        }

        syncTabs();

        $scope.goHome = function () {
            if ($location.path() !== '/users') $location.path('/users');
            $location.search('tab', 'home');
            syncTabs();
        };

        // 🔹 버스 탭 이동 + (이미 버스 탭이면) 리셋 이벤트 브로드캐스트
        $scope.goBusTab = function () {
            const wasBus = $scope.showBusTab; // 이전에 버스 탭이었는지 확인

            if ($location.path() !== '/users') $location.path('/users');
            $location.search('tab', 'bus');
            syncTabs();

            // 이미 버스 탭인 상태에서 다시 누른 경우 → BusController 리셋
            if (wasBus) {
                $rootScope.$broadcast('reset-bus-view');
            }
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
    // AngularJS 컨트롤러 등록: 이름은 'BusController', DI로 여러 서비스 주입
    app.controller('BusController', function ($scope, $http, $timeout, $location, $q, $interval, $rootScope) {
        // ✅ 선택한 노선만 보이게 할 때 사용하는 상태값
        let __selectedRouteNo = null; // 예: "101"
        let __filterOnlySelectedRoute = false; // true면 선택 노선만 보임

        var __focusBusFitToken = 0;
        var __focusBusFitTimers = [];

        function setBusRouteFilter(routeNo, enabled) {
            __selectedRouteNo = routeNo == null ? null : String(routeNo).replace(/\s+/g, '').replace(/번/g, '').trim();
            __filterOnlySelectedRoute = !!enabled;

            // ✅ 스타일 다시 먹이기
            try {
                if (busVectorLayer) busVectorLayer.changed();
            } catch (e) {}
        }

        const CITY_CODE = 25; // 대전 TAGO 도시 코드
        const POLL_MS = 10000; // 도착정보 + 버스 위치 폴링 주기(ms)

        /* ================== 🚋 트램 공구 정의 ================== */
        const TRAM_ROUTES = {
            1: {
                color: '#111827',
                coords: [
                    [127.428975, 36.372575],
                    [127.420549, 36.393947],
                ],
            },
            2: {
                color: '#111827',
                lines: [
                    [
                        [127.428975, 36.372575],
                        [127.433642, 36.358172],
                    ],
                    [
                        [127.433642, 36.358172],
                        [127.4266315, 36.3588555],
                    ],
                ],
            },
            3: {
                color: '#111827',
                coords: [
                    [127.426351, 36.359154],
                    [127.399657, 36.357764],
                ],
            },
            4: {
                color: '#111827',
                lines: [
                    [
                        [127.379436, 36.360782],
                        [127.379481, 36.357932],
                    ],
                    [
                        [127.379481, 36.357932],
                        [127.397032, 36.357796],
                    ],
                ],
            },
            5: {
                color: '#111827',
                lines: [
                    [
                        [127.379492, 36.359859],
                        [127.37947, 36.376078],
                    ],
                    [
                        [127.37947, 36.376078],
                        [127.377962, 36.373937],
                    ],
                ],
            },
            6: {
                color: '#111827',
                lines: [
                    [
                        [127.346084, 36.361667],
                        [127.35225, 36.360385],
                    ],
                    [
                        [127.35225, 36.360385],
                        [127.377962, 36.373937],
                    ],
                ],
            },
            7: {
                color: '#111827',
                lines: [
                    [
                        [127.337618, 36.340806],
                        [127.344695, 36.362143],
                    ],
                    [
                        [127.344695, 36.362143],
                        [127.346084, 36.361667],
                    ],
                ],
            },
            8: {
                color: '#111827',
                coords: [
                    [127.337618, 36.340806],
                    [127.334901, 36.303332],
                ],
            },
            9: {
                color: '#111827',
                lines: [
                    [
                        [127.334901, 36.303332],
                        [127.334837, 36.301583],
                    ],
                    [
                        [127.323955, 36.299154],
                        [127.35462, 36.305542],
                    ],
                ],
            },
            10: {
                color: '#111827',
                coords: [
                    [127.35462, 36.305542],
                    [127.379177, 36.312729],
                ],
            },
            11: {
                color: '#111827',
                coords: [
                    [127.379177, 36.312729],
                    [127.388394, 36.316138],
                ],
            },
            12: {
                color: '#111827',
                lines: [
                    [
                        [127.388394, 36.316138],
                        [127.412536, 36.322487],
                    ],
                    [
                        [127.412536, 36.322487],
                        [127.417761, 36.318249],
                    ],
                    [
                        [127.417761, 36.318249],
                        [127.43435, 36.320516],
                    ],
                ],
            },
            13: {
                color: '#111827',
                lines: [
                    [
                        [127.43435, 36.320516],
                        [127.437863, 36.321764],
                    ],
                    [
                        [127.437863, 36.321764],
                        [127.432647, 36.331287],
                    ],
                    [
                        [127.432647, 36.331287],
                        [127.43769, 36.333109],
                    ],
                    [
                        [127.43769, 36.333109],
                        [127.439895, 36.328407],
                    ],
                    [
                        [127.439895, 36.328407],
                        [127.442972, 36.329544],
                    ],
                    [
                        [127.442972, 36.329544],
                        [127.449616, 36.340203],
                    ],
                ],
            },
            14: {
                color: '#111827',
                lines: [
                    [
                        [127.449616, 36.340203],
                        [127.441916, 36.351265],
                    ],
                    [
                        [127.441916, 36.351265],
                        [127.433642, 36.358172],
                    ],
                ],
            },
        };
        /* ====================================================== */

        // ✅ FIX: "10초마다만 툭" 내려가게 만들기 위한 step(초)
        const POLL_STEP_SEC = Math.max(1, Math.round(POLL_MS / 1000));

        // =========================================================
        // ✅ 공통 유틸
        // =========================================================
        function setTimed(scope, typeKey, msgKey, type, msg, ms, $timeoutSvc) {
            scope[typeKey] = type || '';
            scope[msgKey] = msg || '';
            if (ms && ms > 0) {
                $timeoutSvc(function () {
                    scope[typeKey] = '';
                    scope[msgKey] = '';
                }, ms);
            }
        }
        function normalizeList(x) {
            if (!x) return [];
            if (Array.isArray(x)) return x;
            if (Array.isArray(x.items)) return x.items;
            return [];
        }
        function roleToLabel(role) {
            const r = String(role || '').toUpperCase();
            if (r.includes('ADMIN')) return '관리자';
            if (r.includes('USER')) return '사용자';
            return role ? String(role) : '사용자';
        }
        function roleToClass(role) {
            const r = String(role || '').toUpperCase();
            if (r.includes('ADMIN')) return 'badge-admin';
            return 'badge-user';
        }

        // =========================================================
        // ✅ 화면 상태 (한 번만 선언)
        // =========================================================
        $scope.keyword = '';
        $scope.statusMessage = '';
        $scope.statusType = '';
        $scope.stops = [];

        // 도착정보
        $scope.arrivals = [];
        $scope.loadingArrival = false;

        // 클릭 선택
        $scope.selectedStop = null;
        $scope.selectedBus = null;

        // 사용자 미니 관리
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';
        $scope.newUser = { name: '', email: '' };

        // ================== (수정) 소요시간 수집 + 최단경로 UI 상태 ==================
        $scope.collect = {
            cityCode: typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25,
            periodSec: 10,
            mode: 'ARRIVAL_TO_EDGE',

            fromKeyword: '',
            toKeyword: '',

            fromCandidates: [],
            toCandidates: [],

            from: null, // { stopId, name, lat, lon, raw }
            to: null,

            // ✅ 하위호환 필드 유지
            fromStopId: '',
            toStopId: '',

            routeCandidates: [], // [{routeid, routeno, _raw}]
            selectedRoute: null,
            routeId: '',

            estMin: null,
            lastDiffSec: null,
            samples: [],
        };

        $scope.collecting = false;
        $scope.collectStatusMsg = '';
        $scope.collectStatusType = '';

        $scope.path = {
            fromKeyword: '',
            toKeyword: '',
            fromCandidates: [],
            toCandidates: [],
            from: null, // { stopId, name, lat, lon }
            to: null,
            mode: 'MIXED', // BUS | TRAM | MIXED
            weight: 'DIST', // DIST | TIME
        };
        $scope.pathStatusMsg = '';
        $scope.pathStatusType = '';
        $scope.pathResult = null;
        $scope.pathLoading = false; // ✅ ng-disabled에서 쓰는 변수(없으면 디버깅 어려움)

        // ✅ 수집 타이머 핸들
        let collectPromise = null;

        function setCollectStatus(type, msg) {
            $scope.collectStatusType = type;
            $scope.collectStatusMsg = msg || '';
        }
        function setPathStatus(type, msg) {
            $scope.pathStatusType = type;
            $scope.pathStatusMsg = msg || '';
        }

        // =========================================================
        // ✅ 내부 상태 + 지도 핸들
        // =========================================================
        let currentNodeId = null;
        let currentStopCoord = null;
        let pollPromise = null;

        // NGII + OpenLayers
        let ngiiMap = null;
        let olMap = null;
        let mapProjection = null;

        // 정류장(빨간 점)
        let vectorSource = null;
        let vectorLayer = null;

        // 버스(파란 화살표)
        let busVectorSource = null;
        let busVectorLayer = null;

        // 노선 경로(라인)
        let routeVectorSource = null;
        let routeVectorLayer = null;

        // 트램(라인)
        let tramVectorSource = null;
        let tramVectorLayer = null;

        // 트램 station(숫자)
        let tramStationSource = null;
        let tramStationLayer = null;

        // 초기 뷰
        let initialCenter = null;
        let initialZoom = null;

        // 🔹 버스의 이전 위치 기억용
        const busLastPos = new Map(); // vehicleKey -> { lon, lat }

        // 🔹 노선 경로 좌표 캐시
        const routePathIndex = {}; // routeId -> { dirs, proj }
        const routePathPromise = {}; // routeId -> Promise

        // ✅ 디버그/호출용 전역 노출 (필수)
        window.routePathIndex = routePathIndex;
        window.routePathPromise = routePathPromise;

        // 마지막 클릭 토글용
        let lastPickedKey = null;
        let lastPickedKind = null;
        let clickBound = false;

        // =========================================================
        // ✅✅✅ 버스 화살표 방향 안정화용
        // =========================================================
        const busLastProjPos = new Map(); // vehicleKey -> [x,y]
        const busLastHeading = new Map(); // vehicleKey -> rad

        const BUS_ICON_ROT_OFFSET = 0; // 필요시 조정
        const HEADING_MATCH_MIN_MOVE_M = 5;

        const busFeatureMap = new Map(); // vehicleKey -> Feature
        const busLastSeen = new Map(); // vehicleKey -> timestamp
        const BUS_TTL_MS = Math.max(30000, POLL_MS * 3);

        function normalizeAngle(rad) {
            while (rad > Math.PI) rad -= 2 * Math.PI;
            while (rad < -Math.PI) rad += 2 * Math.PI;
            return rad;
        }
        function angleDiff(a, b) {
            return Math.abs(normalizeAngle(a - b));
        }
        function lerpAngle(prev, next, alpha) {
            let d = normalizeAngle(next - prev);
            return normalizeAngle(prev + d * alpha);
        }

        function getMoveHeadingRad(vehicleKey, projCoord) {
            if (!vehicleKey || !projCoord) return null;
            if (!busLastProjPos.has(vehicleKey)) return null;

            const prev = busLastProjPos.get(vehicleKey);
            const dx = projCoord[0] - prev[0];
            const dy = projCoord[1] - prev[1];
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (!isFinite(dist) || dist < HEADING_MATCH_MIN_MOVE_M) return null;
            return normalizeAngle(Math.atan2(dy, dx));
        }

        function pickBestHeadingFromApi(deg, moveRad) {
            if (!isFinite(deg)) return null;

            const d = deg;
            const candA = normalizeAngle(((90 - d) * Math.PI) / 180);
            const candB = normalizeAngle((d * Math.PI) / 180);
            const candC = normalizeAngle((-d * Math.PI) / 180);
            const candD = normalizeAngle(((d - 90) * Math.PI) / 180);

            if (moveRad != null && isFinite(moveRad)) {
                const scored = [
                    { rad: candA, diff: angleDiff(candA, moveRad) },
                    { rad: candB, diff: angleDiff(candB, moveRad) },
                    { rad: candC, diff: angleDiff(candC, moveRad) },
                    { rad: candD, diff: angleDiff(candD, moveRad) },
                ].sort((x, y) => x.diff - y.diff);
                return scored[0].rad;
            }
            return candA;
        }

        // =========================================================
        // ✅ 상태 메시지
        // =========================================================
        function setStatus(type, msg, ms) {
            setTimed($scope, 'statusType', 'statusMessage', type, msg, ms, $timeout);
        }
        function setUserStatus(type, msg, ms) {
            setTimed($scope, 'userStatusType', 'userStatusMessage', type, msg, ms, $timeout);
        }

        // =========================================================
        // ✅ stop 객체 정규화
        // =========================================================
        function normalizeStop(s) {
            if (!s) return null;

            const stopId = (s.nodeid || s.nodeId || s.stop_id || s.stopId || s.id || '').toString();
            const name = (s.nodenm || s.nodeNm || s.name || '').toString();

            const lat = parseFloat(s.gpslati || s.gpsLat || s.lat || s.latitude);
            const lon = parseFloat(s.gpslong || s.gpsLong || s.lon || s.lng || s.longitude || s.gpsX || s.x);

            return { stopId, name, lat, lon, raw: s };
        }

        // =========================================================
        // ✅ 지도 div 높이 보정
        // =========================================================
        function ensureMapSize() {
            const div = document.getElementById('busMap');
            if (!div) return;
            if (!div.style.height || div.clientHeight < 200) div.style.height = '400px';
        }

        // =========================================================
        // ✅ 팝업(HTML) 제어
        // =========================================================
        function getPopupEl() {
            return document.getElementById('mapPopup');
        }
        function hideMapPopup() {
            const el = getPopupEl();
            if (!el) return;
            el.style.display = 'none';
            el.innerHTML = '';
        }
        function showPopupAtPixel(pixel, html) {
            const el = getPopupEl();
            const container = document.getElementById('output');
            if (!el || !container || !pixel) return;

            el.innerHTML = html;
            el.style.left = pixel[0] + 'px';
            el.style.top = pixel[1] + 'px';
            el.style.display = 'block';
        }
        function showStopPopup(pixel, stop) {
            const name = (stop.nodenm || stop.nodeNm || '').toString();
            const nodeId = stop.nodeid || stop.nodeId || stop.nodeno || stop.nodeNo || '-';
            const lat = stop.gpslati || stop.gpsLat || stop.lat || stop.latitude || '-';
            const lon = stop.gpslong || stop.gpsLong || stop.lon || stop.lng || stop.longitude || '-';

            showPopupAtPixel(
                pixel,
                `<strong>정류장</strong>
<div>${name}</div>
<div style="opacity:.8">ID: ${nodeId}</div>
<div style="opacity:.8">좌표: ${lat}, ${lon}</div>`
            );
        }
        function showBusPopup(pixel, bus, routeNo) {
            const plate = bus && (bus.vehicleno || bus.vehicleNo || bus.plainNo || bus.carNo || bus.busId || '');
            const lat = bus && (bus.gpslati || bus.gpsLati || bus.gpsY || bus.lat || bus.latitude || '-');
            const lon = bus && (bus.gpslong || bus.gpsLong || bus.gpsX || bus.lon || bus.longitude || '-');

            showPopupAtPixel(
                pixel,
                `<strong>버스</strong>
<div>노선: ${routeNo || '-'}</div>
<div style="opacity:.8">차량: ${plate || '-'}</div>
<div style="opacity:.8">좌표: ${lat}, ${lon}</div>`
            );
        }

        // =========================================================
        // ✅ 내부 OpenLayers map 찾기
        // =========================================================
        function getInnerOlMap() {
            if (olMap && typeof olMap.getView === 'function') return olMap;
            if (!ngiiMap) return null;

            let candidate = null;

            if (!candidate && ngiiMap.map && typeof ngiiMap.map.getView === 'function') candidate = ngiiMap.map;
            if (!candidate && typeof ngiiMap.getMap === 'function') {
                try {
                    const m = ngiiMap.getMap();
                    if (m && typeof m.getView === 'function') candidate = m;
                } catch (e) {
                    console.warn('[BusController] ngiiMap.getMap() 호출 실패:', e);
                }
            }
            if (!candidate && typeof ngiiMap._getMap === 'function') {
                try {
                    const gm = ngiiMap._getMap();
                    if (gm) {
                        if (typeof gm.getView === 'function') candidate = gm;
                        else if (gm.Map && typeof gm.Map.getView === 'function') candidate = gm.Map;
                        else if (gm.map && typeof gm.map.getView === 'function') candidate = gm.map;
                    }
                } catch (e) {
                    console.warn('[BusController] ngiiMap._getMap() 호출 실패:', e);
                }
            }
            if (!candidate && ngiiMap._map && typeof ngiiMap._map.getView === 'function') candidate = ngiiMap._map;

            if (candidate) {
                olMap = candidate;

                // ✅ 콘솔에서 보이게 전역으로 노출 (여기!)
                window.__olMap = olMap;
                window.__ngiiMap = ngiiMap;

                try {
                    const view = olMap.getView && olMap.getView();
                    if (view && view.getProjection) mapProjection = view.getProjection();
                } catch (e) {}
            }

            return olMap;
        }

        // =========================================================
        // ✅ 정류장 빨간 마커 레이어
        // =========================================================
        function ensureVectorLayer() {
            const map = getInnerOlMap();
            if (!map) return;
            if (!window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return;
            if (vectorLayer && vectorSource) return;

            vectorSource = new ol.source.Vector();
            vectorLayer = new ol.layer.Vector({
                source: vectorSource,
                style: new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 6,
                        fill: new ol.style.Fill({ color: 'rgba(255,0,0,0.9)' }),
                        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                    }),
                }),
                zIndex: 20,
            });

            map.addLayer(vectorLayer);
        }

        // =========================================================
        // ✅ 버스 스타일(화살표)
        // =========================================================
        function busArrowStyle(feature) {
            const routeNo = String(feature.get('routeNo') || '');
            const headingRad = feature.get('headingRad') || 0;

            return new ol.style.Style({
                image: new ol.style.Icon({
                    src: '/bus_arrow.svg',
                    scale: 0.45,
                    rotation: normalizeAngle(-(headingRad || 0) + BUS_ICON_ROT_OFFSET),
                    rotateWithView: true,
                    anchor: [0.5, 0.5],
                }),
                text: new ol.style.Text({
                    text: routeNo,
                    font: 'bold 11px Arial',
                    offsetY: -22,
                    fill: new ol.style.Fill({ color: '#003366' }),
                    stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
                }),
            });
        }

        // =========================================================
        // ✅ Bus Vector Layer (버스 마커 레이어)
        // - 선택한 "버스 1대"만 강조/고정
        // - 선택한 "노선만 남기기"도 가능
        // =========================================================

        // ✅ 컨트롤러 스코프 전역 상태(중복 선언 금지!)
        let __selectedBusKey = null; // "버스 1대" 식별키(가장 가까운 버스 선택 결과)

        // ✅ 라벨/표시용 옵션(원하면)
        let __hideOthersOpacity = 0.1; // 나머지 버스 희미하게(0이면 완전 숨김)

        // routeNo 정규화
        function __normalizeRouteNo(v) {
            return String(v || '')
                .replace(/\s+/g, '')
                .replace(/번/g, '')
                .trim();
        }

        // 버스 1대 고정키 만들기(가능한 필드들로 최대한 안정적으로)
        function __makeBusKey(busObj) {
            if (!busObj) return null;

            // 1) 차량번호/차량ID 같은 고유키 우선
            const car = busObj.vehicleno || busObj.vehicleNo || busObj.carNo || busObj.carno || busObj.busNo || busObj.busno || busObj.plateno || busObj.plateNo;

            if (car) return 'CAR:' + String(car).trim();

            // 2) 없으면 routeId + 현재 좌표로 근사키
            const rid = busObj.routeid || busObj.routeId || busObj.busRouteId || '';
            const lat = Number(busObj.gpslati || busObj.gpsLati || busObj.lat || busObj.latitude || busObj.gpsY);
            const lon = Number(busObj.gpslong || busObj.gpsLong || busObj.lon || busObj.longitude || busObj.gpsX);

            if (rid && isFinite(lat) && isFinite(lon)) {
                // 좌표는 너무 민감하니까 반올림
                const rLat = Math.round(lat * 1e5) / 1e5;
                const rLon = Math.round(lon * 1e5) / 1e5;
                return 'RID:' + String(rid).trim() + '@' + rLon + ',' + rLat;
            }

            // 3) 최후: routeId만
            if (rid) return 'RID:' + String(rid).trim();

            return null;
        }

        // ✅ 외부(예: focusBus)에서 호출할 API
        function setSelectedRoute(routeNo, enabled) {
            __selectedRouteNo = routeNo == null ? null : __normalizeRouteNo(routeNo);
            __filterOnlySelectedRoute = !!enabled;

            try {
                if (busVectorLayer) busVectorLayer.changed();
            } catch (e) {}
        }

        function setSelectedBusKey(busKey) {
            __selectedBusKey = busKey || null;
            try {
                if (busVectorLayer) busVectorLayer.changed();
            } catch (e) {}
        }

        function clearBusSelection() {
            __selectedBusKey = null;
            __selectedRouteNo = null;
            __filterOnlySelectedRoute = false;
            try {
                if (busVectorLayer) busVectorLayer.changed();
            } catch (e) {}
        }

        // ---------------------------------------------------------
        // ✅ 버스 스타일(캐시)
        // ---------------------------------------------------------
        let __BUS_STYLES__ = null;

        function __ensureBusStyles() {
            if (__BUS_STYLES__) return;

            __BUS_STYLES__ = {
                // 기본(일반 버스)
                normal: busArrowStyle, // 네가 이미 쓰는 스타일(함수/Style 둘 다 가능)

                // 선택 버스(굵게/강조) - busArrowStyle이 함수면 별도로 만들어야 함
                selected: function (feature) {
                    // busArrowStyle이 "Style 객체"면 복제해서 width만 키우는게 좋음
                    // 근데 네 프로젝트에서 busArrowStyle이 뭔지 모르니,
                    // 가장 안전하게는 normal을 그대로 쓰고 zIndex 올리거나, 별도 스타일 생성
                    // 여기선 간단히 "normal"을 사용
                    return typeof busArrowStyle === 'function' ? busArrowStyle(feature) : busArrowStyle;
                },
            };
        }

        // ---------------------------------------------------------
        // ✅ Bus Layer 생성
        // ---------------------------------------------------------
        function ensureBusVectorLayer() {
            const map = getInnerOlMap();
            if (!map) return;

            if (!window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return;
            if (busVectorLayer && busVectorSource) return;

            __ensureBusStyles();

            busVectorSource = new ol.source.Vector();

            busVectorLayer = new ol.layer.Vector({
                source: busVectorSource,

                // ✅ 핵심: 스타일을 "함수"로 바꿔서 필터/강조 가능
                style: function (feature) {
                    // feature에서 bus 객체 얻기
                    const bus = feature && feature.get ? feature.get('bus') || feature.get('data') || feature.get('item') : null;

                    // routeNo 추출
                    const fRouteNo = __normalizeRouteNo((feature.get && (feature.get('routeNo') || feature.get('routeno') || feature.get('route_no'))) || (bus && (bus.routeno || bus.routeNo || bus.route_no)) || '');

                    // 1) "선택 노선만" 모드면, 해당 노선 아닌 버스는 숨김/희미하게
                    if (__filterOnlySelectedRoute && __selectedRouteNo) {
                        if (!fRouteNo || fRouteNo !== __selectedRouteNo) {
                            // 완전 숨김(렌더 안 함)
                            // return null;

                            // 또는 "희미하게"
                            if (__hideOthersOpacity <= 0) return null;
                            // 희미 스타일(간단 버전): 기존 스타일 그대로 쓰되 opacity 적용이 어렵다면 null로 숨기는 게 가장 깔끔
                            return null;
                        }
                    }

                    // 2) "선택 버스 1대"가 있으면 그 버스만 강조, 나머지는 숨김/희미하게
                    if (__selectedBusKey) {
                        const key = __makeBusKey(bus) || String((feature.get && feature.get('busKey')) || '');
                        if (key && key === __selectedBusKey) {
                            return __BUS_STYLES__.selected(feature);
                        }
                        // 선택 버스만 남기고 싶으면 null
                        return null;
                    }

                    // 기본
                    return __BUS_STYLES__.normal ? __BUS_STYLES__.normal(feature) : null;
                },

                zIndex: 30,
            });

            map.addLayer(busVectorLayer);

            // ✅ 추가: "버스 레이어" 태그 달기 (경로만 보기에서 끄려고)
            try {
                busVectorLayer.set('tag', 'bus');
            } catch (e) {}

            // ✅ 디버그용
            window.__busVectorLayer = busVectorLayer;
            window.__busVectorSource = busVectorSource;
            window.__setSelectedRoute = setSelectedRoute;
            window.__setSelectedBusKey = setSelectedBusKey;
            window.__clearBusSelection = clearBusSelection;
        }

        // =========================================================
        // ✅ Route Layer (너 코드 거의 그대로 / 문제 없음)
        // =========================================================
        let __ROUTE_STYLES__ = null;

        function normRouteKind(k) {
            const s = String(k || '').toUpperCase();
            if (s === 'TRAM_TOOL' || s === 'TRAMTOOL' || s === 'TOOL' || s === 'TRAM_TOOL_ROUTE') return 'TRAM_TOOL';
            if (s === 'WALK' || s === 'WALKING' || s === 'FOOT' || s === 'PED' || s === 'PEDESTRIAN') return 'WALK';
            if (s === 'TRAM' || s === 'RAIL' || s === 'TRAIN') return 'TRAM';
            return 'BUS';
        }

        function ensureRouteLayer() {
            const map = getInnerOlMap && getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return false;

            if (routeVectorLayer && routeVectorSource) return true;

            if (!__ROUTE_STYLES__) {
                __ROUTE_STYLES__ = {
                    BUS: new ol.style.Style({
                        stroke: new ol.style.Stroke({ color: '#2563eb', width: 5, lineCap: 'round', lineJoin: 'round' }),
                    }),
                    WALK: new ol.style.Style({
                        stroke: new ol.style.Stroke({ color: '#111827', width: 3, lineCap: 'round', lineJoin: 'round', lineDash: [8, 8] }),
                    }),
                    TRAM: new ol.style.Style({
                        stroke: new ol.style.Stroke({ color: '#ec4899', width: 6, lineCap: 'round', lineJoin: 'round' }),
                    }),
                    TRAM_TOOL: new ol.style.Style({
                        stroke: new ol.style.Stroke({ color: '#111827', width: 6, lineCap: 'round', lineJoin: 'round' }),
                    }),
                };
            }

            routeVectorSource = new ol.source.Vector();

            routeVectorLayer = new ol.layer.Vector({
                source: routeVectorSource,
                style: function (feature) {
                    const kind = normRouteKind(feature && feature.get ? feature.get('pathKind') : '');
                    if (kind === 'TRAM_TOOL') return __ROUTE_STYLES__.TRAM_TOOL;
                    if (kind === 'WALK') return __ROUTE_STYLES__.WALK;
                    if (kind === 'TRAM') return __ROUTE_STYLES__.TRAM;
                    return __ROUTE_STYLES__.BUS;
                },
                zIndex: 15,
            });

            map.addLayer(routeVectorLayer);

            window.__routeVectorLayer = routeVectorLayer;
            window.__routeVectorSource = routeVectorSource;
            window.__getInnerOlMap = getInnerOlMap;

            // ✅ 추가: 전역 alias 생성(핵심)
            if (typeof window.getInnerOlMap !== 'function') window.getInnerOlMap = window.__getInnerOlMap;

            // (선택) 디버그용: map도 전역으로 보관
            window.__olMap = map;

            return true;
        }

        // =========================================================
        function clearRouteLayer() {
            if (!ensureRouteLayer()) return;
            if (routeVectorSource) routeVectorSource.clear(true);
        }

        // =========================================================
        // coordsAny: [ [x,y], ... ] or [ [lon,lat], ... ]
        // =========================================================
        function addPathLineToRouteLayer(kind, coordsAny, meta) {
            if (!ensureRouteLayer()) return;

            const map = getInnerOlMap && getInnerOlMap();
            if (!map || !routeVectorSource || !coordsAny || coordsAny.length < 2) return;

            const view = map.getView && map.getView();
            const proj = (view && view.getProjection && view.getProjection()) || mapProjection;

            function looksLikeLonLatXY(x, y) {
                return isFinite(x) && isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;
            }

            function decideIsLonLat(arr) {
                // 앞쪽 몇개만 보고 판단
                const n = Math.min(5, arr.length);
                for (let i = 0; i < n; i++) {
                    const c = arr[i];
                    if (!c || c.length < 2) continue;
                    const x = parseFloat(c[0]);
                    const y = parseFloat(c[1]);
                    if (!isFinite(x) || !isFinite(y)) continue;
                    if (looksLikeLonLatXY(x, y)) return true;
                }
                return false;
            }

            const isLonLat = decideIsLonLat(coordsAny);

            const out = [];
            for (let i = 0; i < coordsAny.length; i++) {
                const c = coordsAny[i];
                if (!c || c.length < 2) continue;

                const x = parseFloat(c[0]);
                const y = parseFloat(c[1]);
                if (!isFinite(x) || !isFinite(y)) continue;

                let cc = [x, y];
                if (isLonLat && proj && ol.proj && ol.proj.transform) {
                    cc = ol.proj.transform([x, y], 'EPSG:4326', proj);
                }
                out.push(cc);
            }

            if (out.length < 2) return;

            const f = new ol.Feature({ geometry: new ol.geom.LineString(out) });

            f.set('pathKind', normRouteKind(kind));

            // ✅ 레이어 스타일 강제 적용
            if (typeof f.setStyle === 'function') f.setStyle(null);

            if (meta && typeof meta === 'object') {
                Object.keys(meta).forEach(function (k) {
                    f.set(k, meta[k]);
                });
            }

            routeVectorSource.addFeature(f);
        }

        // segments: [{kind:'BUS'|'TRAM'|'WALK'|'TRAM_TOOL', coords:[...]}...]
        function drawPathSegmentsOnRouteLayer(segments) {
            if (!ensureRouteLayer()) return;
            if (!routeVectorSource) return;

            routeVectorSource.clear(true);
            (segments || []).forEach(function (seg) {
                addPathLineToRouteLayer(seg.kind || 'BUS', seg.coords || [], seg.meta || null);
            });
        }

        // =========================================================
        // ✅ routePathIndex에 캐시된 "버스 노선 경로"를 routeLayer에 그리기
        // =========================================================
        // routePathIndex[routeId] = { dirs:{ALL:[proj...],UP:...,DOWN:...}, proj:... }
        function drawBusRouteFromIndex(routeId, opts) {
            opts = opts || {};
            const shouldClear = opts.clear !== false; // 기본 true

            routeId = String(routeId || '').trim();
            if (!routeId) return false;

            if (!ensureRouteLayer()) return false;
            if (!routeVectorSource) return false;

            const info = routePathIndex && routePathIndex[routeId];
            if (!info || !info.dirs) return false;

            const dirs = info.dirs || {};
            const coordsProj = (dirs.ALL && dirs.ALL.length >= 2 && dirs.ALL) || (dirs.UP && dirs.UP.length >= 2 && dirs.UP) || (dirs.DOWN && dirs.DOWN.length >= 2 && dirs.DOWN) || null;

            if (!coordsProj || coordsProj.length < 2) return false;

            if (shouldClear) routeVectorSource.clear(true);

            const f = new ol.Feature({
                geometry: new ol.geom.LineString(coordsProj),
            });

            f.set('pathKind', 'BUS');
            f.set('routeId', routeId);
            f.set('kind', 'routeLine');

            if (typeof f.setStyle === 'function') f.setStyle(null);

            routeVectorSource.addFeature(f);

            // ✅ 보기 편하게 화면 fit(원치 않으면 opts.fit=false)
            if (opts.fit !== false) {
                try {
                    const map = getInnerOlMap && getInnerOlMap();
                    const view = map && map.getView && map.getView();
                    const ext = f.getGeometry().getExtent();
                    if (view && ext && isFinite(ext[0])) {
                        view.fit(ext, { padding: [30, 30, 30, 30], duration: 150 });
                    }
                } catch (e) {}
            }

            return true;
        }

        // =========================================================
        // ✅🚋 트램 공구를 routeLayer에 그리기 (tramVectorLayer 없이)
        // - TRAM_ROUTES[n].coords 또는 .lines 지원
        // - 토글 가능 (같은 공구 다시 누르면 제거)
        // =========================================================
        // ✅ 트램 공구(routeLayer) 토글 (공구=검정 실선)
        // - 최단 트램(TRAM=분홍)과 구분하려고 pathKind='TRAM_TOOL' 사용
        // =========================================================
        function toggleTramToolOnRouteLayer(toolNo) {
            ensureRouteLayer();
            if (!routeVectorSource) return;

            const no = parseInt(toolNo, 10);
            if (!isFinite(no)) return;

            const tool = TRAM_ROUTES && TRAM_ROUTES[no];
            if (!tool) return;

            // ✅ 현재 routeLayer에 있는 feature들
            const feats = routeVectorSource.getFeatures ? routeVectorSource.getFeatures() : [];

            // ✅ 공구 feature 판별 (TRAM_TOOL 우선, 예전 잔재(TRAM+tramToolNo)도 같이 인정)
            function isThisToolFeature(f) {
                if (!f || !f.get) return false;
                const pk = String(f.get('pathKind') || '').toUpperCase();
                const tno = f.get('tramToolNo');

                // 새 방식
                if (pk === 'TRAM_TOOL' && String(tno) === String(no)) return true;

                // 구 방식 잔재(예전에 TRAM으로 넣어둔 공구 라인)
                if (pk === 'TRAM' && String(tno) === String(no) && String(f.get('kind') || '') === 'tramTool') return true;

                return false;
            }

            // ✅ 이미 있으면 전부 제거(토글 OFF)
            const hasAny = feats.some(isThisToolFeature);
            if (hasAny) {
                feats.slice().forEach(function (f) {
                    if (isThisToolFeature(f)) routeVectorSource.removeFeature(f);
                });
                return;
            }

            // ✅ 토글 ON
            // (addPathLineToRouteLayer는 meta를 받아서 tramToolNo 등을 f.set() 할 수 있는 버전이어야 함!)
            const metaBase = { tramToolNo: no, kind: 'tramTool' };

            if (Array.isArray(tool.coords) && tool.coords.length >= 2) {
                addPathLineToRouteLayer('TRAM_TOOL', tool.coords, metaBase);
                return;
            }

            if (Array.isArray(tool.lines) && tool.lines.length) {
                tool.lines.forEach(function (line, idx) {
                    if (!Array.isArray(line) || line.length < 2) return;
                    addPathLineToRouteLayer('TRAM_TOOL', line, Object.assign({}, metaBase, { lineIndex: idx }));
                });
                return;
            }
        }

        // =========================================================
        // ✅🚋 트램 공구 전체 지우기 (옵션)
        // =========================================================
        function clearAllTramToolsOnRouteLayer() {
            ensureRouteLayer();
            if (!routeVectorSource) return;
            const feats = routeVectorSource.getFeatures ? routeVectorSource.getFeatures() : [];
            feats.forEach(function (f) {
                if (f && f.get && f.get('pathKind') === 'TRAM' && f.get('kind') === 'tramTool') {
                    routeVectorSource.removeFeature(f);
                }
            });
        }

        // =========================================================
        // ✅ (추가) 경로 방향 선택 헬퍼
        // =========================================================
        function normDirKey(k) {
            const s = String(k || '').toUpperCase();
            if (s === '1' || s === 'U' || s.includes('UP') || s.includes('상')) return 'UP';
            if (s === '2' || s === 'D' || s.includes('DOWN') || s.includes('하')) return 'DOWN';
            return 'ALL';
        }
        function getBusDirKey(bus) {
            if (!bus) return null;

            const updown = String(bus.updowncd || bus.upDownCd || bus.updown || bus.upDown || '').toUpperCase();
            if (updown === '1' || updown === 'U' || updown.includes('UP')) return 'UP';
            if (updown === '2' || updown === 'D' || updown.includes('DOWN')) return 'DOWN';

            const txt = String(bus.directionType || bus.routeTp || bus.adirection || '').toUpperCase();
            if (txt.includes('상')) return 'UP';
            if (txt.includes('하')) return 'DOWN';

            return null;
        }

        // =========================================================
        // ✅ 점-선분 거리^2
        // =========================================================
        function distPointToSegSq(P, A, B) {
            const px = P[0],
                py = P[1];
            const ax = A[0],
                ay = A[1];
            const bx = B[0],
                by = B[1];

            const abx = bx - ax,
                aby = by - ay;
            const apx = px - ax,
                apy = py - ay;

            const abLen2 = abx * abx + aby * aby;
            if (abLen2 < 1e-9) {
                const dx = px - ax,
                    dy = py - ay;
                return dx * dx + dy * dy;
            }

            let t = (apx * abx + apy * aby) / abLen2;
            if (t < 0) t = 0;
            if (t > 1) t = 1;

            const cx = ax + t * abx;
            const cy = ay + t * aby;

            const dx = px - cx;
            const dy = py - cy;
            return dx * dx + dy * dy;
        }

        // =========================================================
        // ✅ 노선 경로 기반 heading
        // =========================================================
        function computeHeadingFromRoute(projCoord, routeId, moveRad, bus) {
            if (!projCoord || !routeId) return null;

            const info = routePathIndex[routeId];
            if (!info || !info.dirs) return null;

            const wantDir = getBusDirKey(bus);
            let coords = (wantDir && info.dirs[wantDir]) || info.dirs.ALL || null;

            if (!coords) {
                const keys = Object.keys(info.dirs || {});
                if (!keys.length) return null;
                coords = info.dirs[keys[0]];
            }
            if (!coords || coords.length < 2) return null;

            let bestI = -1;
            let bestD2 = Infinity;

            for (let i = 0; i < coords.length - 1; i++) {
                const a = coords[i];
                const b = coords[i + 1];
                const d2 = distPointToSegSq(projCoord, a, b);
                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestI = i;
                }
            }
            if (bestI < 0) return null;

            const p1 = coords[bestI];
            const p2 = coords[bestI + 1];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len2 = dx * dx + dy * dy;
            if (len2 < 1e-6) return null;

            let segRad = normalizeAngle(Math.atan2(dy, dx));

            if (moveRad != null && isFinite(moveRad)) {
                const diff = angleDiff(segRad, moveRad);
                if (diff > Math.PI / 2) segRad = normalizeAngle(segRad + Math.PI);
            }
            return segRad;
        }

        function computeHeadingRad(bus, lon, lat, vehicleKey, projCoord, routeId) {
            const moveRad = getMoveHeadingRad(vehicleKey, projCoord);

            let apiRad = null;
            const rawHeading = bus && (bus.heading || bus.direction || bus.dir || bus.vdirection || bus.vDirection || bus.azimuth || bus.bearing);
            const deg = parseFloat(rawHeading);
            if (isFinite(deg)) apiRad = pickBestHeadingFromApi(deg, moveRad);

            let routeHeading = computeHeadingFromRoute(projCoord, routeId, moveRad, bus);
            if (routeHeading != null && isFinite(routeHeading)) {
                if ((moveRad == null || !isFinite(moveRad)) && apiRad != null && isFinite(apiRad)) {
                    const d = angleDiff(routeHeading, apiRad);
                    if (d > Math.PI / 2) routeHeading = normalizeAngle(routeHeading + Math.PI);
                }
                const prev = busLastHeading.get(vehicleKey);
                const out = prev != null ? lerpAngle(prev, routeHeading, 0.45) : routeHeading;
                busLastHeading.set(vehicleKey, out);
                return out;
            }

            if (apiRad != null && isFinite(apiRad)) {
                const prev = busLastHeading.get(vehicleKey);
                const out = prev != null ? lerpAngle(prev, apiRad, 0.35) : apiRad;
                busLastHeading.set(vehicleKey, out);
                return out;
            }

            if (moveRad != null && isFinite(moveRad)) {
                const prev = busLastHeading.get(vehicleKey);
                const out = prev != null ? lerpAngle(prev, moveRad, 0.4) : moveRad;
                busLastHeading.set(vehicleKey, out);
                return out;
            }

            const keep = busLastHeading.get(vehicleKey);
            if (keep != null) return keep;
            return 0;
        }

        // =========================================================
        // ✅ 지도 클릭 이벤트 바인딩(한 번만)
        // =========================================================
        function bindMapClickOnce() {
            const map = getInnerOlMap();
            if (!map || clickBound) return;

            clickBound = true;

            map.on('singleclick', function (evt) {
                const ft = map.forEachFeatureAtPixel(evt.pixel, function (f) {
                    return f;
                });

                if (!ft) {
                    $scope.$applyAsync(function () {
                        $scope.selectedStop = null;
                        $scope.selectedBus = null;
                    });
                    lastPickedKey = null;
                    lastPickedKind = null;
                    hideMapPopup();
                    return;
                }

                const kind = ft.get('kind');

                if (kind === 'stop') {
                    const stop = ft.get('stop') || null;
                    if (!stop) return;

                    const nodeId = stop.nodeid || stop.nodeId || stop.nodeno || stop.nodeNo || '';
                    const pickKey = 'stop:' + String(nodeId || stop.nodenm || stop.nodeNm || '');

                    if (lastPickedKind === 'stop' && lastPickedKey === pickKey) {
                        $scope.$applyAsync(function () {
                            $scope.selectedStop = null;
                            $scope.selectedBus = null;
                        });
                        lastPickedKey = null;
                        lastPickedKind = null;
                        hideMapPopup();
                        return;
                    }

                    lastPickedKey = pickKey;
                    lastPickedKind = 'stop';

                    $scope.$applyAsync(function () {
                        $scope.selectedBus = null;
                        $scope.selectedStop = stop;
                    });

                    $scope.$applyAsync(function () {
                        $scope.focusStop(stop);
                    });
                    showStopPopup(evt.pixel, stop);
                    return;
                }

                if (kind === 'bus') {
                    const bus = ft.get('bus') || null;
                    const routeId = ft.get('routeId');
                    const routeNo = ft.get('routeNo');

                    const plate = bus && (bus.vehicleno || bus.vehicleNo || bus.plainNo || bus.carNo || bus.busId || '');

                    const coord = ft.getGeometry && ft.getGeometry().getCoordinates ? ft.getGeometry().getCoordinates() : null;
                    const coordKey = coord ? Math.round(coord[0]) + ',' + Math.round(coord[1]) : '';
                    const pickKey = 'bus:' + String(plate || routeId + ':' + routeNo + ':' + coordKey);

                    if (lastPickedKind === 'bus' && lastPickedKey === pickKey) {
                        $scope.$applyAsync(function () {
                            $scope.selectedStop = null;
                            $scope.selectedBus = null;
                        });
                        lastPickedKey = null;
                        lastPickedKind = null;
                        hideMapPopup();
                        return;
                    }

                    lastPickedKey = pickKey;
                    lastPickedKind = 'bus';

                    $scope.$applyAsync(function () {
                        $scope.selectedStop = null;
                        $scope.selectedBus = {
                            routeId: routeId,
                            routeNo: routeNo,
                            plateNo: plate || null,
                            lat: bus && (bus.gpslati || bus.gpsLati || bus.lat || bus.latitude),
                            lon: bus && (bus.gpslong || bus.gpsLong || bus.lon || bus.longitude),
                            _raw: bus || null,
                        };
                    });

                    showBusPopup(evt.pixel, bus, routeNo);

                    if (routeId) {
                        // ✅ routeLayer(파란/분홍/점선) 먼저 비우기
                        clearRouteLayer();

                        // ✅ 핵심: loadRoutePath는 "캐시만" 채우고, 실제 그리기는 drawBusRouteFromIndex가 담당
                        // - draw:true를 주면 loadRoutePath 내부 레거시(빨강) 그리기가 살아있을 수 있음
                        $q.when(loadRoutePath(routeId, { draw: false })) // ✅ 가능하면 draw:false
                            .catch(function (e) {
                                console.warn('[loadRoutePath] failed:', e);
                            })
                            .finally(function () {
                                // ✅ 혹시 loadRoutePath가 뭔가 그렸어도 routeLayer는 다시 한번 정리
                                clearRouteLayer();

                                // ✅ 캐시에 쌓인 coordsProj로 "파란" 버스 경로만 routeLayer에 그림
                                drawBusRouteFromIndex(routeId);
                            });
                    }
                    return;
                }

                lastPickedKey = null;
                lastPickedKind = null;
                hideMapPopup();
            });
        }

        // =========================================================
        // ✅ NGII 지도 초기화
        // =========================================================
        function initMap() {
            if (ngiiMap) {
                $timeout(function () {
                    const m = getInnerOlMap();
                    if (m && m.updateSize) m.updateSize();
                }, 0);
                return;
            }

            const div = document.getElementById('busMap');
            if (!div) return;
            if (!window.ngii_wmts) {
                console.error('[BusController] ngii_wmts 없음(스크립트 로드 확인)');
                return;
            }

            ensureMapSize();

            try {
                ngiiMap = new ngii_wmts.map('busMap', { zoom: 7 });
                window.busNgiiMap = ngiiMap;

                $timeout(function () {
                    const m = getInnerOlMap();
                    if (m) {
                        const view = m.getView && m.getView();
                        if (view) {
                            try {
                                const c = view.getCenter && view.getCenter();
                                const z = view.getZoom && view.getZoom();
                                initialCenter = c && c.slice ? c.slice() : c;
                                initialZoom = z;
                            } catch (e) {}
                        }

                        if (typeof m.updateSize === 'function') m.updateSize();

                        ensureVectorLayer();
                        ensureBusVectorLayer();
                        ensureRouteLayer();
                        bindMapClickOnce();
                    }
                }, 200);
            } catch (e) {
                console.error('[BusController] NGII 지도 생성 실패:', e);
            }
        }

        // 최초 진입 시 지도 생성
        $timeout(initMap, 0);

        // =========================================================
        // ✅ 지도 이동
        // =========================================================
        function moveMap(lon, lat, zoom) {
            $timeout(function () {
                const map = getInnerOlMap();

                lon = parseFloat(lon);
                lat = parseFloat(lat);
                if (!isFinite(lon) || !isFinite(lat)) return;

                if (map && window.ol) {
                    try {
                        const view = map.getView();
                        if (!view) throw new Error('view 없음');

                        let coord = [lon, lat];
                        if (ol.proj && ol.proj.transform && mapProjection) {
                            coord = ol.proj.transform([lon, lat], 'EPSG:4326', mapProjection);
                        } else if (ol.proj && ol.proj.fromLonLat && !mapProjection) {
                            coord = ol.proj.fromLonLat([lon, lat]);
                        }

                        view.setCenter(coord);
                        if (typeof zoom === 'number') view.setZoom(zoom);
                        return;
                    } catch (e) {}
                }

                if (ngiiMap && typeof ngiiMap._setCenter === 'function') {
                    try {
                        if (typeof zoom === 'number') ngiiMap._setCenter(lon, lat, zoom);
                        else ngiiMap._setCenter(lon, lat);
                    } catch (e) {}
                }
            }, 150);
        }

        // =========================================================
        // ✅ 정류장 좌표로 이동 + 빨간 마커
        // =========================================================
        function moveMapToStop(stop, drawAllMarkers) {
            if (!stop) return;

            const rawLat = stop.gpslati || stop.gpsLat || stop.lat || stop.latitude;
            const rawLon = stop.gpslong || stop.gpsLong || stop.lon || stop.lng || stop.longitude;

            const lat = parseFloat(rawLat);
            const lon = parseFloat(rawLon);
            if (!isFinite(lat) || !isFinite(lon)) return;

            currentStopCoord = { lat: lat, lon: lon };
            moveMap(lon, lat, 13);

            $timeout(function () {
                ensureVectorLayer();
                const map = getInnerOlMap();
                if (!map || !vectorSource || !window.ol || !ol.Feature || !ol.geom) return;

                const view = map.getView && map.getView();
                const proj = view && view.getProjection ? view.getProjection() : mapProjection;

                vectorSource.clear();

                const targets = drawAllMarkers ? $scope.stops || [] : [stop];
                const features = [];

                targets.forEach(function (s) {
                    const rLat = s.gpslati || s.gpsLat || s.lat || s.latitude;
                    const rLon = s.gpslong || s.gpsLong || s.lon || s.lng || s.longitude;

                    const yy = parseFloat(rLat);
                    const xx = parseFloat(rLon);
                    if (!isFinite(yy) || !isFinite(xx)) return;

                    let coord = [xx, yy];
                    if (ol.proj && ol.proj.transform && proj) coord = ol.proj.transform([xx, yy], 'EPSG:4326', proj);

                    const f = new ol.Feature({
                        geometry: new ol.geom.Point(coord),
                        stop: s,
                        kind: 'stop',
                    });
                    features.push(f);
                });

                if (features.length) vectorSource.addFeatures(features);
            }, 300);
        }

        // =========================================================
        // ✅ 버스 feature 재사용
        // =========================================================
        function upsertBusFeature(vehicleKey, coord, b, rid, routeNo, headingRad) {
            if (!busVectorSource) return;

            let f = busFeatureMap.get(vehicleKey);

            if (!f) {
                f = new ol.Feature({ geometry: new ol.geom.Point(coord) });
                f.set('kind', 'bus');
                busFeatureMap.set(vehicleKey, f);
                busVectorSource.addFeature(f);
            } else {
                const g = f.getGeometry && f.getGeometry();
                if (g && g.setCoordinates) g.setCoordinates(coord);
            }

            f.set('bus', b);
            f.set('routeId', rid);
            f.set('routeNo', routeNo);
            f.set('headingRad', headingRad);

            busLastSeen.set(vehicleKey, Date.now());
        }

        function cleanupStaleBuses() {
            const now = Date.now();
            for (const [vehicleKey, f] of busFeatureMap.entries()) {
                const last = busLastSeen.get(vehicleKey) || 0;
                if (now - last > BUS_TTL_MS) {
                    try {
                        busVectorSource.removeFeature(f);
                    } catch (e) {}
                    busFeatureMap.delete(vehicleKey);
                    busLastSeen.delete(vehicleKey);
                    busLastPos.delete(vehicleKey);
                    busLastProjPos.delete(vehicleKey);
                    busLastHeading.delete(vehicleKey);
                }
            }
        }

        // =========================================================
        // ✅ 버스 위치 조회 + 마커 갱신
        // =========================================================
        function fetchAndDrawBusLocations(arrivalList) {
            ensureBusVectorLayer();
            const map = getInnerOlMap();
            if (!map || !busVectorSource || !window.ol || !ol.Feature || !ol.geom) return;

            if (!arrivalList || !arrivalList.length) {
                cleanupStaleBuses();
                return;
            }

            const routeNoIndex = {};
            arrivalList.forEach(function (x) {
                const rid = x.routeid || x.routeId || x.busRouteId || x.route_id;
                if (!rid) return;
                const routeNoRaw = x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '';
                routeNoIndex[rid] = routeNoRaw != null ? String(routeNoRaw) : '';
            });

            const routeIdSet = new Set();
            arrivalList.forEach(function (x) {
                const rid = x.routeid || x.routeId || x.busRouteId || x.route_id;
                if (rid) routeIdSet.add(rid);
            });

            if (!routeIdSet.size) {
                cleanupStaleBuses();
                return;
            }

            const promises = [];

            routeIdSet.forEach(function (rid) {
                promises.push(
                    loadRoutePath(rid, { draw: false }).then(function () {
                        return $http
                            .get('/api/bus/pos', {
                                params: { cityCode: CITY_CODE, routeId: rid, numOfRows: 100 },
                            })
                            .then(function (res) {
                                let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                                let body = ((data || {}).response || {}).body || {};
                                let list = (body.items && body.items.item) || [];
                                if (!Array.isArray(list)) list = list ? [list] : [];

                                const mapObj = getInnerOlMap();
                                const view = mapObj && mapObj.getView && mapObj.getView();
                                const proj = view && view.getProjection ? view.getProjection() : mapProjection;

                                list.forEach(function (b, idx) {
                                    const rawLat = b.gpslati || b.gpsLati || b.gpsY || b.lat || b.latitude;
                                    const rawLon = b.gpslong || b.gpsLong || b.gpsX || b.lon || b.longitude;

                                    const lat = parseFloat(rawLat);
                                    const lon = parseFloat(rawLon);
                                    if (!isFinite(lat) || !isFinite(lon)) return;

                                    let coord = [lon, lat];
                                    if (ol.proj && ol.proj.transform && proj) coord = ol.proj.transform([lon, lat], 'EPSG:4326', proj);

                                    const routeNoRaw = routeNoIndex[b.routeid || b.routeId || b.busRouteId || b.route_id || rid] || b.routeno || b.routeNo || b.routenm || b.routeNm || b.lineNo || b.busRouteNm || '';
                                    const routeNo = routeNoRaw != null ? String(routeNoRaw) : '';

                                    let vehicleKey = b.vehicleno || b.vehicleNo || b.carNo || b.busId || b.plainNo || b.vehId || b.veh_id;
                                    if (!vehicleKey) vehicleKey = rid + ':' + routeNo + ':' + idx;
                                    vehicleKey = String(vehicleKey);

                                    const headingRad = computeHeadingRad(b, lon, lat, vehicleKey, coord, rid);
                                    upsertBusFeature(vehicleKey, coord, b, rid, routeNo, headingRad);

                                    busLastPos.set(vehicleKey, { lon: lon, lat: lat });
                                    busLastProjPos.set(vehicleKey, coord);
                                });
                            });
                    })
                );
            });

            $q.all(promises)
                .then(function () {
                    cleanupStaleBuses();
                })
                .catch(function (err) {
                    console.error('[BusController] 버스 위치 갱신 실패:', err);
                });
        }

        // =========================================================
        // ✅ 도착 메시지 포맷터 + "10초마다 툭" 적용
        // =========================================================
        function formatArrivalMessage(x, secOverride) {
            let sec;
            if (typeof secOverride === 'number' && isFinite(secOverride)) sec = secOverride;
            else {
                const secRaw = x.arrtime || x.arrTime || x.arrtime1 || x.predictTime1 || x.remaintime || x.remainTime || x.traTime;
                sec = parseInt(secRaw, 10);
                if (!isFinite(sec)) sec = null;
            }

            const prevCnt = x.arrprevstationcnt || x.arrPrevStationCnt || x.staOrd || x.staord;

            if (isFinite(sec)) {
                const m = Math.floor(sec / 60);
                const s = sec % 60;

                let base;
                if (m > 0) base = s > 0 ? `${m}분 ${s}초 후 도착` : `${m}분 후 도착`;
                else base = `${s}초 후 도착`;

                if (isFinite(prevCnt) && prevCnt > 0) return `${base} (앞 정류장 ${prevCnt}개 전)`;
                return base;
            }

            return x.arrmsg1 || x.arrmsg || x.arrmsg_1 || x.arrmsg_2 || x.arrTime || JSON.stringify(x);
        }

        function applyPollStepToArrivals() {
            if (!$scope.arrivals || !$scope.arrivals.length) return;

            $scope.arrivals = $scope.arrivals.map(function (a) {
                const raw = a._raw || {};
                const prevSec = isFinite(a.remainSec) ? a.remainSec : null;
                if (!isFinite(prevSec)) return a;

                const nextSec = Math.max(0, prevSec - POLL_STEP_SEC);
                const nextMsg = formatArrivalMessage(raw, nextSec);

                return Object.assign({}, a, { remainSec: nextSec, remainMsg: nextMsg });
            });
        }

        // =========================================================
        // ✅ 도착정보 + 버스 위치 로딩 (수정본)
        // - 응답이 TAGO원본 or {items:[...]} or string(JSON) 모두 대응
        // - routeId/routeNo 필드 흔들림 흡수
        // - prevCnt 숫자 파싱 보정
        // =========================================================
        function loadArrivalAndBus(nodeId) {
            if (!nodeId) return;

            $scope.loadingArrival = true;

            // ---------------------------
            // ✅ util: JSON 문자열/객체 모두 안전 파싱
            // ---------------------------
            function parseJsonMaybe(v) {
                if (!v) return null;
                if (typeof v === 'string') {
                    try {
                        return JSON.parse(v);
                    } catch (e) {
                        return null;
                    }
                }
                return v;
            }

            // ---------------------------
            // ✅ util: items.item 추출 (TAGO 원본 + {items:[...]} 둘 다)
            // ---------------------------
            function extractItems(obj) {
                if (!obj) return [];
                // 1) 서버가 {items:[...]}로 준 경우
                if (Array.isArray(obj.items)) return obj.items;

                // 2) TAGO 원본 구조
                var item = obj?.response?.body?.items?.item;
                if (!item) return [];
                return Array.isArray(item) ? item : [item];
            }

            // ---------------------------
            // ✅ util: routeId / routeNo 안전 추출
            // ---------------------------
            function pickRouteId(x) {
                var v = x && (x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid);
                return v != null ? String(v).trim() : '';
            }

            function pickRouteNo(x) {
                var v = x && (x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || x.rn);
                return v != null ? String(v).trim() : '-';
            }

            // ---------------------------
            // ✅ 이전 arrivals index (같은 노선 매칭해서 remainSec 안정화)
            // ---------------------------
            var prevIndex = {};
            ($scope.arrivals || []).forEach(function (a) {
                var raw = a && a._raw ? a._raw : {};
                var routeIdPrev = String(a.routeId != null ? a.routeId : raw.routeid || raw.routeId || raw.busRouteId || raw.route_id || '').trim();
                var routeNoPrev = String(a.routeNo != null ? a.routeNo : raw.routeno || raw.routeNo || raw.routenm || raw.routeNm || raw.lineNo || raw.busRouteNm || '-').trim();
                var key = routeIdPrev + '|' + routeNoPrev;
                prevIndex[key] = a;
            });

            $http
                .get('/api/bus/arrival', {
                    params: { cityCode: CITY_CODE, nodeId: nodeId, numOfRows: 50, pageNo: 1 },
                })
                .then(function (res) {
                    var data = parseJsonMaybe(res.data);

                    // ✅ list 추출 (여기서부터 x는 TAGO item 1개)
                    var list = extractItems(data);

                    // ✅ 화면용 arrivals 정규화
                    var arrivalsNorm = list.map(function (x) {
                        var routeNo = pickRouteNo(x);
                        var routeId = pickRouteId(x);
                        var key = routeId + '|' + routeNo;

                        // 남은 시간(sec) 필드 흔들림 흡수
                        var secRaw = x.arrtime || x.arrTime || x.arrtime1 || x.predictTime1 || x.remaintime || x.remainTime || x.traTime || x.arrsec || x.arrSec;

                        var newSec = parseInt(secRaw, 10);
                        if (!isFinite(newSec)) newSec = null;

                        // 이전값과 병합(이전 remainSec이 있으면 급격히 증가하지 않게)
                        var prev = prevIndex[key];
                        var mergedSec = newSec;

                        if (prev && isFinite(prev.remainSec)) {
                            if (isFinite(newSec)) mergedSec = Math.min(prev.remainSec, newSec);
                            else mergedSec = prev.remainSec;
                        }

                        // 정류장 몇 정거장 전
                        var prevCntRaw = x.arrprevstationcnt || x.arrPrevStationCnt || x.staOrd || x.staord;
                        var prevCnt = parseInt(prevCntRaw, 10);
                        if (!isFinite(prevCnt)) prevCnt = null;

                        var msg = formatArrivalMessage(x, mergedSec);

                        return {
                            routeNo: routeNo,
                            routeId: routeId, // ✅ 무조건 문자열 routeId
                            remainSec: mergedSec,
                            prevCnt: prevCnt,
                            remainMsg: msg,
                            _raw: x,
                        };
                    });

                    $scope.arrivals = arrivalsNorm;

                    // ✅ 버스 위치/마커는 "원본 list"가 아니라
                    //    routeId가 정규화된 arrivalsNorm 기반으로 넘기는게 안전
                    //    (fetchAndDrawBusLocations가 routeid를 못찾는 문제 방지)
                    fetchAndDrawBusLocations(arrivalsNorm);
                })
                .catch(function (err) {
                    console.error('[BusController] 도착정보 조회 실패:', err);
                    $scope.arrivals = [];
                    cleanupStaleBuses();
                })
                .finally(function () {
                    $scope.loadingArrival = false;
                });
        }

        // =========================================================
        // ✅ 폴링
        // =========================================================
        function startPolling() {
            if (pollPromise) {
                $interval.cancel(pollPromise);
                pollPromise = null;
            }
            if (!currentNodeId) return;

            pollPromise = $interval(function () {
                if (!currentNodeId) return;
                applyPollStepToArrivals();
                loadArrivalAndBus(currentNodeId);
            }, POLL_MS);
        }

        function stopPolling() {
            if (pollPromise) {
                $interval.cancel(pollPromise);
                pollPromise = null;
            }
        }

        // =========================================================
        // ✅ 수동 새로고침
        // =========================================================
        $scope.refreshNow = function () {
            if (!currentNodeId) return setStatus('error', '먼저 정류장을 선택/검색하세요.', 1500);
            setStatus('info', '⟳ 수동 새로고침...', 800);
            loadArrivalAndBus(currentNodeId);
        };

        // =========================================================
        // ✅✅✅ [핵심 변경] DB(StopDao) 기반 정류장 검색 함수
        //    - /api/path/stops/search 사용
        //    - StopDto -> 기존 코드가 쓰는 stop(raw) 형태로 변환
        // =========================================================
        function adaptDbStopToUiRow(dto) {
            if (!dto) return null;

            // StopDto: { stopId, name, lat, lon, type, cityCode }
            // UI/지도 기존 로직: nodeid/nodenm/gpslati/gpslong 을 선호
            const stopId = dto.stopId || dto.stop_id || dto.id;
            const name = dto.name || dto.nodenm || dto.nodeNm || '';
            const lat = dto.lat;
            const lon = dto.lon;

            return {
                nodeid: stopId,
                nodenm: name,
                gpslati: lat,
                gpslong: lon,
                // 원본 보관
                _db: dto,
            };
        }

        // =========================================================
        // ✅ DB 정류장 조회 (백엔드: /api/bus/stops 사용)
        // - keyword: '' 가능 (전체)
        // - limit/offset 지원(클라에서 offset->pageNo로 변환)
        // ✅ 반환 형태를 "pack"으로 통일: { items:[], totalCount:number|null, pageNo:number, numOfRows:number }
        // =========================================================
        function fetchStopsFromDb(cityCode, keyword, type, limit, offset) {
            // ✅ TAGO는 pageNo/numOfRows 기반
            var numOfRows = limit != null ? Number(limit) : 500;
            if (!isFinite(numOfRows) || numOfRows <= 0) numOfRows = 500;

            // 🔥 너무 크게 하면 TAGO가 불안정할 때가 많아서 1000 권장
            if (numOfRows > 1000) numOfRows = 1000;

            // offset -> pageNo 변환 (0부터 시작하는 offset 기준)
            var pageNo = 1;
            if (offset != null) {
                var off = Number(offset);
                if (isFinite(off) && off > 0) pageNo = Math.floor(off / numOfRows) + 1;
            }

            var params = [];
            params.push('cityCode=' + encodeURIComponent(cityCode));
            if (keyword) params.push('keyword=' + encodeURIComponent(keyword));
            params.push('pageNo=' + encodeURIComponent(pageNo));
            params.push('numOfRows=' + encodeURIComponent(numOfRows));

            var url = '/api/bus/stops?' + params.join('&');

            return $http
                .get(url, { responseType: 'text' })
                .then(function (res) {
                    var text = res && res.data ? res.data : '';
                    if (!text) {
                        return { items: [], totalCount: null, pageNo: pageNo, numOfRows: numOfRows };
                    }

                    var obj;
                    try {
                        obj = typeof text === 'string' ? JSON.parse(text) : text;
                    } catch (e) {
                        console.warn('[fetchStopsFromDb] JSON parse fail. raw=', text);
                        return { items: [], totalCount: null, pageNo: pageNo, numOfRows: numOfRows };
                    }

                    var body = obj && obj.response && obj.response.body;
                    var totalCount = body && body.totalCount != null ? Number(body.totalCount) : null;

                    var item = body && body.items && body.items.item;
                    var items = [];
                    if (item) items = Array.isArray(item) ? item : [item];

                    return {
                        items: items,
                        totalCount: isFinite(totalCount) ? totalCount : null,
                        pageNo: pageNo,
                        numOfRows: numOfRows,
                    };
                })
                .catch(function (err) {
                    console.error('[fetchStopsFromDb] fail:', err);
                    return { items: [], totalCount: null, pageNo: pageNo, numOfRows: numOfRows };
                });
        }

        // =========================================================
        // ✅ 전체를 pageNo로 끝까지 가져오는 헬퍼
        // - ✅ offset 기반 루프(added===0) 방식 제거 → "pageNo 증가" + "totalCount 기반 종료"
        // - ✅ 중복 제거 키를 "nodeid/nodeId" 1개로 고정 (DB count 그대로 맞추기 핵심)
        // =========================================================
        function fetchAllStopsFromDb(cityCode, keyword, type) {
            var BATCH = 1000; // 안정권
            var MAX_TOTAL = 200000; // 안전장치
            var MAX_PAGES = 500; // 안전장치

            var all = [];
            var seen = new Set();

            // ✅ DB에서 정류장 고유키로 쓸 필드 1개로 고정 (중복 증가 방지)
            function pickStopId(row) {
                // ⭐ 여기서 stop_id, id, nodeno 등을 섞으면 같은 정류장이 다른 키로 들어올 수 있음
                return row && (row.nodeid || row.nodeId);
            }

            function step(pageNo, knownTotalCount) {
                if (pageNo > MAX_PAGES) {
                    console.warn('[fetchAllStopsFromDb] reached MAX_PAGES, stop.');
                    return Promise.resolve(all);
                }
                if (all.length >= MAX_TOTAL) {
                    console.warn('[fetchAllStopsFromDb] reached MAX_TOTAL, stop.');
                    return Promise.resolve(all);
                }

                var offset = (pageNo - 1) * BATCH;

                return fetchStopsFromDb(cityCode, keyword, type, BATCH, offset).then(function (pack) {
                    var items = pack && pack.items ? pack.items : [];
                    var totalCount = pack && pack.totalCount != null ? pack.totalCount : knownTotalCount;

                    // ✅ 페이지가 비면 종료
                    if (!items.length) return all;

                    for (var i = 0; i < items.length; i++) {
                        var r = items[i];
                        var id = pickStopId(r);

                        // ✅ id가 없으면 "DB 원본 그대로" 기준을 못 맞추니 제외(권장)
                        //    (원한다면 all.push(r)로 포함 가능하지만 그럼 count가 달라질 수 있음)
                        if (id == null || String(id).trim() === '') continue;

                        var key = String(id).trim();
                        if (!seen.has(key)) {
                            seen.add(key);
                            all.push(r);
                        }
                    }

                    // ✅ totalCount가 있으면 "충분히 모이면 종료"
                    if (totalCount != null && isFinite(totalCount)) {
                        if (all.length >= totalCount) return all;
                    }

                    // ✅ 다음 페이지
                    return step(pageNo + 1, totalCount);
                });
            }

            return step(1, null).catch(function (err) {
                console.error('[fetchAllStopsFromDb] fail:', err);
                return [];
            });
        }

        // =========================================================
        // ✅ stopModeFilter (ng-repeat filter 용)
        // - mode=BUS 일 때 kind/type이 비어있으면 BUS로 "표시"만 허용 (DB 데이터 자체를 바꾸지는 않음)
        // - mode=TRAM 일 때는 TRAM만 엄격하게
        // =========================================================
        $scope.stopModeFilter = function (s) {
            try {
                var mode = String(($scope.path && $scope.path.mode) || 'MIXED').toUpperCase();
                if (mode === 'MIXED') return true;

                var k = String((s && (s.kind || s.type || s.stopType || '')) || '')
                    .toUpperCase()
                    .trim();

                // ✅ 표시용 처리: 버스정류장은 kind가 비어있는 경우가 많으니 BUS로 보여주기
                if (!k && mode === 'BUS') return true;

                return k === mode;
            } catch (e) {
                return true;
            }
        };

        // =========================================================
        // ✅ DB row → 화면/로직 공통 필드로 정규화 (중복 정의 제거: 여기 1개만 사용)
        // - ⚠️ "kind 기본값 BUS 강제"를 제거 (BUS count가 DB와 다르게 보이는 원인 중 하나)
        // =========================================================
        function normalizeStopAny(stop) {
            if (!stop) return null;

            var nodeid = stop.nodeid || stop.nodeId;
            var name = stop.name || stop.nodenm || stop.nodeNm || stop.stopName || stop.sttnNm || stop.nm || '';

            var rawLat = stop.lat || stop.gpslati || stop.gpsLat || stop.latitude;
            var rawLon = stop.lon || stop.gpslong || stop.gpsLong || stop.longitude || stop.lng;

            var lat = parseFloat(rawLat);
            var lon = parseFloat(rawLon);

            // ✅ DB 값 존중: kind/type이 있으면 쓰고, 없으면 빈값 유지
            var kind = String(stop.kind || stop.type || stop.stopType || '')
                .toUpperCase()
                .trim();

            var out = angular.extend({}, stop, {
                nodeid: nodeid,
                name: name,
                kind: kind,
                type: kind,
                lat: isFinite(lat) ? lat : stop.lat,
                lon: isFinite(lon) ? lon : stop.lon,
                _key: String(nodeid != null ? nodeid : '').trim(), // BUS count 맞추려면 nodeid만 key
            });

            if (!out.nodenm) out.nodenm = out.name;
            if (!out.nodeNm) out.nodeNm = out.name;

            return out;
        }

        // =========================================================
        // ✅ 정류장 검색 (DB + TRAM 전역데이터 + MIXED 합치기 완성본)
        // - BUS   : DB만 (BUS만 남김)
        // - TRAM  : tram-data.js 전역 배열만 (자동 탐색)
        // - MIXED : BUS(DB) + TRAM(전역) 합쳐서 표시
        // =========================================================
        $scope.searchStops = function () {
            var kw = ($scope.keyword || '').trim();
            initMap();

            // ✅ 현재 모드
            var mode = String(($scope.path && $scope.path.mode) || 'MIXED').toUpperCase();

            // ---------------------------------------------------------
            // 공통 유틸
            // ---------------------------------------------------------
            function pickLatLon(stop) {
                var s = normalizeStopAny(stop);
                if (!s) return null;
                var lat = parseFloat(s.lat);
                var lon = parseFloat(s.lon);
                if (isFinite(lat) && isFinite(lon)) return { lat: lat, lon: lon };
                return null;
            }

            function pickNodeIdForArrival(stop) {
                var s = normalizeStopAny(stop);
                return s && s.nodeid ? String(s.nodeid).trim() : null;
            }

            function resetSelectionAndLayers() {
                $scope.arrivals = [];
                $scope.selectedStop = null;
                $scope.selectedBus = null;
                currentNodeId = null;
                currentStopCoord = null;
                lastPickedKey = null;
                lastPickedKind = null;
                hideMapPopup();

                if (busVectorSource) {
                    busVectorSource.clear();
                    busFeatureMap.clear();
                    busLastSeen.clear();
                }
                if (routeVectorSource) routeVectorSource.clear();
            }

            // ---------------------------------------------------------
            // ✅ 트램 전역 데이터 "자동 탐색" (전역 변수명 모르더라도 잡아오게)
            // ---------------------------------------------------------
            function guessTramRaw() {
                // 1) 흔한 후보들
                var direct = window.TRAM_STOPS || window.TRAM_STATIONS || window.TRAM_NODES || window.tramStops || window.tramStations;

                if (Array.isArray(direct) && direct.length) return direct;

                // 2) 전역(window)에서 "배열" 중 트램 같아보이는 걸 탐색
                //    - 보통 14개
                //    - 원소가 객체이고, name/lat/lon/nodeid 같은 필드가 있을 확률
                try {
                    var keys = Object.keys(window || {});
                    var candidates = [];

                    for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        var v = window[k];
                        if (!Array.isArray(v)) continue;
                        if (!v.length) continue;

                        // 크기 힌트(트램 14개 근처)
                        if (v.length >= 10 && v.length <= 30) {
                            var one = v[0];
                            if (one && typeof one === 'object') {
                                // 트램 정거장일 법한 필드 힌트
                                var hasName = 'name' in one || 'nodenm' in one || 'nodeNm' in one || 'sttnNm' in one;
                                var hasCoord = 'lat' in one || 'gpslati' in one || 'lon' in one || 'gpslong' in one;
                                if (hasName || hasCoord) {
                                    candidates.push({ key: k, arr: v });
                                }
                            }
                        }
                    }

                    // 후보 중 "14개에 가장 가까운" 배열을 선택
                    if (candidates.length) {
                        candidates.sort(function (a, b) {
                            return Math.abs(a.arr.length - 14) - Math.abs(b.arr.length - 14);
                        });
                        console.info('[TRAM guess] picked =', candidates[0].key, 'len=', candidates[0].arr.length);
                        return candidates[0].arr;
                    }

                    // 그래도 없으면 후보 로그
                    console.warn('[TRAM guess] no candidates. window arrays not found (10~30 len objects).');
                } catch (e) {
                    console.warn('[TRAM guess] failed:', e);
                }

                return [];
            }

            function buildTramList(kw) {
                var tramRaw = guessTramRaw();
                var tramList = (Array.isArray(tramRaw) ? tramRaw : [])
                    .map(function (x) {
                        var s = normalizeStopAny(x);
                        if (!s) return null;
                        // ✅ 트램은 무조건 TRAM 고정
                        s.kind = 'TRAM';
                        s.type = 'TRAM';
                        return s;
                    })
                    .filter(Boolean);

                // ✅ 키워드가 있으면 이름 기반 필터
                if (kw) {
                    var q = kw.toLowerCase();
                    tramList = tramList.filter(function (s) {
                        var nm = String(s.name || s.nodenm || s.nodeNm || '').toLowerCase();
                        return nm.indexOf(q) >= 0;
                    });
                }

                return tramList;
            }

            // ---------------------------------------------------------
            // ✅ TRAM 모드
            // ---------------------------------------------------------
            if (mode === 'TRAM') {
                setStatus('info', kw ? '트램 정거장 검색 중...' : '트램 정거장 불러오는 중...', 0);

                var tramOnly = buildTramList(kw);

                $scope.$evalAsync(function () {
                    $scope.stops = tramOnly;
                });

                ensureMapSize();

                if (!tramOnly.length) {
                    setStatus('error', '❗ 트램 정거장을 찾지 못했습니다. (tram-data.js 전역 배열/변수명 확인 필요)', 2500);
                    resetSelectionAndLayers();
                    return;
                }

                var firstT = tramOnly[0];
                currentStopCoord = pickLatLon(firstT);
                moveMapToStop(firstT, true);

                currentNodeId = null; // 트램은 도착정보/버스폴링 안함
                setStatus('success', '✅ 트램 정거장 ' + tramOnly.length + '곳을 표시했습니다.', 2500);
                return;
            }

            // ---------------------------------------------------------
            // ✅ BUS / MIXED: DB 조회
            // ---------------------------------------------------------
            var type = null; // 서버 타입필터는 안 씀

            // (공통) DB→BUS 리스트 만들기 (BUS만 남기기)
            function buildBusListFromDb(res) {
                var list = (Array.isArray(res) ? res : [])
                    .map(function (x) {
                        var s = normalizeStopAny(x);
                        if (!s) return null;
                        // ✅ DB쪽 kind/type 비는 경우가 많으니 BUS 고정
                        if (!s.kind) s.kind = 'BUS';
                        if (!s.type) s.type = 'BUS';
                        return s;
                    })
                    .filter(Boolean);

                // ✅ BUS 모드일 때 혹시 모를 섞임 방지 (BUS만)
                list = list.filter(function (s) {
                    var k = String(s.kind || s.type || '').toUpperCase();
                    return k !== 'TRAM';
                });

                return list;
            }

            // ---------------------------------------------------------
            // ✅ MIXED: (BUS(DB)) + (TRAM 전역) 합치기
            // ---------------------------------------------------------
            if (mode === 'MIXED') {
                setStatus('info', kw ? '버스+트램 정류장 검색 중...' : '버스+트램 정류장 불러오는 중...', 0);

                var tramList = buildTramList(kw);

                return fetchAllStopsFromDb(CITY_CODE, kw || '', type)
                    .then(function (res) {
                        var busList = buildBusListFromDb(res);

                        // ✅ 합치기: 버스 먼저 + 트램
                        var merged = busList.concat(tramList);

                        $scope.$evalAsync(function () {
                            $scope.stops = merged;
                        });

                        ensureMapSize();

                        if (!merged.length) {
                            setStatus('error', '❗ 정류장을 찾지 못했습니다.', 2000);
                            resetSelectionAndLayers();
                            return;
                        }

                        // ✅ 지도 이동은 "버스가 있으면 버스", 없으면 트램
                        var first = busList.length ? busList[0] : merged[0];
                        currentStopCoord = pickLatLon(first);
                        moveMapToStop(first, true);

                        currentNodeId = pickNodeIdForArrival(first);

                        // ✅ 버스면 도착정보/폴링
                        if (currentNodeId) {
                            loadArrivalAndBus(currentNodeId);
                            startPolling();
                        }

                        setStatus('success', '✅ 버스 ' + busList.length + ' + 트램 ' + tramList.length + ' = 총 ' + merged.length + '곳', 2500);
                    })
                    .catch(function (err) {
                        console.error('[BusController] MIXED 조회 실패:', err);
                        setStatus('error', '❌ 버스+트램 정보를 불러오지 못했습니다.', 2500);
                        resetSelectionAndLayers();
                    });
            }

            // ---------------------------------------------------------
            // ✅ BUS 모드: DB만
            // ---------------------------------------------------------

            // ✅ kw 비면 전체 목록
            if (!kw) {
                setStatus('info', '전체 정류장 불러오는 중...', 0);

                return fetchAllStopsFromDb(CITY_CODE, '', type)
                    .then(function (res) {
                        var list = buildBusListFromDb(res);

                        $scope.$evalAsync(function () {
                            $scope.stops = list;
                        });

                        ensureMapSize();

                        if (!list.length) {
                            setStatus('error', '❗ 전체 정류장을 찾지 못했습니다.', 2000);
                            resetSelectionAndLayers();
                            return;
                        }

                        var first = list[0];
                        currentStopCoord = pickLatLon(first);
                        moveMapToStop(first, true);

                        currentNodeId = pickNodeIdForArrival(first);

                        setStatus('success', '✅ 전체 정류장 ' + list.length + '곳을 불러왔습니다.', 2500);
                    })
                    .catch(function (err) {
                        console.error('[BusController] 전체 정류장 조회 실패:', err);
                        setStatus('error', '❌ 전체 정류장 정보를 불러오지 못했습니다.', 2500);
                        resetSelectionAndLayers();
                    });
            }

            // ✅ kw 있으면 검색
            setStatus('info', '정류장 검색 중...', 0);

            return fetchAllStopsFromDb(CITY_CODE, kw, type)
                .then(function (res) {
                    var filtered = buildBusListFromDb(res);

                    $scope.$evalAsync(function () {
                        $scope.stops = filtered;
                    });

                    ensureMapSize();

                    if (!filtered.length) {
                        setStatus('error', '❗ "' + kw + '" 정류장을 찾지 못했습니다.', 2000);
                        resetSelectionAndLayers();
                        return;
                    }

                    var first = filtered[0];
                    currentStopCoord = pickLatLon(first);
                    moveMapToStop(first, true);

                    currentNodeId = pickNodeIdForArrival(first);

                    if (currentNodeId) {
                        loadArrivalAndBus(currentNodeId);
                        startPolling();
                    }

                    setStatus('success', '✅ "' + kw + '" 관련 정류장 ' + filtered.length + '곳을 찾았습니다.', 2500);
                })
                .catch(function (err) {
                    console.error('[BusController] 정류장 검색 실패:', err);
                    setStatus('error', '❌ 정류장 정보를 불러오지 못했습니다.', 2500);
                    resetSelectionAndLayers();
                });
        };

        // =========================================================
        // ✅ 정류장 목록 클릭 (정규화 + selectedStop 세팅 보장)
        // - ✅ normalizeStopAny를 재정의하지 말고 위 함수 재사용
        // =========================================================
        $scope.focusStop = function (stop) {
            if (!stop) return;

            var s = normalizeStopAny(stop);
            if (!s) return;

            $scope.selectedStop = s;
            $scope.keyword = s.name || $scope.keyword;

            (function setCurrentStopFrom(x) {
                var lat = parseFloat(x.lat);
                var lon = parseFloat(x.lon);
                if (isFinite(lat) && isFinite(lon)) currentStopCoord = { lat: lat, lon: lon };
                else currentStopCoord = null;
            })(s);

            moveMapToStop(s, true);

            currentNodeId = s.nodeid ? String(s.nodeid).trim() : null;

            if (currentNodeId) {
                loadArrivalAndBus(currentNodeId);
                startPolling();
            }
        };

        // =========================================================
        // ✅ 폴리라인 보간/스무딩
        // =========================================================
        function densifyCoords(coords, stepsPerSegment) {
            if (!coords || coords.length < 2) return coords || [];

            const result = [];
            for (let i = 0; i < coords.length - 1; i++) {
                const x0 = coords[i][0],
                    y0 = coords[i][1];
                const x1 = coords[i + 1][0],
                    y1 = coords[i + 1][1];

                result.push([x0, y0]);
                for (let s = 1; s <= stepsPerSegment; s++) {
                    const t = s / (stepsPerSegment + 1);
                    result.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
                }
            }
            result.push(coords[coords.length - 1]);
            return result;
        }

        function chaikinSmoothOnce(coords) {
            if (!coords || coords.length < 2) return coords || [];

            const out = [];
            out.push(coords[0]);

            for (let i = 0; i < coords.length - 1; i++) {
                const x0 = coords[i][0],
                    y0 = coords[i][1];
                const x1 = coords[i + 1][0],
                    y1 = coords[i + 1][1];

                const Q = [0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1];
                const R = [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1];

                out.push(Q, R);
            }

            out.push(coords[coords.length - 1]);
            return out;
        }

        function chaikinSmooth(coords, iterations) {
            let out = coords || [];
            for (let i = 0; i < iterations; i++) out = chaikinSmoothOnce(out);
            return out;
        }

        // =========================================================

        // ✅✅✅ "raw routePath" 캐시/함수들 (loadRoutePath 바깥!)
        const routePathRawIndex = {}; // key(city:routeId) -> { list, byNodeId, coords, cityCode, routeId }
        const routePathRawPromise = {}; // key(city:routeId) -> Promise

        function loadRoutePathRaw(routeId, cityCode) {
            // ✅ cityCode 기본값 보정
            const cc = String(cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            const rid = String(routeId || '').trim();
            if (!rid) return $q.resolve(null);

            // ✅ 캐시 키: cityCode 포함
            const cacheKey = cc + ':' + rid;

            if (routePathRawIndex[cacheKey]) return $q.resolve(routePathRawIndex[cacheKey]);
            if (routePathRawPromise[cacheKey]) return routePathRawPromise[cacheKey];

            // ✅ 안전: numOfRows는 서버 제한 걸릴 수 있으니 너무 크게 못 올리면 여기서 조절
            const NUM = 2000;

            // ---------------------------------------------------------
            // ✅ (추가) stopId -> {lon,lat} 를 찾아주는 인덱스 생성 (fallback용)
            // 1) $scope.stops(검색/로드된 정류장 목록) 기반
            // 2) 지도에 찍힌 정류장 feature 기반 (있으면)
            function buildStopCoordIndex() {
                const idx = new Map();

                // ---- helper: put ----
                function put(id, lon, lat) {
                    id = String(id || '').trim();
                    lon = Number(lon);
                    lat = Number(lat);
                    if (!id) return;
                    if (!isFinite(lat) || !isFinite(lon)) return;
                    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
                    if (!idx.has(id)) idx.set(id, { lon: lon, lat: lat });
                }

                // 1) stops 배열 후보들 우선순위로 탐색
                try {
                    const candidates =
                        (typeof $scope !== 'undefined' && $scope && Array.isArray($scope.allStops) && $scope.allStops) ||
                        (typeof $scope !== 'undefined' && $scope && Array.isArray($scope.stops) && $scope.stops) ||
                        (typeof $rootScope !== 'undefined' && $rootScope && Array.isArray($rootScope.stops) && $rootScope.stops) ||
                        [];

                    candidates.forEach(function (s) {
                        if (!s) return;

                        const id = String(s.stopId || s.nodeid || s.nodeId || s.id || s.nodeno || s.nodeNo || '').trim();

                        const lat = s.lat ?? s.gpslati ?? s.gpsLati ?? s.gpsY ?? s.y ?? s.mapY;
                        const lon = s.lng ?? s.lon ?? s.gpslong ?? s.gpsLong ?? s.gpsX ?? s.x ?? s.mapX;

                        put(id, lon, lat);
                    });
                } catch (e) {}

                // 2) 지도 정류장 feature에서 좌표 보강 (더 정확)
                try {
                    const src = window.__stopVectorSource || window.stopVectorSource || (typeof stopVectorSource !== 'undefined' ? stopVectorSource : null) || (typeof stopsVectorSource !== 'undefined' ? stopsVectorSource : null) || null;

                    const map = getInnerOlMap && getInnerOlMap();
                    const viewProj = map && map.getView && map.getView().getProjection ? map.getView().getProjection() : null;

                    if (src && src.getFeatures && window.ol && ol.proj && ol.proj.toLonLat) {
                        const fs = src.getFeatures() || [];
                        fs.forEach(function (f) {
                            if (!f || !f.get) return;

                            // 가능한 키들 최대 흡수
                            const stopObj = f.get('stop') || f.get('data') || f.get('item') || f.get('payload') || null;

                            const sid = String(f.get('stopId') || f.get('nodeId') || f.get('nodeid') || f.get('id') || (stopObj && (stopObj.stopId || stopObj.nodeid || stopObj.nodeId || stopObj.id)) || '').trim();

                            if (!sid) return;

                            const g = f.getGeometry && f.getGeometry();
                            if (!g || !g.getCoordinates) return;

                            const xy = g.getCoordinates();
                            if (!xy || xy.length < 2) return;

                            // ✅ projection 명시 (NGII projection에서도 안전)
                            const ll = viewProj ? ol.proj.toLonLat(xy, viewProj) : ol.proj.toLonLat(xy);
                            put(sid, ll && ll[0], ll && ll[1]);
                        });
                    }
                } catch (e) {}

                return idx;
            }

            // ---------------------------------------------------------
            // ✅ (추가) routePath 아이템에서 nodeId / ord 추출 유틸
            // ---------------------------------------------------------
            function getNodeId(p) {
                return String(p && (p.nodeid || p.nodeId || p.nodeno || p.nodeNo || p.node_id || '')).trim();
            }
            function getOrd(p, fallbackIdx) {
                const v = p && (p.nodeord ?? p.nodeOrd ?? p.nodeseq ?? p.nodeSeq ?? p.seq ?? p.ord);
                const n = parseInt(v, 10);
                return isFinite(n) ? n : fallbackIdx;
            }

            routePathRawPromise[cacheKey] = $http
                .get('/api/bus/routePath', {
                    params: { cityCode: cc, routeId: rid, pageNo: 1, numOfRows: NUM },
                })
                .then(function (res) {
                    let data = res && res.data;

                    // ✅ res.data가 string이면 JSON 파싱
                    if (typeof data === 'string') {
                        try {
                            data = JSON.parse(data);
                        } catch (e) {
                            console.warn('[loadRoutePathRaw] JSON.parse failed:', e, data && data.slice ? data.slice(0, 160) : data);
                            return null;
                        }
                    }

                    // ✅ 다양한 구조 커버
                    const root = data || {};
                    const body = (root.response && root.response.body) || root.body || root;

                    // 1차 후보
                    let list = (body.items && body.items.item) || (body.items && body.items) || body.list || body.data || root.items || root.list || root.data || root;

                    // 단일 객체면 배열화
                    if (!Array.isArray(list)) list = list ? [list] : [];
                    if (!list.length) {
                        console.warn('[loadRoutePathRaw] empty list:', { cc, rid, keys: Object.keys(body || {}) });
                        return null;
                    }

                    // ✅ wrapper 섞인 케이스 평탄화
                    function flattenList(arr) {
                        const out = [];
                        (arr || []).forEach(function (x) {
                            if (!x) return;

                            // 1) 바로 노드처럼 보이는 객체
                            if (x.nodeid || x.nodeId || x.nodeno || x.nodeNo || x.gpslati || x.gpslong || x.gpsX || x.gpsY) {
                                out.push(x);
                                return;
                            }

                            // 2) wrapper 형태
                            const maybe = (x.items && x.items.item) || x.item || x.list || x.data;

                            if (Array.isArray(maybe)) {
                                maybe.forEach(function (y) {
                                    if (y) out.push(y);
                                });
                                return;
                            }

                            if (maybe && typeof maybe === 'object') {
                                out.push(maybe);
                                return;
                            }
                        });
                        return out.length ? out : arr;
                    }

                    list = flattenList(list);
                    if (!Array.isArray(list)) list = list ? [list] : [];
                    if (!list.length) return null;

                    // ✅ nodeId -> { ord, item } 인덱싱
                    const byNodeId = new Map();

                    // ✅ 1차 coords(응답에 좌표가 있을 때만)
                    const coordsWgs84 = []; // [ [lon,lat], ... ]

                    function pickLonLat(p) {
                        if (!p) return null;

                        const latRaw = p.gpslati ?? p.gpsLati ?? p.gpsY ?? p.lat ?? p.latitude ?? p.y ?? p.mapY ?? p.tmY ?? p.posY;

                        const lonRaw = p.gpslong ?? p.gpsLong ?? p.gpsX ?? p.lon ?? p.longitude ?? p.x ?? p.mapX ?? p.tmX ?? p.posX;

                        const lat = Number(latRaw);
                        const lon = Number(lonRaw);
                        if (!isFinite(lat) || !isFinite(lon)) return null;

                        // WGS84 범위만
                        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lon, lat };

                        return null;
                    }

                    list.forEach(function (p, idx) {
                        if (!p) return;

                        const nodeId = getNodeId(p);

                        // ord
                        const ord = getOrd(p, idx);

                        if (nodeId) {
                            if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, { ord: ord, item: p });
                            else {
                                const prev = byNodeId.get(nodeId);
                                if (!isFinite(prev.ord) || ord < prev.ord) byNodeId.set(nodeId, { ord: ord, item: p });
                            }
                        }

                        // coords(응답에 있으면)
                        const ll = pickLonLat(p);
                        if (ll) coordsWgs84.push([ll.lon, ll.lat]);
                    });

                    // ---------------------------------------------------------
                    // ✅✅✅ (핵심 추가) coords가 비었으면 nodeId 순서로 stop 좌표로 채우기
                    // ---------------------------------------------------------
                    if (coordsWgs84.length < 2) {
                        const stopIdx = buildStopCoordIndex();

                        // byNodeId를 ord 기준으로 정렬해서 coords 구성
                        const ordered = Array.from(byNodeId.entries())
                            .map(function (kv) {
                                return { nodeId: kv[0], ord: kv[1] && kv[1].ord };
                            })
                            .sort(function (a, b) {
                                return (a.ord || 0) - (b.ord || 0);
                            });

                        const rebuilt = [];
                        ordered.forEach(function (x) {
                            const c = stopIdx.get(x.nodeId);
                            if (c && isFinite(c.lat) && isFinite(c.lon)) rebuilt.push([c.lon, c.lat]);
                        });

                        if (rebuilt.length >= 2) {
                            // ✅ coords를 fallback으로 채움
                            rebuilt.forEach(function (ll) {
                                coordsWgs84.push(ll);
                            });
                            console.log('[loadRoutePathRaw] coords rebuilt by stopIndex:', {
                                cacheKey,
                                rebuilt: rebuilt.length,
                                stopIndexSize: stopIdx.size,
                            });
                        } else {
                            console.warn('[loadRoutePathRaw] coords missing (no lon/lat in api, and stopIndex miss)', {
                                cacheKey,
                                byNodeId: byNodeId.size,
                                stopIndex: stopIdx.size,
                            });
                        }
                    }

                    const info = {
                        list: list,
                        byNodeId: byNodeId,
                        coords: coordsWgs84, // ✅ 이제 최소 2개 이상이 되도록 노력함
                        cityCode: cc,
                        routeId: rid,
                    };

                    console.log('[loadRoutePathRaw] ok:', {
                        cacheKey,
                        listLen: list.length,
                        nodeIndex: byNodeId.size,
                        coords: coordsWgs84.length,
                        sample: list[0],
                    });

                    routePathRawIndex[cacheKey] = info;
                    return info;
                })
                .catch(function (err) {
                    console.warn('[loadRoutePathRaw] fail:', { cc, rid, err: err });
                    return null;
                })
                .finally(function () {
                    delete routePathRawPromise[cacheKey];
                });

            return routePathRawPromise[cacheKey];
        }

        function estimateDiffSecByOrd(fromItem, toItem, fallbackSec) {
            // ord 차이로 “대충” 소요시간 추정(최후의 fallback)
            const a = parseInt(fromItem && (fromItem.nodeord || fromItem.nodeOrd || fromItem.nodeseq || fromItem.nodeSeq || fromItem.seq || fromItem.ord), 10);
            const b = parseInt(toItem && (toItem.nodeord || toItem.nodeOrd || toItem.nodeseq || toItem.nodeSeq || toItem.seq || toItem.ord), 10);
            if (!isFinite(a) || !isFinite(b)) return fallbackSec;

            const diffStops = Math.abs(b - a);
            // 정류장 1개당 90초(=1.5분) 같은 단순 가정값 (원하면 조절)
            const sec = diffStops * 90;

            // 너무 작거나 큰 값 방지
            if (sec < 60) return 60;
            if (sec > 7200) return 7200;
            return sec;
        }

        // =========================================================
        // ✅ 전역 캐시(없으면 반드시 선언되어 있어야 함)
        // =========================================================

        function makeCacheKey(cityCode, routeId) {
            const cc = String(cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            const rid = String(routeId || '').trim();
            return cc + ':' + rid;
        }

        // =========================================================
        // ✅✅✅ (A) [REPLACE/ADD] 단일 세그먼트 레이어 생성 (tag 통일)
        // - window.singleSegSource 를 반드시 세팅
        // - layer.set('tag','single-seg-layer') 필수 (hover 필터에서 씀)
        // =========================================================
        var singleSegSource = null;
        var singleSegLayer = null;

        function ensureSingleSegLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : window.map || null;
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            if (!singleSegSource) singleSegSource = new ol.source.Vector();

            if (!singleSegLayer) {
                singleSegLayer = new ol.layer.Vector({
                    source: singleSegSource,
                    style: function (feature) {
                        // 필요하면 mode별 색 바꿔도 됨
                        return new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: 'rgba(0, 140, 255, 0.90)',
                                width: 6,
                                lineCap: 'round',
                                lineJoin: 'round',
                            }),
                        });
                    },
                    zIndex: 9999,
                });

                // ✅ 핵심 tag
                singleSegLayer.set('tag', 'single-seg-layer');

                map.addLayer(singleSegLayer);
            }

            // ✅ 전역 노출 (tryDrawFromCacheKey에서 씀)
            window.singleSegSource = singleSegSource;
            window.singleSegLayer = singleSegLayer;

            return true;
        }

        // =========================================================
        // ✅✅✅ (B) [REPLACE] Hover 핸들러 (single/mixed 공용)
        // - ✅ _raw 없어도 동작 (raw guard 제거)
        // - ✅ Point(정류장) 무시하고 LineString만 잡음
        // - allowedTags: feature.get('segTag')
        // - allowedLayerTags: layer.get('tag')
        // =========================================================
        var __segHoverBound = false;
        var __segHoverOverlay = null;
        var __segHoverEl = null;

        // 최신 허용 목록 저장(매번 갱신 가능)
        var __segHoverAllowedTags = ['mixed-seg', 'single-seg'];
        var __segHoverAllowedLayerTags = ['path', 'single-seg-layer', 'mixed-seg-layer'];

        var __segHoverDebug = false;

        function ensureSegmentHoverHandler(map, allowedTags, allowedLayerTags) {
            if (!map || !map.on) return false;

            if (Array.isArray(allowedTags)) __segHoverAllowedTags = allowedTags.slice(0);
            if (Array.isArray(allowedLayerTags)) __segHoverAllowedLayerTags = allowedLayerTags.slice(0);

            function ensureOverlay() {
                if (__segHoverOverlay) return;

                __segHoverEl = document.createElement('div');
                __segHoverEl.className = 'seg-hover-box';
                __segHoverEl.style.cssText = 'background:#0b1220;color:#fff;padding:8px 10px;border-radius:10px;' + 'box-shadow:0 10px 25px rgba(0,0,0,0.25);font-size:12px;line-height:1.4;' + 'min-width:160px;max-width:260px;';

                __segHoverOverlay = new ol.Overlay({
                    element: __segHoverEl,
                    offset: [0, -12],
                    positioning: 'bottom-center',
                    stopEvent: false,
                });
                map.addOverlay(__segHoverOverlay);
            }

            function fmtTime(sec) {
                sec = Number(sec);
                if (!isFinite(sec) || sec < 0) return '-';
                var m = Math.floor(sec / 60);
                var s = sec % 60;
                if (m <= 0) return s + '초';
                return m + '분 ' + s + '초';
            }

            function fmtDist(m) {
                m = Number(m);
                if (!isFinite(m) || m < 0) return '-';
                if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
                return Math.round(m) + ' m';
            }

            // ✅ (ADD) line만 잡는 피커: Point 무시
            function pickLineFeatureAtPixel(pixel) {
                var found = null;
                map.forEachFeatureAtPixel(
                    pixel,
                    function (feature, layer) {
                        if (found) return found;

                        if (!feature || !feature.getGeometry) return null;
                        var geom = feature.getGeometry();
                        var gtype = geom && geom.getType ? geom.getType() : '';
                        if (gtype !== 'LineString' && gtype !== 'MultiLineString') return null; // ✅ Point 무시

                        // layer tag 필터
                        var layerTag = layer && layer.get ? layer.get('tag') : null;
                        if (__segHoverAllowedLayerTags && __segHoverAllowedLayerTags.length) {
                            if (layerTag && __segHoverAllowedLayerTags.indexOf(layerTag) < 0) return null;
                        }

                        // segTag 필터
                        var segTag = feature.get ? feature.get('segTag') : null;
                        if (__segHoverAllowedTags && __segHoverAllowedTags.length) {
                            if (segTag && __segHoverAllowedTags.indexOf(segTag) < 0) return null;
                            // ✅ segTag가 아예 없는 path line을 허용하고 싶으면 여기서 조건 완화 가능
                            // if (!segTag) return null;
                        }

                        found = { feature: feature, layer: layer };
                        return found;
                    },
                    { hitTolerance: 6 }
                );

                return found;
            }

            if (__segHoverBound) return true;

            __segHoverBound = true;

            map.on('pointermove', function (evt) {
                try {
                    ensureOverlay();

                    var hit = pickLineFeatureAtPixel(evt.pixel);

                    if (!hit || !hit.feature) {
                        __segHoverEl.style.display = 'none';
                        return;
                    }

                    var f = hit.feature;

                    // ✅✅✅ 핵심: _raw 없어도 통과 (guard 제거)
                    // var raw = f.get('_raw');  // 있을 수도, 없을 수도
                    var mode = f.get('mode') || (f.get('_raw') && f.get('_raw').mode) || '';
                    var distM = f.get('distM');
                    var timeS = f.get('timeS');

                    // 값이 없으면 _raw에서 보조
                    if (!isFinite(Number(distM)) && f.get('_raw') && isFinite(Number(f.get('_raw').distM))) distM = f.get('_raw').distM;
                    if (!isFinite(Number(timeS)) && f.get('_raw') && isFinite(Number(f.get('_raw').timeS))) timeS = f.get('_raw').timeS;

                    var title = f.get('title') || '';
                    var fromName = f.get('fromName') || f.get('fromId') || '';
                    var toName = f.get('toName') || f.get('toId') || '';

                    if (!title) {
                        title = (fromName || '출발') + ' → ' + (toName || '도착');
                    }

                    __segHoverEl.innerHTML =
                        '<div style="font-weight:700;margin-bottom:4px;">' + title + '</div>' + '<div>모드: <b>' + (mode || '-') + '</b></div>' + '<div>거리: <b>' + fmtDist(distM) + '</b></div>' + '<div>시간: <b>' + fmtTime(timeS) + '</b></div>';

                    __segHoverEl.style.display = 'block';
                    __segHoverOverlay.setPosition(evt.coordinate);

                    if (__segHoverDebug) {
                        console.log('[hover]', {
                            layerTag: hit.layer && hit.layer.get && hit.layer.get('tag'),
                            segTag: f.get('segTag'),
                            mode: mode,
                            distM: distM,
                            timeS: timeS,
                            raw: f.get('_raw'),
                        });
                    }
                } catch (e) {
                    try {
                        __segHoverEl.style.display = 'none';
                    } catch (e2) {}
                }
            });

            return true;
        }

        // =========================================================
        // ✅✅✅ [ADD] 라인(LineString) 위에서 "누적거리 m" 계산해서 정렬키 만들기
        // - EPSG:5179(미터) 기준: euclid 거리로 누적거리 계산하면 됨
        // =========================================================
        function __dist2(a, b) {
            var dx = a[0] - b[0];
            var dy = a[1] - b[1];
            return dx * dx + dy * dy;
        }
        function __dist(a, b) {
            return Math.sqrt(__dist2(a, b));
        }

        // 점 P를 선분 AB에 투영한 점 Q + t(0~1) 반환
        function __projectPointToSegment(P, A, B) {
            var ax = A[0],
                ay = A[1];
            var bx = B[0],
                by = B[1];
            var px = P[0],
                py = P[1];

            var abx = bx - ax,
                aby = by - ay;
            var apx = px - ax,
                apy = py - ay;
            var ab2 = abx * abx + aby * aby;

            var t = 0;
            if (ab2 > 0) t = (apx * abx + apy * aby) / ab2;
            if (t < 0) t = 0;
            if (t > 1) t = 1;

            return { t: t, q: [ax + abx * t, ay + aby * t] };
        }

        // 라인 coords 위에서 point P의 "누적거리(m)"를 근사 계산
        function __measureAlongLine(coords, P) {
            if (!coords || coords.length < 2 || !P) return NaN;

            // 1) 가장 가까운 선분 찾기
            var best = { i: -1, d2: Infinity, proj: null, t: 0 };
            for (var i = 0; i < coords.length - 1; i++) {
                var A = coords[i],
                    B = coords[i + 1];
                if (!A || !B) continue;

                var pr = __projectPointToSegment(P, A, B);
                var d2 = __dist2(P, pr.q);
                if (d2 < best.d2) {
                    best = { i: i, d2: d2, proj: pr.q, t: pr.t };
                }
            }
            if (best.i < 0) return NaN;

            // 2) 누적거리 = (0~best.i-1까지 전체 길이) + (best.i 선분 내 부분길이)
            var m = 0;
            for (var k = 0; k < best.i; k++) m += __dist(coords[k], coords[k + 1]);

            var segLen = __dist(coords[best.i], coords[best.i + 1]);
            m += segLen * best.t;

            return m;
        }

        // =========================================================
        // ✅✅✅ [ADD] path(LineString) 3개 중 "이번 stop들에 가장 잘 맞는" 라인 선택
        // - 방법: stop들을 각 라인에 스냅했을 때 (maxM - minM)이 가장 큰 라인(=가장 잘 펼쳐짐)
        // =========================================================
        function __pickBestPathLine(pathFeatures, stopPoints) {
            if (!pathFeatures || !pathFeatures.length) return null;

            // stopPoints 없으면 그냥 가장 긴 라인
            function lineLen(coords) {
                var s = 0;
                for (var i = 0; i < coords.length - 1; i++) s += __dist(coords[i], coords[i + 1]);
                return s;
            }

            var bestF = null;
            var bestScore = -Infinity;

            for (var fi = 0; fi < pathFeatures.length; fi++) {
                var f = pathFeatures[fi];
                var g = f && f.getGeometry && f.getGeometry();
                if (!g || !g.getType || g.getType() !== 'LineString') continue;

                var coords = g.getCoordinates && g.getCoordinates();
                if (!coords || coords.length < 2) continue;

                var score = lineLen(coords); // 기본 점수: 길이

                if (stopPoints && stopPoints.length >= 2) {
                    var minM = Infinity,
                        maxM = -Infinity;
                    var okCnt = 0;
                    for (var si = 0; si < stopPoints.length; si++) {
                        var P = stopPoints[si];
                        if (!P) continue;
                        var m = __measureAlongLine(coords, P);
                        if (!isFinite(m)) continue;
                        okCnt++;
                        if (m < minM) minM = m;
                        if (m > maxM) maxM = m;
                    }
                    // stop이 라인 위로 넓게 분포할수록 좋음
                    if (okCnt >= 2 && isFinite(minM) && isFinite(maxM)) {
                        score = maxM - minM + 0.05 * lineLen(coords);
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestF = f;
                }
            }

            return bestF;
        }

        // =========================================================
        // ✅✅✅ (C) [REPLACE] tryDrawFromCacheKey
        // - 단일(BUS/TRAM) hover + 정류장명 + "구간별" 거리/시간 정상
        // - 핵심: 단일 구간 좌표는 map에 찍힌 정류장 Point 좌표(mapStopXY)만 사용
        // =========================================================
        function tryDrawFromCacheKey(cacheKey, opts) {
            opts = opts || {};

            var info = routePathIndex && routePathIndex[cacheKey];
            if (!info) {
                console.warn('[tryDrawFromCacheKey] no cache:', cacheKey);
                return false;
            }

            var map = __getMapSafe();
            if (!map) return false;

            var modeUpper = String(opts.mode || 'BUS').toUpperCase();
            var isSingle = modeUpper === 'BUS' || modeUpper === 'TRAM';

            // ✅ 단일이면 singleSegLayer 확보
            var segSource = null;
            if (isSingle) {
                if (typeof ensureSingleSegLayer !== 'function' || !ensureSingleSegLayer()) {
                    console.warn('[tryDrawFromCacheKey] ensureSingleSegLayer failed');
                    return false;
                }
                segSource = window.singleSegSource;
            } else {
                __ensureRouteSourceExposed();
                segSource = window.__routeVectorSource || null;
            }

            if (!segSource || !segSource.addFeature) {
                console.warn('[tryDrawFromCacheKey] segSource missing');
                return false;
            }

            // ---------------------------------------------------------
            // 기존 세그먼트 제거
            // ---------------------------------------------------------
            try {
                segSource.clear(true);
            } catch (e0) {}

            // ✅ 단일일 때만 통짜 라인 제거(오염 방지)
            if (isSingle) {
                try {
                    if (typeof clearRouteLayer === 'function') clearRouteLayer();
                } catch (e1) {}
                try {
                    if (typeof pathVectorSource !== 'undefined' && pathVectorSource && pathVectorSource.clear) {
                        pathVectorSource.clear(true);
                    }
                } catch (e2) {}
            }

            // ---------------------------------------------------------
            // ✅ hover 바인딩: single-seg + single-seg-layer 만 허용
            // ---------------------------------------------------------
            try {
                if (typeof ensureSegmentHoverHandler === 'function') {
                    ensureSegmentHoverHandler(map, ['single-seg'], ['single-seg-layer']);
                }
            } catch (e3) {}

            // ---------------------------------------------------------
            // 속도 fallback
            // ---------------------------------------------------------
            function speedMps(m) {
                if (m === 'TRAM') return 7.0;
                if (m === 'BUS') return 6.0;
                return 1.2;
            }
            var sp = speedMps(modeUpper);

            // ---------------------------------------------------------
            // ✅ [REPLACE] segLenM
            // - 어떤 좌표계(EPSG:5179 등)든 "미터"로 안정적으로 계산
            // - 1) map projection -> EPSG:4326 변환 후 ol.sphere.getDistance 사용(권장)
            // - 2) 변환/거리 실패 시에만 LineString.getLength fallback
            // ---------------------------------------------------------
            function segLenM(aXY, bXY) {
                try {
                    if (!aXY || !bXY) return NaN;

                    // ✅ 혹시라도 3D 들어오면 2D로 컷
                    var A = [Number(aXY[0]), Number(aXY[1])];
                    var B = [Number(bXY[0]), Number(bXY[1])];

                    if (!isFinite(A[0]) || !isFinite(A[1]) || !isFinite(B[0]) || !isFinite(B[1])) return NaN;

                    // ✅ 현재 map projection 가져오기
                    var m = __getMapSafe && __getMapSafe();
                    var view = m && m.getView && m.getView();
                    var proj = (view && view.getProjection && view.getProjection()) || null;

                    // ✅ 가장 안정: sphere distance (proj -> EPSG:4326 변환)
                    if (proj && window.ol && ol.proj && ol.sphere && ol.sphere.getDistance) {
                        var A4326 = ol.proj.transform(A, proj, 'EPSG:4326');
                        var B4326 = ol.proj.transform(B, proj, 'EPSG:4326');

                        // sanity check (lon/lat 범위)
                        if (A4326 && B4326 && isFinite(A4326[0]) && isFinite(A4326[1]) && isFinite(B4326[0]) && isFinite(B4326[1]) && Math.abs(A4326[0]) <= 180 && Math.abs(B4326[0]) <= 180 && Math.abs(A4326[1]) <= 90 && Math.abs(B4326[1]) <= 90) {
                            var d = Number(ol.sphere.getDistance(A4326, B4326)); // meters
                            if (isFinite(d)) return d;
                        }
                    }

                    // ✅ fallback: 그냥 좌표계 기준 길이 (EPSG:5179면 거의 미터)
                    var g = new ol.geom.LineString([A, B]);
                    var d2 = g.getLength ? Number(g.getLength()) : NaN;
                    return isFinite(d2) ? d2 : NaN;
                } catch (e) {}
                return NaN;
            }

            // ---------------------------------------------------------
            // raw에서 stopIds/stops 복구 (polyline은 사용 안 함)
            // ---------------------------------------------------------
            function pickRawStopsPack(info) {
                var raw = info && (info._raw || info.raw || info._rawRaw);
                if (!raw) return { stopIds: null, stops: null, raw: null };

                var stopIds = raw.stopIds || (raw.result && raw.result.stopIds) || null;
                var stops = raw.stops || (raw.result && raw.result.stops) || null;

                return { stopIds: stopIds, stops: stops, raw: raw };
            }

            var pack = pickRawStopsPack(info);
            var stopIds = pack.stopIds;
            var stops = pack.stops;

            // ---------------------------------------------------------
            // ✅✅✅ 단일 세그는 "mapStopXY"만 신뢰한다
            // - 이전에 distM이 1만km급으로 튄 원인은 raw 좌표가 깨져있기 때문
            // ---------------------------------------------------------
            var mapStopXY = (window.__buildStopCoordIndexFromMap && window.__buildStopCoordIndexFromMap(map)) || {};
            if (!mapStopXY || !Object.keys(mapStopXY).length) {
                console.warn('[tryDrawFromCacheKey] mapStopXY empty - cannot build stable single segments');
            }

            // stopId -> name 인덱스 (이름은 stops에서만 가져오면 됨)
            var stopName = {};
            if (Array.isArray(stops)) {
                for (var si = 0; si < stops.length; si++) {
                    var s = stops[si] || {};
                    var id = String(s.stopId || s.nodeId || s.id || '').trim();
                    if (!id) continue;
                    var nm = String(s.name || s.nodeNm || s.stopNm || s.nodenm || '').trim();
                    if (nm) stopName[id] = nm;
                }
            }

            // ---------------------------------------------------------
            // ✅ useStops: stopIds 순서대로 mapStopXY에 존재하는 애들만 채택
            // ---------------------------------------------------------
            var useStops = [];
            if (Array.isArray(stopIds) && stopIds.length >= 2) {
                for (var i = 0; i < stopIds.length; i++) {
                    var id1 = String(stopIds[i] || '').trim();
                    if (!id1) continue;

                    var xy = mapStopXY[id1];
                    if (!xy || xy.length < 2) continue;

                    var x = Number(xy[0]),
                        y = Number(xy[1]);
                    if (!isFinite(x) || !isFinite(y)) continue;

                    useStops.push({
                        id: id1,
                        name: stopName[id1] || id1,
                        x: x,
                        y: y,
                    });
                }
            } else {
                // stopIds가 없으면 stops에서 id를 뽑되, mapStopXY에 있는 것만
                if (Array.isArray(stops) && stops.length >= 2) {
                    for (var j = 0; j < stops.length; j++) {
                        var s2 = stops[j] || {};
                        var id2 = String(s2.stopId || s2.nodeId || s2.id || '').trim();
                        if (!id2) continue;

                        var xy2 = mapStopXY[id2];
                        if (!xy2 || xy2.length < 2) continue;

                        var x2 = Number(xy2[0]),
                            y2 = Number(xy2[1]);
                        if (!isFinite(x2) || !isFinite(y2)) continue;

                        var nm2 = String(s2.name || s2.nodeNm || s2.stopNm || s2.nodenm || '').trim();
                        useStops.push({ id: id2, name: nm2 || id2, x: x2, y: y2 });
                    }
                }
            }

            if (!useStops || useStops.length < 2) {
                console.warn('[tryDrawFromCacheKey] useStops too short (need >=2)', useStops, {
                    stopIds: stopIds,
                    mapStopXYSize: mapStopXY ? Object.keys(mapStopXY).length : 0,
                });
                return false;
            }

            // ---------------------------------------------------------
            // 세그먼트 생성
            // ---------------------------------------------------------
            var drawn = 0;

            function addSeg(source, AX, BX, meta) {
                try {
                    var f = new ol.Feature({ geometry: new ol.geom.LineString([AX, BX]) });

                    // ✅ _raw는 반드시 set으로 박기
                    f.set('_raw', meta._raw || meta);

                    for (var k in meta) if (meta.hasOwnProperty(k)) f.set(k, meta[k]);

                    if (!f.get('title')) {
                        var fn = f.get('fromName') || f.get('fromId') || '출발';
                        var tn = f.get('toName') || f.get('toId') || '도착';
                        f.set('title', fn + ' → ' + tn);
                    }

                    source.addFeature(f);
                    return true;
                } catch (e) {}
                return false;
            }

            // ✅ 단일 세그먼트 생성: map 좌표계 그대로 LineString
            for (var k2 = 1; k2 < useStops.length; k2++) {
                var A = useStops[k2 - 1];
                var B = useStops[k2];

                var AX = [A.x, A.y];
                var BX = [B.x, B.y];

                var distM = segLenM(AX, BX);

                // ✅ 비정상 거리 컷 (좌표 꼬임/중복 방지)
                if (!isFinite(distM) || distM < 3 || distM > 50000) continue;

                var timeS = sp > 0 ? Math.max(1, Math.round(distM / sp)) : -1;

                var meta = {
                    segTag: 'single-seg',
                    mode: modeUpper,
                    distM: distM,
                    timeS: timeS,
                    fromId: A.id,
                    toId: B.id,
                    fromName: A.name || A.id,
                    toName: B.name || B.id,
                    segIndex: k2 - 1,
                    _raw: {
                        mode: modeUpper,
                        fromId: A.id,
                        toId: B.id,
                        distM: distM,
                        timeS: timeS,
                    },
                };

                if (addSeg(segSource, AX, BX, meta)) drawn++;
            }

            // ---------------------------------------------------------
            // fallback: dirs.ALL 좌표 (여긴 기존대로 유지)
            // - 단, coordsProj가 map 좌표계라고 "확신"할 수 없으면 dist 컷으로 방어됨
            // ---------------------------------------------------------
            if (drawn <= 0) {
                try {
                    var dirs = (info && info.dirs) || {};
                    var coordsProj = (dirs.ALL && dirs.ALL.length >= 2 && dirs.ALL) || (dirs.UP && dirs.UP.length >= 2 && dirs.UP) || (dirs.DOWN && dirs.DOWN.length >= 2 && dirs.DOWN) || null;

                    if (coordsProj && coordsProj.length >= 2) {
                        for (var m = 1; m < coordsProj.length; m++) {
                            var P0 = coordsProj[m - 1];
                            var P1 = coordsProj[m];
                            if (!P0 || !P1) continue;

                            var d2 = segLenM(P0, P1);
                            if (!isFinite(d2) || d2 < 3 || d2 > 50000) continue;

                            var t2 = sp > 0 ? Math.max(1, Math.round(d2 / sp)) : -1;

                            var meta2 = {
                                segTag: 'single-seg',
                                mode: modeUpper,
                                distM: d2,
                                timeS: t2,
                                fromId: m - 1,
                                toId: m,
                                fromName: '점 ' + (m - 1),
                                toName: '점 ' + m,
                                segIndex: m - 1,
                                _raw: { mode: modeUpper, distM: d2, timeS: t2, fromId: m - 1, toId: m },
                            };

                            if (addSeg(segSource, P0, P1, meta2)) drawn++;
                        }
                    }
                } catch (eF) {}
            }

            if (drawn <= 0) {
                console.warn('[tryDrawFromCacheKey] drawn=0');
                return false;
            }

            // ---------------------------------------------------------
            // 화면 맞춤
            // ---------------------------------------------------------
            if (opts.fit) {
                try {
                    var view2 = map.getView && map.getView();
                    if (view2 && segSource.getExtent) {
                        view2.fit(segSource.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 17 });
                    }
                } catch (eFit) {}
            }

            try {
                if (map.renderSync) map.renderSync();
            } catch (eR) {}

            // 디버그
            try {
                var fs = segSource.getFeatures ? segSource.getFeatures() : [];
                var f0 = fs[0];
                console.log(
                    '[tryDrawFromCacheKey] OK single drawn=',
                    drawn,
                    'features=',
                    fs.length,
                    'firstNames=',
                    f0 && f0.get && f0.get('fromName') + ' -> ' + f0.get('toName'),
                    'firstDistTime=',
                    f0 && f0.get && Math.round(f0.get('distM')) + 'm / ' + f0.get('timeS') + 's',
                    'firstGeom=',
                    f0 && f0.getGeometry && f0.getGeometry().getCoordinates && f0.getGeometry().getCoordinates(),
                    'mapStopXYSize=',
                    mapStopXY ? Object.keys(mapStopXY).length : 0
                );
            } catch (eDbg) {}

            return true;
        }

        // =========================================================
        // ✅ map getter 안전 보정
        // =========================================================
        function __getMapSafe() {
            try {
                if (typeof getInnerOlMap === 'function') {
                    var m = getInnerOlMap();
                    if (m) return m;
                }
            } catch (e) {}

            try {
                if (typeof window.__getInnerOlMap === 'function') {
                    var m2 = window.__getInnerOlMap();
                    if (m2) return m2;
                }
            } catch (e2) {}

            return window.map || window.olMap || window.__olMap || window.ngiiMap || null;
        }

        function __buildStopCoordIndexFromMap(map) {
            try {
                if (!map || !map.getLayers) return {};
                var idx = {};
                var layers = map.getLayers().getArray ? map.getLayers().getArray() : [];

                function readStopId(f) {
                    if (!f) return '';
                    // props + f.get 혼합
                    var p = f.getProperties ? f.getProperties() : {};
                    function pick(k) {
                        var v = p && p[k];
                        if (v == null && f.get) v = f.get(k);
                        return v;
                    }
                    return String(pick('stopId') ?? pick('stopid') ?? pick('nodeId') ?? pick('nodeid') ?? pick('node_id') ?? pick('stop_id') ?? pick('id') ?? '').trim();
                }

                // ✅ 1) tag==='route-stops' 레이어만 대상
                var targetLayers = layers.filter((ly) => {
                    try {
                        return ly && ly.get && ly.get('tag') === 'route-stops';
                    } catch (e) {
                        return false;
                    }
                });

                // route-stops가 없으면 그냥 빈 idx 반환 (다른 레이어 쓰면 또 깨짐)
                if (!targetLayers.length) return {};

                targetLayers.forEach((layer) => {
                    var src = layer.getSource && layer.getSource();
                    if (!src || !src.getFeatures) return;
                    var fs = src.getFeatures() || [];
                    fs.forEach((f) => {
                        var g = f.getGeometry && f.getGeometry();
                        if (!g || g.getType() !== 'Point') return;

                        var id = readStopId(f);
                        if (!id) return;

                        var xy = g.getCoordinates && g.getCoordinates();
                        if (!xy || xy.length < 2) return;

                        var x = Number(xy[0]),
                            y = Number(xy[1]);
                        if (!isFinite(x) || !isFinite(y)) return;

                        // ✅ 2) EPSG:5179 “한국 범위” sanity check (강하게)
                        // 대충: x 700k~1500k, y 1400k~2600k
                        if (x < 700000 || x > 1500000 || y < 1400000 || y > 2600000) return;

                        // 중복이면 최초 유지 (route-stops는 대개 중복 거의 없음)
                        if (!idx[id]) idx[id] = [x, y];
                    });
                });

                return idx;
            } catch (e) {
                console.warn('[__buildStopCoordIndexFromMap] fail', e);
                return {};
            }
        }

        // =========================================================
        // ✅ route layer/source 노출 보정 (혼합/기존용)
        // =========================================================
        function __ensureRouteSourceExposed() {
            try {
                if (window.__routeVectorSource && window.__routeVectorSource.getFeatures) return true;

                if (typeof routeVectorSource !== 'undefined' && routeVectorSource && routeVectorSource.getFeatures) {
                    window.__routeVectorSource = routeVectorSource;
                    return true;
                }

                if (typeof ensureRouteLayer === 'function') ensureRouteLayer();

                if (!window.__routeVectorSource && typeof routeVectorSource !== 'undefined' && routeVectorSource) {
                    window.__routeVectorSource = routeVectorSource;
                }

                return !!(window.__routeVectorSource && window.__routeVectorSource.getFeatures);
            } catch (e) {
                console.warn('[__ensureRouteSourceExposed] fail', e);
                return false;
            }
        }

        // 콘솔 export
        window.tryDrawFromCacheKey = tryDrawFromCacheKey;
        window.ensureSegmentHoverHandler = window.ensureSegmentHoverHandler || ensureSegmentHoverHandler;
        window.ensureSingleSegLayer = window.ensureSingleSegLayer || ensureSingleSegLayer;
        window.__ensureRouteSourceExposed = __ensureRouteSourceExposed;
        window.__getMapSafe = __getMapSafe;
        window.__buildStopCoordIndexFromMap = window.__buildStopCoordIndexFromMap || __buildStopCoordIndexFromMap;

        // =========================================================
        // ✅✅✅ [REPLACE] 경로 로딩 Promise 캐시 (+ raw fallback + draw 옵션 지원)
        // - cacheKey = cityCode:routeId
        // - routePathIndex[cacheKey] = { dirs, proj, cityCode, routeId, stopIds, polyline, stops, _raw }
        // - opts.draw=true 이면 캐시 채운 후 그리기까지 수행
        // =========================================================
        function loadRoutePath(routeId, opts) {
            opts = opts || {};
            var draw = !!opts.draw;

            var rid = String(routeId || '').trim();
            if (!rid) return $q.resolve(null);

            var cc = String(opts.cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            var cacheKey = makeCacheKey(cc, rid);

            // ✅ 캐시 있으면 즉시 반환 (+ draw 옵션이면 즉시 그림)
            if (routePathIndex[cacheKey]) {
                if (draw) {
                    try {
                        tryDrawFromCacheKey(cacheKey, opts);
                    } catch (e) {}
                }
                return $q.resolve(routePathIndex[cacheKey]);
            }

            // ✅ 로딩 중이면 그 Promise 재사용
            if (routePathPromise[cacheKey]) {
                return routePathPromise[cacheKey].then(function (cached) {
                    if (draw && cached) {
                        try {
                            tryDrawFromCacheKey(cacheKey, opts);
                        } catch (e) {}
                    }
                    return cached;
                });
            }

            // ✅ map 안전 획득
            var map = __getMapSafe();
            if (!map || !window.ol) {
                var defer2 = $q.defer();
                var tries2 = 0;

                (function retryMap() {
                    tries2++;
                    map = __getMapSafe();
                    if (map && window.ol) return defer2.resolve(map);
                    if (tries2 >= 3) return defer2.resolve(null);
                    setTimeout(retryMap, 150);
                })();

                return defer2.promise.then(function (m) {
                    if (!m || !window.ol) return null;
                    return loadRoutePath(rid, opts);
                });
            }

            // ✅ route layer/source 준비 + source 전역 노출 보정
            try {
                if (typeof ensureRouteLayer === 'function') ensureRouteLayer();
                __ensureRouteSourceExposed();
            } catch (e) {}

            var defer = $q.defer();
            routePathPromise[cacheKey] = defer.promise;

            // ---------- 유틸 ----------
            function normDirKey(v) {
                var s = String(v || '').toUpperCase();
                if (s === '0' || s === 'UP' || s === 'U' || s.indexOf('상') >= 0) return 'UP';
                if (s === '1' || s === 'DOWN' || s === 'D' || s.indexOf('하') >= 0) return 'DOWN';
                return 'ALL';
            }

            function pickDirKey(p) {
                return normDirKey(p && (p.updowncd ?? p.upDownCd ?? p.upDown ?? p.updown ?? p.dir ?? p.direction ?? p.directionType ?? p.updn ?? 'ALL'));
            }

            function pickLonLat(p) {
                if (!p) return null;
                var latRaw = p.gpslati ?? p.gpsLati ?? p.gpsLat ?? p.gpsY ?? p.lat ?? p.latitude ?? p.y ?? p.mapY ?? p.posY ?? p.tmY;
                var lonRaw = p.gpslong ?? p.gpsLong ?? p.gpsLon ?? p.gpsX ?? p.lon ?? p.longitude ?? p.x ?? p.mapX ?? p.posX ?? p.tmX;

                var lat = Number(latRaw);
                var lon = Number(lonRaw);
                if (!isFinite(lat) || !isFinite(lon)) return null;

                // ✅ [lat,lon] 뒤집힘 방어
                if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) return { lon: lat, lat: lon };

                if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
                return { lon: lon, lat: lat };
            }

            function pickNodeOrd(p) {
                var v = p && (p.nodeord ?? p.nodeOrd ?? p.nodeseq ?? p.nodeSeq ?? p.seq ?? p.ord);
                var n = parseInt(v, 10);
                return isFinite(n) ? n : 0;
            }

            function pickStopId(p, fallback) {
                var id = p && (p.nodeid ?? p.nodeId ?? p.stopId ?? p.stopid ?? p.id);
                id = String(id != null ? id : fallback != null ? fallback : '').trim();
                return id;
            }

            function pickStopName(p) {
                return String(p && (p.nodenm ?? p.nodeNm ?? p.stopNm ?? p.name ?? p.title ?? '')).trim();
            }

            function buildFromLonLatList(coordsLonLat, proj) {
                if (!coordsLonLat || coordsLonLat.length < 2) return null;

                var filtered = [];
                var prevLon = null,
                    prevLat = null;

                coordsLonLat.forEach(function (xy) {
                    var lon = Number(xy && xy[0]);
                    var lat = Number(xy && xy[1]);
                    if (!isFinite(lon) || !isFinite(lat)) return;

                    var rLon = Math.round(lon * 1e6) / 1e6;
                    var rLat = Math.round(lat * 1e6) / 1e6;
                    if (prevLon === rLon && prevLat === rLat) return;

                    filtered.push([lon, lat]);
                    prevLon = rLon;
                    prevLat = rLat;
                });

                if (filtered.length < 2) return null;

                var dense = typeof densifyCoords === 'function' ? densifyCoords(filtered, 1) : filtered;
                var smooth = typeof chaikinSmooth === 'function' ? chaikinSmooth(dense, 1) : dense;

                var projected = smooth.map(function (xy) {
                    var lon = xy[0],
                        lat = xy[1];
                    if (proj && ol.proj && ol.proj.transform) return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                    return [lon, lat];
                });

                return projected && projected.length >= 2 ? projected : null;
            }

            // =========================================================
            // ✅ 실제 로딩은 raw 기반
            // =========================================================
            (typeof loadRoutePathRaw === 'function' ? loadRoutePathRaw(rid, cc) : $q.resolve(null))
                .then(function (raw) {
                    if (!raw || !raw.list || !raw.list.length) {
                        console.warn('[loadRoutePath] raw empty:', { cc: cc, rid: rid, raw: raw });
                        routePathIndex[cacheKey] = null;
                        defer.resolve(null);
                        return;
                    }

                    var list = raw.list;

                    var view = map.getView && map.getView();
                    var proj = (view && view.getProjection && view.getProjection()) || mapProjection;

                    // ✅ dir 그룹핑
                    var groups = new Map();
                    list.forEach(function (p) {
                        var k = pickDirKey(p);
                        if (!groups.has(k)) groups.set(k, []);
                        groups.get(k).push(p);
                    });

                    // ✅ dirs 생성 + (중요) stopIds/polyline/stops 생성
                    var dirCoordsMap = {};
                    var dirStopIdsMap = {};
                    var dirPolylineMap = {};
                    var dirStopsMap = {};

                    groups.forEach(function (arr, k) {
                        if (!arr || arr.length < 2) return;

                        arr.sort(function (a, b) {
                            return pickNodeOrd(a) - pickNodeOrd(b);
                        });

                        var coordsLonLat = [];
                        var stopIds = [];
                        var polyline = [];
                        var stops = [];

                        for (var i = 0; i < arr.length; i++) {
                            var p2 = arr[i];
                            var ll = pickLonLat(p2);
                            if (!ll) continue;

                            var sid = pickStopId(p2, i);
                            var nm = pickStopName(p2);
                            var ord = pickNodeOrd(p2);

                            coordsLonLat.push([ll.lon, ll.lat]);

                            stopIds.push(sid);
                            polyline.push({ lon: ll.lon, lat: ll.lat });

                            stops.push({
                                stopId: sid,
                                name: nm,
                                lon: ll.lon,
                                lat: ll.lat,
                                nodeord: ord,
                                updowncd: k,
                            });
                        }

                        var projected = buildFromLonLatList(coordsLonLat, proj);
                        if (projected && projected.length >= 2) {
                            dirCoordsMap[k] = projected;
                            dirStopIdsMap[k] = stopIds;
                            dirPolylineMap[k] = polyline;
                            dirStopsMap[k] = stops;
                        }
                    });

                    // ✅ ALL 보정
                    if ((!dirCoordsMap.ALL || dirCoordsMap.ALL.length < 2) && (dirCoordsMap.UP || dirCoordsMap.DOWN)) {
                        dirCoordsMap.ALL = dirCoordsMap.UP && dirCoordsMap.UP.length >= 2 ? dirCoordsMap.UP : dirCoordsMap.DOWN;
                        dirStopIdsMap.ALL = dirStopIdsMap.ALL || dirStopIdsMap.UP || dirStopIdsMap.DOWN || [];
                        dirPolylineMap.ALL = dirPolylineMap.ALL || dirPolylineMap.UP || dirPolylineMap.DOWN || [];
                        dirStopsMap.ALL = dirStopsMap.ALL || dirStopsMap.UP || dirStopsMap.DOWN || [];
                    }

                    // ✅ mode/dir 선택(기본 ALL)
                    var useDir = String(opts.dir || 'ALL').toUpperCase();
                    if (!dirCoordsMap[useDir]) useDir = 'ALL';

                    var cached = {
                        dirs: dirCoordsMap,
                        proj: proj,
                        cityCode: cc,
                        routeId: rid,
                        cacheKey: cacheKey,

                        // ✅✅✅ 단일 세그먼트/정류장 마킹에 필요한 데이터
                        stopIds: dirStopIdsMap[useDir] || [],
                        polyline: dirPolylineMap[useDir] || [],
                        stops: dirStopsMap[useDir] || [],

                        // 디버그
                        _rawLen: list.length,
                        _raw: raw,
                        _useDir: useDir,
                    };

                    routePathIndex[cacheKey] = cached;

                    console.log('[loadRoutePath] cached:', {
                        cacheKey: cacheKey,
                        rawLen: list.length,
                        dirKeys: Object.keys(dirCoordsMap || {}),
                        useDir: useDir,
                        allLen: dirCoordsMap.ALL ? dirCoordsMap.ALL.length : 0,
                        stopIdsLen: cached.stopIds.length,
                        polylineLen: cached.polyline.length,
                    });

                    if (draw) {
                        try {
                            tryDrawFromCacheKey(cacheKey, opts);
                        } catch (e) {}
                    }

                    defer.resolve(cached);
                })
                .catch(function (err) {
                    console.warn('[loadRoutePath] fail:', { cc: cc, rid: rid, err: err });
                    routePathIndex[cacheKey] = null;
                    defer.resolve(null);
                })
                .finally(function () {
                    delete routePathPromise[cacheKey];
                });

            return defer.promise;
        }

        // =========================================================
        // ✅ [ADD] 세그먼트 feature에 hover용 값 주입
        // =========================================================
        function applySegPropsToFeature(feature, seg, stopCoord, modeFallback) {
            if (!feature || !feature.set) return;

            // seg에서 from/to id 최대한 흡수
            function getFromId(s) {
                return String((s && (s.from ?? s.fromStopId ?? s.a ?? s.start ?? s.u ?? s.from_id ?? s.fromStop ?? '')) || '').trim();
            }
            function getToId(s) {
                return String((s && (s.to ?? s.toStopId ?? s.b ?? s.end ?? s.v ?? s.to_id ?? s.toStop ?? '')) || '').trim();
            }

            var fromId = getFromId(seg);
            var toId = getToId(seg);

            // stopCoord: { stopId: {x,y,name,...} } 형태라고 가정
            function pickStopName(id) {
                var o = id && stopCoord ? stopCoord[id] : null;
                return String((o && (o.name || o.nodenm || o.nodeNm)) || '').trim();
            }

            var fromName = String((seg && (seg.fromName || seg.from_nm || seg.fromStopName)) || '').trim() || pickStopName(fromId) || (fromId ? '정류장(' + fromId + ')' : '정류장');

            var toName = String((seg && (seg.toName || seg.to_nm || seg.toStopName)) || '').trim() || pickStopName(toId) || (toId ? '정류장(' + toId + ')' : '정류장');

            // dist/time 흡수
            var distM = Number((seg && (seg.distM ?? seg.dist_m ?? seg.dist ?? seg.distanceM ?? seg.distance ?? seg.lenM ?? seg.lengthM)) ?? NaN);
            var timeS = Number((seg && (seg.timeS ?? seg.time_s ?? seg.time ?? seg.diffSec ?? seg.diff_sec ?? seg.durationS ?? seg.duration)) ?? NaN);

            // mode 흡수 (없으면 호출부에서 넘어온 fallback 사용)
            var mode = String((seg && (seg.mode || seg.kind || seg.type)) || modeFallback || '').toUpperCase();

            // ✅ 핵심: feature에 값 넣기
            feature.set('fromId', fromId);
            feature.set('toId', toId);
            feature.set('fromName', fromName);
            feature.set('toName', toName);
            feature.set('mode', mode);

            // dist/time이 숫자면 저장 (hover가 이걸 우선 사용)
            if (isFinite(distM) && distM >= 0) feature.set('distM', distM);
            if (isFinite(timeS) && timeS >= 0) feature.set('timeS', timeS);
        }

        // =========================================================
        // ✅✅✅ [REPLACE] ensureSegmentHoverHandler (hover가 안 뜨는 케이스 보강판)
        // - layer=null 환경에서도 path 라인 hover 가능 (feature tag fallback)
        // - segTag 없어도 LineString이면 최후 fallback으로라도 hover 뜸
        // - map 변경 시 unbind + overlay 재부착
        // - mouseleave 리스너 중복 방지
        // =========================================================
        var __segHoverBound = false;
        var __segHoverBoundMap = null;
        var __segHoverMoveKey = null;

        var __segHoverOverlay = null;
        var __segHoverEl = null;

        var __segHoverAllowedTags = ['mixed-seg', 'single-seg'];
        var __segHoverAllowedLayerTags = ['path'];
        var __segHoverDebug = false;

        var __segHoverLeaveBoundMap = null;

        function ensureSegmentHoverHandler(map, allowedTags, allowedLayerTags) {
            if (!map || !map.on || !window.ol) return false;

            // ✅ 설정 갱신
            __segHoverAllowedTags = Array.isArray(allowedTags) && allowedTags.length ? allowedTags.slice() : ['mixed-seg', 'single-seg'];
            __segHoverAllowedLayerTags = Array.isArray(allowedLayerTags) && allowedLayerTags.length ? allowedLayerTags.slice() : ['path'];

            // ✅ map이 바뀌면 기존 바인딩 해제
            if (__segHoverBound && __segHoverBoundMap && __segHoverBoundMap !== map) {
                try {
                    if (__segHoverMoveKey && ol.Observable && ol.Observable.unByKey) {
                        ol.Observable.unByKey(__segHoverMoveKey);
                    }
                } catch (e1) {}
                __segHoverMoveKey = null;

                try {
                    if (__segHoverOverlay && __segHoverBoundMap.removeOverlay) {
                        __segHoverBoundMap.removeOverlay(__segHoverOverlay);
                    }
                } catch (e2) {}

                __segHoverBound = false;
                __segHoverBoundMap = null;
            }

            // ✅ overlay 준비 (항상 현재 map에 addOverlay)
            if (!__segHoverEl) {
                __segHoverEl = document.createElement('div');
                __segHoverEl.className = 'seg-hover-tooltip';
                __segHoverEl.style.cssText = 'background:rgba(17,24,39,0.92);color:#fff;padding:8px 10px;border-radius:10px;' + 'font-size:12px;line-height:1.25;white-space:nowrap;pointer-events:none;' + 'box-shadow:0 8px 20px rgba(0,0,0,0.25);';
            }
            if (!__segHoverOverlay) {
                __segHoverOverlay = new ol.Overlay({
                    element: __segHoverEl,
                    offset: [0, -10],
                    positioning: 'bottom-center',
                    stopEvent: false,
                });
            }

            // (중요) overlay가 이미 다른 map에 붙어있을 수 있으니 현재 map에 다시 add
            try {
                map.addOverlay(__segHoverOverlay);
                __segHoverOverlay.setPosition(undefined);
            } catch (e3) {}

            // ✅ 이미 이 map에 바인딩 돼 있으면 OK
            if (__segHoverBound && __segHoverBoundMap === map) return true;

            __segHoverBound = true;
            __segHoverBoundMap = map;

            function hide() {
                try {
                    __segHoverOverlay.setPosition(undefined);
                } catch (e) {}
                try {
                    var vp = map.getViewport && map.getViewport();
                    if (vp) vp.style.cursor = '';
                } catch (e2) {}
            }

            function fmtTime(sec) {
                sec = Number(sec);
                if (!isFinite(sec) || sec < 0) return '-';
                var m = Math.floor(sec / 60),
                    s = Math.round(sec % 60);
                return m > 0 ? m + '분 ' + s + '초' : s + '초';
            }
            function fmtDist(m) {
                m = Number(m);
                if (!isFinite(m) || m < 0) return '-';
                if (m >= 1000) return (m / 1000).toFixed(2) + 'km';
                return Math.round(m) + 'm';
            }
            function modeLabel(mode) {
                mode = String(mode || '').toUpperCase();
                if (mode === 'BUS') return '🚌 버스';
                if (mode === 'TRAM') return '🚋 트램';
                if (mode === 'WALK') return '🚶 도보';
                if (mode === 'TRANSFER') return '🔁 환승';
                return mode || '구간';
            }
            function speedMpsForMode(mode) {
                mode = String(mode || '').toUpperCase();
                if (mode === 'BUS') return 6.0;
                if (mode === 'TRAM') return 7.0;
                return 1.2;
            }
            function calcDistMeters(geom) {
                if (!geom) return -1;
                try {
                    if (ol.sphere && typeof ol.sphere.getLength === 'function') {
                        var len1 = ol.sphere.getLength(geom);
                        if (isFinite(len1) && len1 >= 0) return len1;
                    }
                } catch (e1) {}
                try {
                    if (typeof geom.getLength === 'function') {
                        var len2 = geom.getLength();
                        if (isFinite(len2) && len2 >= 0) return len2;
                    }
                } catch (e2) {}
                return -1;
            }

            // ✅ layer가 null일 때 feature에서 tag를 찾아내는 fallback
            function getLayerTagFallback(f, layer) {
                var layerTag = '';
                try {
                    layerTag = String((layer && layer.get && layer.get('tag')) || '');
                } catch (e0) {}

                if (layerTag) return layerTag;

                // ✅ fallback 후보들 (프로젝트마다 다르게 넣어놨을 수 있음)
                var cands = ['layerTag', 'layer_tag', 'tag', 'pathTag', 'layerName'];
                for (var i = 0; i < cands.length; i++) {
                    try {
                        var v = f && f.get && f.get(cands[i]);
                        if (v != null && String(v).trim()) return String(v).trim();
                    } catch (e1) {}
                }
                return '';
            }

            // ✅ best pick: segTag 우선(1000점) > path(10점) > 마지막 fallback(1점)
            function scoreFeature(f, layer) {
                var segTag = String((f.get && f.get('segTag')) || '');
                var layerTag = getLayerTagFallback(f, layer);

                var okSeg = __segHoverAllowedTags.indexOf(segTag) >= 0;
                var okPath = __segHoverAllowedLayerTags.indexOf(layerTag) >= 0;

                // ✅✅✅ 핵심: 둘 다 아니어도 LineString이면 최후 fallback 허용(점수 1)
                if (!okSeg && !okPath) {
                    return 1; // "hover가 아예 안 뜨는" 상황 방지용
                }

                var score = 0;
                if (okSeg) score += 1000;
                if (segTag === 'single-seg') score += 50;
                if (segTag === 'mixed-seg') score += 40;
                if (okPath) score += 10;

                var fn = String((f.get && f.get('fromName')) || '').trim();
                var tn = String((f.get && f.get('toName')) || '').trim();
                if (fn) score += 5;
                if (tn) score += 5;

                return score;
            }

            __segHoverMoveKey = map.on('pointermove', function (evt) {
                try {
                    if (evt.dragging) {
                        hide();
                        return;
                    }

                    var bestF = null,
                        bestLayer = null,
                        bestScore = -1;

                    map.forEachFeatureAtPixel(
                        evt.pixel,
                        function (f, layer) {
                            if (!f || !f.getGeometry) return null;

                            var geom = f.getGeometry();
                            var t = geom && geom.getType && geom.getType();
                            if (t !== 'LineString' && t !== 'MultiLineString') return null; // ✅ Point 무시

                            var sc = scoreFeature(f, layer);

                            if (__segHoverDebug) {
                                try {
                                    console.log('[hover pick]', {
                                        segTag: f.get && f.get('segTag'),
                                        layerTag: getLayerTagFallback(f, layer),
                                        sc: sc,
                                        type: t,
                                    });
                                } catch (eDbg) {}
                            }

                            if (sc > bestScore) {
                                bestScore = sc;
                                bestF = f;
                                bestLayer = layer || null;
                            }
                            return null;
                        },
                        { hitTolerance: 12 }
                    );

                    if (!bestF) {
                        hide();
                        return;
                    }

                    // ✅ 커서 변경 (hover 체감 개선)
                    try {
                        var vp = map.getViewport && map.getViewport();
                        if (vp) vp.style.cursor = 'pointer';
                    } catch (eCur) {}

                    var geom2 = bestF.getGeometry();

                    // ✅ 값 추출 (서버/프론트 변형 흡수)
                    var distM = Number(bestF.get('distM'));
                    var timeS = Number(bestF.get('timeS'));
                    var modeU = String(bestF.get('mode') || '').toUpperCase();

                    // mode 없으면 layerTag / segTag로라도 추정
                    if (!modeU) {
                        var segTag2 = String(bestF.get('segTag') || '').toUpperCase();
                        if (segTag2.indexOf('WALK') >= 0) modeU = 'WALK';
                        else modeU = 'BUS';
                    }

                    // dist/time 비어있으면 geometry로 계산 + 속도로 time 추정
                    if (!isFinite(distM) || distM <= 0) {
                        var d2 = calcDistMeters(geom2);
                        distM = isFinite(d2) && d2 > 0 ? d2 : 0;
                    }
                    if (!isFinite(timeS) || timeS <= 0) {
                        var sp = speedMpsForMode(modeU);
                        timeS = distM > 0 && sp > 0 ? Math.max(1, Math.round(distM / sp)) : 0;
                    }

                    var fromName = String(bestF.get('fromName') || bestF.get('from') || '정류장');
                    var toName = String(bestF.get('toName') || bestF.get('to') || '정류장');

                    __segHoverEl.innerHTML =
                        '<div style="font-weight:700;margin-bottom:4px;">' +
                        modeLabel(modeU) +
                        '</div>' +
                        '<div style="opacity:.95;">' +
                        fromName +
                        ' → ' +
                        toName +
                        '</div>' +
                        '<div style="margin-top:4px;opacity:.95;">거리: <b>' +
                        fmtDist(distM) +
                        '</b> · 시간: <b>' +
                        fmtTime(timeS) +
                        '</b></div>';

                    __segHoverOverlay.setPosition(evt.coordinate);
                } catch (e) {
                    if (__segHoverDebug) console.warn('[seg hover] error', e);
                    hide();
                }
            });

            // ✅ mouseleave 리스너 중복 방지
            try {
                if (__segHoverLeaveBoundMap !== map) {
                    __segHoverLeaveBoundMap = map;
                    var vp2 = map.getViewport && map.getViewport();
                    if (vp2) {
                        vp2.addEventListener('mouseleave', function () {
                            hide();
                        });
                    }
                }
            } catch (eLeave) {}

            if (__segHoverDebug) console.log('[seg hover] bound to map=', map);
            return true;
        }

        // 콘솔에서 호출 편하게
        window.ensureSegmentHoverHandler = ensureSegmentHoverHandler;

        // =========================================================
        // ✅✅✅ [ADD] 단일(BUS/TRAM) 정류장 마커 레이어
        // =========================================================
        function ensureSingleStopMarkerLayer(map) {
            if (!map || !window.ol) return false;

            if (!window.__singleStopMarkerSource) window.__singleStopMarkerSource = new ol.source.Vector();

            if (!window.__singleStopMarkerLayer) {
                window.__singleStopMarkerLayer = new ol.layer.Vector({
                    source: window.__singleStopMarkerSource,
                    zIndex: 9998,
                    style: function (feature) {
                        var kind = feature.get('kind'); // from/to/mid
                        var label = feature.get('label') || '';
                        var isTo = kind === 'to';
                        var isFrom = kind === 'from';

                        return new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: isFrom || isTo ? 8 : 5,
                                fill: new ol.style.Fill({ color: isTo ? '#ef4444' : isFrom ? '#22c55e' : '#3b82f6' }),
                                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                            }),
                            text: new ol.style.Text({
                                text: String(label || ''),
                                offsetY: -18,
                                font: 'bold 12px Segoe UI',
                                fill: new ol.style.Fill({ color: '#111827' }),
                                stroke: new ol.style.Stroke({ color: '#ffffff', width: 4 }),
                            }),
                        });
                    },
                });
                try {
                    window.__singleStopMarkerLayer.set('tag', 'single-marker');
                } catch (eTag) {}
                map.addLayer(window.__singleStopMarkerLayer);
            }

            return true;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 경로 로딩 Promise 캐시 (+ draw 옵션 지원)
        // - cacheKey = cityCode:routeId
        // - routePathIndex[cacheKey] = cachedObject
        // - opts.draw=true 이면 캐시 채운 후 그리기까지 수행
        // - opts.mode='BUS'|'TRAM' 지원
        // =========================================================
        function loadRoutePath(routeId, opts) {
            opts = opts || {};
            const draw = !!opts.draw;

            // ✅ 단일 모드 지원 (BUS/TRAM) : 기본 BUS
            opts.mode = String(opts.mode || 'BUS').toUpperCase();

            const rid = String(routeId || '').trim();
            if (!rid) return $q.resolve(null);

            const cc = String(opts.cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            const cacheKey = makeCacheKey(cc, rid);

            // ✅ 캐시 있으면 즉시 반환 (+ draw 옵션이면 즉시 그림)
            if (routePathIndex[cacheKey]) {
                if (draw) {
                    try {
                        tryDrawFromCacheKey(cacheKey, opts);
                    } catch (e) {}
                }
                return $q.resolve(routePathIndex[cacheKey]);
            }

            // ✅ 로딩 중이면 그 Promise 재사용
            if (routePathPromise[cacheKey]) {
                return routePathPromise[cacheKey].then(function (cached) {
                    if (draw && cached) {
                        try {
                            tryDrawFromCacheKey(cacheKey, opts);
                        } catch (e) {}
                    }
                    return cached;
                });
            }

            const map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol) return $q.resolve(null);

            if (typeof ensureRouteLayer === 'function') ensureRouteLayer();

            const defer = $q.defer();
            routePathPromise[cacheKey] = defer.promise;

            // =========================================================
            // ⬇️⬇️⬇️ 여기부터는 "너 프로젝트 기존 routePath 호출"에 맞춰 수정해야 함
            // ✅ 가장 흔한 형태로 작성해 둠:
            //   GET /api/bus/routePath?cityCode=..&routeId=..
            // 응답 raw를 cached에 담아 routePathIndex에 저장
            // =========================================================
            $http
                .get('/api/bus/routePath', {
                    params: { cityCode: cc, routeId: rid },
                })
                .then(function (resp) {
                    const raw = resp && resp.data;

                    // ✅ cached 구조: raw 포함 + 가능한 필드 평탄화(있으면)
                    const cached = {
                        raw: raw,
                        cityCode: cc,
                        routeId: rid,
                        mode: opts.mode,
                        // 흔한 케이스들 흡수
                        stops: (raw && (raw.stops || raw.stopList || raw.list || raw.nodes)) || null,
                        coords: (raw && (raw.coords || raw.polyline || raw.points)) || null,
                    };

                    routePathIndex[cacheKey] = cached;
                    delete routePathPromise[cacheKey];

                    // ✅ draw 옵션이면 로드 직후 바로 그림
                    if (draw) {
                        try {
                            tryDrawFromCacheKey(cacheKey, opts);
                        } catch (e) {}
                    }

                    defer.resolve(cached);
                })
                .catch(function (err) {
                    console.warn('[loadRoutePath] fail:', err);
                    delete routePathPromise[cacheKey];
                    defer.resolve(null);
                });

            return defer.promise;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 단일 BUS 세그먼트 전용 레이어/소스 (전역 window 단일화 - 안전판)
        // - window.singleBusSource / window.singleBusLayer 를 "유일한 진실"로 사용
        // - 지역 var(singleBusSource/singleBusLayer)가 존재할 수도/없을 수도 있어서 typeof로 안전 동기화
        // - map 재생성/탭 이동 시 레이어가 빠지는 케이스 재-add
        // - 콘솔 디버그 가능
        // =========================================================
        function ensureSingleBusLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            // ✅ 1) source는 window가 유일
            if (!window.singleBusSource) {
                window.singleBusSource = new ol.source.Vector();
            }

            // ✅ 2) style (매번 동일 객체로 안 만들어도 되지만, 안전하게 여기서 생성)
            var STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#2563eb',
                    width: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            // ✅ 3) layer도 window가 유일
            if (!window.singleBusLayer) {
                window.singleBusLayer = new ol.layer.Vector({
                    source: window.singleBusSource,
                    style: STYLE,
                    zIndex: 9999,
                });
                window.singleBusLayer.set('tag', 'single-bus');
                map.addLayer(window.singleBusLayer);
            } else {
                // source/style/zIndex 최신화
                try {
                    window.singleBusLayer.setSource(window.singleBusSource);
                } catch (e0) {}
                try {
                    window.singleBusLayer.setStyle(STYLE);
                } catch (e1) {}
                try {
                    window.singleBusLayer.setZIndex(9999);
                } catch (e2) {}
            }

            // ✅ 4) map에 레이어가 없으면 재-add (라우팅/탭 이동/맵 재생성 대비)
            try {
                var layers = map.getLayers && map.getLayers();
                var arr = layers && layers.getArray ? layers.getArray() : [];
                if (arr && arr.indexOf(window.singleBusLayer) === -1) {
                    map.addLayer(window.singleBusLayer);
                }
            } catch (e3) {}

            // ✅ 5) 기존 코드가 지역변수 singleBusSource/singleBusLayer를 쓰고 있을 수 있음
            //     - "변수가 존재하는 경우에만" window를 가리키게 동기화 (ReferenceError 방지)
            try {
                if (typeof singleBusSource !== 'undefined') singleBusSource = window.singleBusSource;
            } catch (e4) {}
            try {
                if (typeof singleBusLayer !== 'undefined') singleBusLayer = window.singleBusLayer;
            } catch (e5) {}

            // ✅ 6) (옵션) alias는 충돌 방지 위해 "없을 때만" 세팅
            // - 이미 다른 단일 세그 레이어를 window.singleSegSource로 쓰는 프로젝트면 덮어쓰면 안 됨
            try {
                if (!window.singleSegSource) window.singleSegSource = window.singleBusSource;
                if (!window.singleSegLayer) window.singleSegLayer = window.singleBusLayer;
            } catch (e6) {}

            // ✅ 디버그 로그 (1회만)
            try {
                if (!window.__dbgSingleBusLayerOnce) {
                    window.__dbgSingleBusLayerOnce = true;
                    console.log('[ensureSingleBusLayer] OK', {
                        feats: window.singleBusSource.getFeatures ? window.singleBusSource.getFeatures().length : -1,
                        tag: window.singleBusLayer.get ? window.singleBusLayer.get('tag') : null,
                        z: window.singleBusLayer.getZIndex ? window.singleBusLayer.getZIndex() : null,
                    });
                }
            } catch (e7) {}

            return true;
        }

        // 콘솔에서 바로 호출 가능하게 export
        window.ensureSingleBusLayer = ensureSingleBusLayer;

        // =========================================================
        // ✅ cached routePath 에서 stopCoord 맵 만들기
        // - polyline + stopIds 길이 같으면 stopIds->좌표 매칭
        // - 아니면 기존 buildStopCoordMapFallback() 사용
        // =========================================================
        function buildStopCoordMapFromCachedRoutePath(cached) {
            var m = {};

            try {
                var stopIds = cached && cached.stopIds;
                var poly = cached && cached.polyline;

                if (Array.isArray(stopIds) && Array.isArray(poly) && stopIds.length === poly.length) {
                    for (var i = 0; i < stopIds.length; i++) {
                        var id = String(stopIds[i] || '').trim();
                        var p = poly[i] || {};
                        var lat = Number(p.lat);
                        var lon = Number(p.lon);
                        if (!id) continue;
                        if (!isFinite(lat) || !isFinite(lon)) continue;
                        m[id] = [lon, lat];
                    }
                    return m;
                }
            } catch (e) {}

            // fallback
            try {
                if (typeof buildStopCoordMapFallback === 'function') return buildStopCoordMapFallback() || {};
            } catch (e2) {}

            return m;
        }

        // =========================================================
        // ✅ cached routePath(stopIds) -> "정류장→정류장" pathArr 만들기
        // =========================================================
        function makePathArrFromStopIds(stopIds) {
            var arr = [];
            if (!Array.isArray(stopIds) || stopIds.length < 2) return arr;
            for (var i = 0; i < stopIds.length - 1; i++) {
                var a = String(stopIds[i] || '').trim();
                var b = String(stopIds[i + 1] || '').trim();
                if (!a || !b) continue;
                arr.push({ from: a, to: b }); // dist/time은 buildSingleSegFeatures가 계산(또는 seg에 있으면 사용)
            }
            return arr;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 단일 BUS 세그먼트 그리기 (cached 기반)
        // - 핵심: window.singleBusSource 에 segTag='single-seg' 구간만 들어감
        // - hover: ensureSegmentHoverHandler 사용(단일은 layerTag 차단)
        // - 통짜 path/route 라인 source도 비워서 hover 오염 차단
        // =========================================================
        function drawSingleBusSegmentsFromCached(cached) {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !cached) return false;

            // ✅ 단일 BUS 레이어 확보(전역에 source 노출)
            if (typeof ensureSingleBusLayer !== 'function') {
                console.warn('[SINGLE BUS] ensureSingleBusLayer missing');
                return false;
            }
            if (!ensureSingleBusLayer()) return false;

            // ✅ singleBusSource는 전역(window)로 통일해서 관리 (콘솔에서도 접근 가능)
            var segSource = window.singleBusSource;
            if (!segSource || !segSource.addFeature) {
                console.warn('[SINGLE BUS] window.singleBusSource missing');
                return false;
            }

            // ✅ 단일 세그먼트만 남기기
            try {
                segSource.clear(true);
            } catch (e0) {}

            // ✅ 통짜 라인들 남아있으면 hover가 그걸 잡아버림 → 싹 비움(가능한 만큼)
            try {
                if (typeof clearRouteLayer === 'function') clearRouteLayer();
            } catch (e1) {}
            try {
                if (typeof pathVectorSource !== 'undefined' && pathVectorSource && pathVectorSource.clear) {
                    pathVectorSource.clear(true);
                }
            } catch (e2) {}
            try {
                if (typeof pathSegSource !== 'undefined' && pathSegSource && pathSegSource.clear) {
                    pathSegSource.clear(true);
                }
            } catch (e3) {}

            // ✅ hover: 단일은 segTag('single-seg')만 허용되게 layerTag 차단
            try {
                if (typeof ensureSegmentHoverHandler === 'function') {
                    ensureSegmentHoverHandler(map, ['single-seg'], ['__never__']);
                } else {
                    console.warn('[SINGLE BUS] ensureSegmentHoverHandler missing');
                }
            } catch (eH) {
                console.warn('[SINGLE BUS] hover bind fail', eH);
            }

            // ✅ stopIds 확보
            var stopIds = typeof extractStopIdsFromRoutePath === 'function' ? extractStopIdsFromRoutePath(cached) : null;

            if (!stopIds || stopIds.length < 2) {
                console.warn('[SINGLE BUS] stopIds empty:', cached);
                return false;
            }

            // ✅ 좌표 맵 / 이름 맵
            var stopCoord = typeof buildStopCoordMapFromCachedRoutePath === 'function' ? buildStopCoordMapFromCachedRoutePath(cached) : null;

            if (!stopCoord) {
                console.warn('[SINGLE BUS] stopCoord map empty');
                return false;
            }

            var stopMeta = {}; // 필요하면 { [stopId]: {name:'...'} } 형태로 채워도 됨

            // ✅ pathArr 생성
            var pathArr = typeof makePathArrFromStopIds === 'function' ? makePathArrFromStopIds(stopIds) : null;

            if (!pathArr || !pathArr.length) {
                console.warn('[SINGLE BUS] pathArr empty');
                return false;
            }

            // ✅ 세그먼트 피처 생성 (segTag 반드시 single-seg로)
            if (typeof buildSingleSegFeatures !== 'function') {
                console.warn('[SINGLE BUS] buildSingleSegFeatures missing');
                return false;
            }

            var made = buildSingleSegFeatures(
                map,
                pathArr,
                stopCoord,
                stopMeta,
                'BUS',
                segSource // ✅ 무조건 singleBusSource에 추가
            );

            console.log('[SEG][SINGLE BUS] made=', made, 'stopIds=', stopIds.length, 'pathArr=', pathArr.length);

            try {
                if (map.renderSync) map.renderSync();
            } catch (eR) {}

            return Number(made) > 0;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] routeId -> load(cache) + 폴리라인 draw 활성화
        // =========================================================
        function drawBusRouteByRouteId(routeId, opt) {
            opt = opt || {};
            var rid = String(routeId || '').trim();
            if (!rid) return $q.resolve(null);

            var cc = String(opt.cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            var cacheKey = makeCacheKey(cc, rid);

            // ✅ draw:true → path LineString 실제로 그리도록 변경
            return loadRoutePath(rid, {
                cityCode: cc,
                mode: opt.mode || 'BUS',

                draw: true, // 🔥 폴리라인 생성 ON
                fit: false, // 확대는 focusBus에서 담당

                from: opt.reason || 'drawBusRouteByRouteId',
            }).then(function (cached) {
                if (!cached) {
                    console.warn('[drawBusRouteByRouteId] cached null:', cacheKey);
                    return null;
                }

                try {
                    console.log('[drawBusRouteByRouteId] cached ok:', {
                        cacheKey: cacheKey,
                        mode: opt.mode || 'BUS',
                        keys: Object.keys(cached || {}),
                    });
                } catch (e) {}

                return cached;
            });
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 버스 도착정보 목록에서 버스 클릭 (가까운 버스 1대 + 정류장 함께 fit + 되돌림 방지 + 폴리라인 복구)
        // - ✅ 같은 번호(같은 routeId/routeNo) 버스들 중 "선택 정류장"에 가장 가까운 1대 선택
        // - ✅ "선택 정류장 + 선택 버스"가 화면에 같이 들어오도록 fit(우측 패널 padding 고려)
        // - ✅ 비동기 로직이 view를 다시 건드려도(되돌림) 재-fit으로 고정 (★이전 클릭 타이머 취소/무효화 포함)
        // - ✅ path tag 몰라도 LineString/MultiLineString 레이어는 전부 visible=true로 복구
        // - ✅ (중요) 버스 좌표가 lon/lat(4326)로 들어오는 케이스 자동 변환해서 stopXY(지도좌표)와 좌표계 통일
        // - ✅ (추가) 정류장 좌표도 gpsx/gpsy(이미 map좌표) / lonlat 혼재를 자동 처리
        // - ✅ (추가) 항상 "버스는 최대 확대(zoom 19)" 먼저 적용 -> stopXY가 정상일 때만 stop+bus fit
        // =========================================================
        $scope.focusBus = function (arrival) {
            if (!arrival) return;

            var targetNo = String(arrival.routeNo || arrival.routeno || arrival.route_no || arrival.routeNoNm || '').trim();
            var arrivalRouteId = String(arrival.routeid || arrival.routeId || arrival.busRouteId || (arrival._raw && (arrival._raw.routeid || arrival._raw.routeId || arrival._raw.busRouteId)) || '').trim();

            if (!arrivalRouteId && !targetNo) {
                console.warn('[focusBus] arrivalRouteId/targetNo empty:', arrival);
                return;
            }

            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;

            function normalizeRouteNo(v) {
                return String(v || '')
                    .replace(/\s+/g, '')
                    .replace(/번/g, '')
                    .trim();
            }
            var targetNoNorm = normalizeRouteNo(targetNo);

            // =========================================================
            // ✅ stopLL/stopXY 유틸 (기존 흐름 유지)
            // =========================================================
            function getStopLonLat() {
                var hasStop = currentStopCoord && typeof currentStopCoord === 'object' && isFinite(Number(currentStopCoord.lat)) && (isFinite(Number(currentStopCoord.lon)) || isFinite(Number(currentStopCoord.lng)));

                if (hasStop) {
                    var lat1 = Number(currentStopCoord.lat);
                    var lon1 = isFinite(Number(currentStopCoord.lon)) ? Number(currentStopCoord.lon) : Number(currentStopCoord.lng);
                    if (isFinite(lat1) && isFinite(lon1)) return { lon: lon1, lat: lat1 };
                }

                // fallback: selectedStop (lon/lat만)
                try {
                    var s = $scope.selectedStop || window.selectedStop || null;
                    if (!s) return null;

                    var lat2 = parseFloat(s.gpslati || s.gpsLati || s.lat || s.latitude);
                    var lon2 = parseFloat(s.gpslong || s.gpsLong || s.lon || s.longitude);
                    if (!isFinite(lat2) || !isFinite(lon2)) return null;

                    if (Math.abs(lat2) > 90 && Math.abs(lon2) <= 90) {
                        var t = lat2;
                        lat2 = lon2;
                        lon2 = t;
                    }
                    if (Math.abs(lat2) > 90 || Math.abs(lon2) > 180) return null;

                    return { lon: lon2, lat: lat2 };
                } catch (e) {
                    return null;
                }
            }

            function toMapXY(lon, lat) {
                if (!map || !window.ol || !ol.proj) return null;
                if (typeof lonLatToMapXY === 'function') return lonLatToMapXY(lon, lat);

                var view = map.getView && map.getView();
                var proj = (view && view.getProjection && view.getProjection()) || null;
                if (!proj) return null;

                return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
            }

            // =========================================================
            // ✅✅✅ (핵심) 좌표계 통일: lon/lat(4326)면 mapXY로 변환
            // =========================================================
            function toMapXYAny(xy) {
                if (!map || !xy || xy.length < 2 || !window.ol || !ol.proj) return null;

                var x = Number(xy[0]),
                    y = Number(xy[1]);
                if (!isFinite(x) || !isFinite(y)) return null;

                // lon/lat로 보이면 변환
                if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
                    var view = map.getView && map.getView();
                    var proj = (view && view.getProjection && view.getProjection()) || null;
                    if (!proj) return null;
                    try {
                        return ol.proj.transform([x, y], 'EPSG:4326', proj);
                    } catch (e) {
                        return null;
                    }
                }
                return [x, y];
            }

            // =========================================================
            // ✅✅✅ 정류장 좌표 혼재(gpsx/gpsy mapXY vs lon/lat) 자동 처리
            // =========================================================
            function stopToMapXYFromSelectedStop(s) {
                if (!s) return null;

                // 1) gpsx/gpsy가 map좌표(큰 값)면 그대로
                var x = parseFloat(s.gpsx || s.gpsX);
                var y = parseFloat(s.gpsy || s.gpsY);
                if (isFinite(x) && isFinite(y) && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
                    return [x, y];
                }

                // 2) lon/lat
                var lat = parseFloat(s.gpslati || s.gpsLati || s.lat || s.latitude);
                var lon = parseFloat(s.gpslong || s.gpsLong || s.lon || s.longitude);

                // gpsx/gpsy에 lonlat가 들어온 경우
                if (!isFinite(lat) || !isFinite(lon)) {
                    if (isFinite(x) && isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) {
                        lon = x;
                        lat = y;
                    } else {
                        return null;
                    }
                }

                if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                    var t = lat;
                    lat = lon;
                    lon = t;
                }
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

                return toMapXY(lon, lat);
            }

            // =========================================================
            // ✅ 버스 최대 확대(항상 먼저)
            // =========================================================
            function zoomTightToBus(busXY) {
                try {
                    if (!map || !busXY) return false;
                    var v = map.getView && map.getView();
                    if (!v) return false;
                    v.animate({ center: busXY, zoom: 19, duration: 220 });
                    return true;
                } catch (e) {
                    return false;
                }
            }

            // =========================================================
            // ✅ stop+bus fit
            // =========================================================
            function fitStopAndBus(stopXY, busXY) {
                try {
                    if (!map || !stopXY || !busXY) return false;
                    var view = map.getView && map.getView();
                    if (!view) return false;

                    var extent = ol.extent.boundingExtent([stopXY, busXY]);

                    var w = extent[2] - extent[0];
                    var h = extent[3] - extent[1];
                    var pad = Math.max(w, h) * 0.35;
                    if (isFinite(pad) && pad > 0) {
                        extent = [extent[0] - pad, extent[1] - pad, extent[2] + pad, extent[3] + pad];
                    }

                    view.fit(extent, {
                        duration: 260,
                        padding: [90, 420, 90, 40],
                        maxZoom: 19,
                    });
                    return true;
                } catch (e) {
                    return false;
                }
            }

            // =========================================================
            // ✅✅✅ 안전 fit: 1) bus는 무조건 최대 확대 2) stop이 정상일 때만 fit
            // =========================================================
            function safeFitStopAndBus(stopXY, busXY) {
                if (!busXY || !map) return false;

                // ✅ 1) 무조건 버스에 최대 확대 먼저
                zoomTightToBus(busXY);

                // ✅ 2) stop이 없으면 여기서 끝(그래도 버스는 최대 확대됨)
                if (!stopXY) return true;

                // ✅ 3) 너무 멀면 stopXY 이상치 -> bus-only 유지
                var dx = busXY[0] - stopXY[0];
                var dy = busXY[1] - stopXY[1];
                var d = Math.sqrt(dx * dx + dy * dy);

                if (isFinite(d) && d > 15000) {
                    console.warn('[focusBus] stopXY seems wrong (too far). keep bus-only:', d, { stopXY: stopXY, busXY: busXY });
                    return true;
                }

                // ✅ 4) 정상일 때만 stop+bus fit
                return fitStopAndBus(stopXY, busXY);
            }

            // =========================================================
            // ✅✅✅ 되돌림 방지(개선): 이전 클릭 타이머 취소 + 토큰 무효화
            // =========================================================
            function lockFitStopAndBus(stopXY, busXY) {
                if (!busXY) return;

                __focusBusFitToken++;
                var myToken = __focusBusFitToken;

                try {
                    for (var i = 0; i < __focusBusFitTimers.length; i++) {
                        $timeout.cancel(__focusBusFitTimers[i]);
                    }
                } catch (e) {}
                __focusBusFitTimers = [];

                function schedule(ms) {
                    var t = $timeout(function () {
                        if (myToken !== __focusBusFitToken) return;
                        safeFitStopAndBus(stopXY, busXY);
                    }, ms);
                    __focusBusFitTimers.push(t);
                }

                schedule(0);
                schedule(250);
                schedule(900);
            }

            // ✅✅✅ path tag 몰라도 “라인 레이어”는 전부 visible=true
            function showAllLineLayersSafely() {
                try {
                    if (!map || !map.getLayers) return 0;

                    var layers = map.getLayers().getArray ? map.getLayers().getArray() : [];
                    var turnedOn = 0;

                    for (var i = 0; i < layers.length; i++) {
                        var ly = layers[i];
                        if (!ly || !ly.getSource || !ly.setVisible) continue;

                        var src = ly.getSource && ly.getSource();
                        if (!src || !src.getFeatures) continue;

                        var fs = src.getFeatures() || [];
                        if (!fs.length) continue;

                        var g = fs[0].getGeometry && fs[0].getGeometry();
                        var gt = g && g.getType ? g.getType() : '';
                        if (gt === 'LineString' || gt === 'MultiLineString') {
                            ly.setVisible(true);
                            turnedOn++;
                        }
                    }

                    console.log('[focusBus] showAllLineLayersSafely turnedOn:', turnedOn);
                    return turnedOn;
                } catch (e) {
                    return 0;
                }
            }

            // ---------------------------
            // ✅ 가까운 버스 선택 + 확대/fit
            // ---------------------------
            var moved = false;
            var selectedFeature = null;
            var busXY = null;

            // ✅ stopXY 계산: currentStopCoord 우선 + selectedStop(gpsx/gpsy 포함) fallback
            var stopXY = null;
            try {
                var stopLL = getStopLonLat();
                stopXY = stopLL ? toMapXY(stopLL.lon, stopLL.lat) : null;

                if (!stopXY) {
                    var ss = $scope.selectedStop || window.selectedStop || null;
                    stopXY = stopToMapXYFromSelectedStop(ss);
                }
            } catch (e) {}

            // ✅ 후보 수집 + nearest 선택
            if (map && typeof busVectorSource !== 'undefined' && busVectorSource && busVectorSource.getFeatures) {
                var features = busVectorSource.getFeatures() || [];
                if (features && features.length) {
                    var candidates = [];

                    for (var i = 0; i < features.length; i++) {
                        var f = features[i];
                        if (!f || !f.get) continue;

                        var fRouteNo = normalizeRouteNo(f.get('routeNo') || f.get('routeno') || f.get('route_no') || (f.get('bus') && f.get('bus').routeno) || '');

                        var fRouteId = String(f.get('routeid') || f.get('routeId') || f.get('busRouteId') || (f.get('bus') && (f.get('bus').routeid || f.get('bus').routeId || f.get('bus').busRouteId)) || '').trim();

                        var ok = false;
                        if (arrivalRouteId && fRouteId) ok = fRouteId === arrivalRouteId;
                        else if (targetNoNorm && fRouteNo) ok = fRouteNo === targetNoNorm;

                        if (ok) candidates.push(f);
                    }

                    if (candidates.length) {
                        selectedFeature = candidates[0];

                        // ✅ stopXY 기준 가장 가까운 버스 선택
                        if (stopXY) {
                            var bestD2 = Infinity;
                            var bestFeat = selectedFeature;

                            for (var j = 0; j < candidates.length; j++) {
                                var cf = candidates[j];
                                if (!cf || !cf.getGeometry) continue;

                                var g2 = cf.getGeometry();
                                var raw2 = g2 && g2.getCoordinates ? g2.getCoordinates() : null;
                                var xy2 = toMapXYAny(raw2);
                                if (!xy2) continue;

                                var dx = xy2[0] - stopXY[0];
                                var dy = xy2[1] - stopXY[1];
                                var d2 = dx * dx + dy * dy;

                                if (d2 < bestD2) {
                                    bestD2 = d2;
                                    bestFeat = cf;
                                }
                            }

                            selectedFeature = bestFeat;
                            console.log('[focusBus] nearest bus by geometry:', { bestD2: bestD2 });
                        } else {
                            console.warn('[focusBus] stopXY not found -> nearest selection skipped');
                        }

                        // busXY 확보 (✅ 정규화)
                        try {
                            var gg = selectedFeature.getGeometry && selectedFeature.getGeometry();
                            var rawBus = gg && gg.getCoordinates ? gg.getCoordinates() : null;
                            busXY = toMapXYAny(rawBus);
                        } catch (e) {}

                        // ✅✅✅ 핵심: stop이 없어도 bus-only 최대 확대는 무조건 적용
                        if (busXY && safeFitStopAndBus(stopXY, busXY)) {
                            moved = true;
                            lockFitStopAndBus(stopXY, busXY);
                        }
                    }
                }
            }

            console.log('[focusBus] click:', {
                targetNo: targetNoNorm,
                arrivalRouteId: arrivalRouteId,
                movedFitStopAndBus: moved,
                hasSelectedFeature: !!selectedFeature,
                hasStopXY: !!stopXY,
                hasBusXY: !!busXY,
            });

            // =========================================================
            // ✅ 노선 기준 작업
            // =========================================================
            try {
                if (typeof hideAllPointLayersOnMap === 'function') hideAllPointLayersOnMap();
            } catch (e0) {}

            try {
                clearRouteStops();
            } catch (e1) {}
            try {
                if (singleBusSource && singleBusSource.clear) singleBusSource.clear(true);
            } catch (e2) {}

            try {
                if (window.__segHoverOverlay && window.__segHoverOverlay.setPosition) window.__segHoverOverlay.setPosition(undefined);
            } catch (e3) {}

            // 1) cached 로드
            var drawRet = null;
            try {
                drawRet = drawBusRouteByRouteId(arrivalRouteId, {
                    mode: 'BUS',
                    fit: false,
                    reason: 'arrival-click',
                    draw: true,
                    showArrow: true,
                });
                console.log('[focusBus] drawBusRouteByRouteId called:', { routeId: arrivalRouteId, mode: 'BUS' });

                showAllLineLayersSafely();

                // ✅ draw가 view를 건드리면 재-fit(최신 클릭만 유효)
                if (busXY) lockFitStopAndBus(stopXY, busXY);
            } catch (e4) {
                console.warn('[focusBus] drawBusRouteByRouteId error:', e4);
            }

            // 2) (옵션) 목록 필터 유지
            try {
                if (typeof applyRouteStopFilter === 'function') {
                    $timeout(function () {
                        try {
                            applyRouteStopFilter(arrivalRouteId);
                        } catch (e5) {}
                        if (busXY) lockFitStopAndBus(stopXY, busXY);
                    }, 0);
                }
            } catch (e6) {}

            function afterDrawMarkRouteStops(cached) {
                try {
                    var stopIds = extractStopIdsFromRoutePath(cached);
                    if (!stopIds || !stopIds.length) {
                        console.warn('[focusBus] no stopIds in cached routePath');
                        return;
                    }

                    var tries = 0;
                    function tryMark() {
                        tries++;

                        var stopCoordMap = buildStopCoordMapFallback();
                        try {
                            if (typeof ensureRouteStopLayer === 'function') ensureRouteStopLayer();
                            if (typeof routeStopLayer !== 'undefined' && routeStopLayer && routeStopLayer.setVisible) routeStopLayer.setVisible(true);
                        } catch (e0) {}

                        drawRouteStopsOnly(stopIds, 'BUS', stopCoordMap);

                        showAllLineLayersSafely();
                        if (busXY) lockFitStopAndBus(stopXY, busXY);

                        if (tries < 2) setTimeout(tryMark, 250);
                    }
                    tryMark();
                } catch (e) {
                    console.warn('[focusBus] afterDrawMarkRouteStops error:', e);
                }
            }

            if (drawRet && typeof drawRet.then === 'function') {
                drawRet
                    .then(function (cached) {
                        console.log('✅✅ drawRet.then CALLED', cached ? 'cached ok' : 'cached null');
                        if (!cached) return;

                        afterDrawMarkRouteStops(cached);

                        try {
                            drawSingleBusSegmentsFromCached(cached);
                        } catch (e7) {}

                        showAllLineLayersSafely();
                        if (busXY) lockFitStopAndBus(stopXY, busXY);
                    })
                    .catch(function (e8) {
                        console.warn('[focusBus] drawRet promise error:', e8);
                    });
            }

            return;
        };

        // =========================================================
        // ✅✅✅ [REPLACE] 버스 탭 리셋
        // - 단일 마커/단일 경로 source(window.__routeVectorSource)도 같이 clear
        // =========================================================
        function resetBusView() {
            $scope.keyword = '';
            $scope.statusMessage = '';
            $scope.statusType = '';
            $scope.stops = [];
            $scope.arrivals = [];
            $scope.loadingArrival = false;

            $scope.selectedStop = null;
            $scope.selectedBus = null;
            lastPickedKey = null;
            lastPickedKind = null;
            hideMapPopup();

            currentNodeId = null;
            currentStopCoord = null;
            stopPolling();

            if (vectorSource) vectorSource.clear();
            if (busVectorSource) busVectorSource.clear();
            if (routeVectorSource) routeVectorSource.clear();

            // ✅ 단일 경로가 실제로 쓰는 소스도 같이 clear (중요!)
            try {
                if (window.__routeVectorSource && window.__routeVectorSource.clear) {
                    window.__routeVectorSource.clear(true);
                }
            } catch (e0) {}

            // ✅ 단일 마커도 clear
            try {
                if (window.__singleStopMarkerSource && window.__singleStopMarkerSource.clear) {
                    window.__singleStopMarkerSource.clear(true);
                }
            } catch (e1) {}

            if (tramVectorSource) tramVectorSource.clear();
            if (tramStationSource) tramStationSource.clear();
            $scope.activeTramSections = {};

            busLastPos.clear();
            busLastProjPos.clear();
            busLastHeading.clear();

            busFeatureMap.clear();
            busLastSeen.clear();

            Object.keys(routePathIndex).forEach((k) => delete routePathIndex[k]);
            Object.keys(routePathPromise).forEach((k) => delete routePathPromise[k]);

            $timeout(function () {
                const map = getInnerOlMap();
                if (map && map.getView) {
                    const view = map.getView();
                    try {
                        if (initialCenter) view.setCenter(initialCenter);
                        if (typeof initialZoom === 'number') view.setZoom(initialZoom);
                        if (map.updateSize) map.updateSize();
                    } catch (e) {}
                }
            }, 0);
        }

        $scope.resetBus = function () {
            resetBusView();
            setStatus('success', '초기화 완료', 1200);
        };

        $scope.$on('reset-bus-view', function () {
            resetBusView();
        });

        // =========================================================
        // ✅🚋 트램 레이어
        // =========================================================
        // ✅🚋 트램 공구 레이어(공구용) = 무조건 검정
        function ensureTramLayer() {
            initMap();

            const map = getInnerOlMap();
            if (!map || !window.ol) return false;

            if (!tramVectorSource) tramVectorSource = new ol.source.Vector();

            const STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#111827', // 공구는 검정 고정
                    width: 6,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!tramVectorLayer) {
                tramVectorLayer = new ol.layer.Vector({
                    source: tramVectorSource,
                    style: STYLE,
                    zIndex: 5, // ✅ routeLayer(15)보다 아래
                });
                map.addLayer(tramVectorLayer);
            } else {
                tramVectorLayer.setStyle(STYLE);
                tramVectorLayer.setZIndex(5);
            }

            // ✅ 반드시 return 전에 노출!
            window.__tramVectorLayer = tramVectorLayer;
            window.__tramVectorSource = tramVectorSource;

            return true;
        }

        // ================== TRAM: station(숫자) 레이어 ==================
        function ensureTramStationLayer() {
            initMap();
            const map = getInnerOlMap();
            if (!map || !window.ol) return;

            if (!tramStationSource) tramStationSource = new ol.source.Vector();

            if (!tramStationLayer) {
                const styleFn = function (feature) {
                    const id = feature.get('stationId');
                    const txt = id != null ? String(id) : '';

                    return new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 10,
                            fill: new ol.style.Fill({ color: 'white' }),
                            stroke: new ol.style.Stroke({ color: '#c0392b', width: 3 }),
                        }),
                        text: new ol.style.Text({
                            text: txt,
                            font: 'bold 12px sans-serif',
                            fill: new ol.style.Fill({ color: '#111827' }),
                            stroke: new ol.style.Stroke({ color: 'white', width: 3 }),
                            offsetY: 0,
                        }),
                    });
                };

                tramStationLayer = new ol.layer.Vector({
                    source: tramStationSource,
                    style: styleFn,
                    zIndex: 9999,
                });
                map.addLayer(tramStationLayer);
            }
        }

        function addStationsForSection(sectionNo) {
            ensureTramStationLayer();

            const map = getInnerOlMap();
            if (!map || !window.ol || !tramStationSource) return;

            const all = window.TRAM_STATIONS || window.TRAM_ROUTE_FULL_HD || [];
            if (!Array.isArray(all) || !all.length) return;

            const sectionKey = String(sectionNo) + '구간';

            const view = map.getView && map.getView();
            const proj = view && view.getProjection ? view.getProjection() : mapProjection;

            all.forEach(function (p) {
                if (!p) return;
                if (p.type !== 'station') return;
                if (String(p.section || '') !== sectionKey) return;

                const lon = parseFloat(p.lng);
                const lat = parseFloat(p.lat);
                if (!isFinite(lon) || !isFinite(lat)) return;

                let coord = [lon, lat];
                if (proj && ol.proj && ol.proj.transform) coord = ol.proj.transform([lon, lat], 'EPSG:4326', proj);

                const f = new ol.Feature({ geometry: new ol.geom.Point(coord) });
                f.set('stationId', p.id);
                f.set('tramSection', String(sectionNo));
                f.set('kind', 'tramStation');
                f.set('station', p);

                tramStationSource.addFeature(f);
            });
        }

        function removeStationsForSection(sectionNo) {
            ensureTramStationLayer();
            if (!tramStationSource) return;

            const key = String(sectionNo);
            const features = (tramStationSource.getFeatures && tramStationSource.getFeatures()) || [];
            features.slice().forEach(function (f) {
                if (String(f.get('tramSection')) === key) tramStationSource.removeFeature(f);
            });
        }

        function fitToTramExtent() {
            try {
                const map = getInnerOlMap();
                if (!map || !tramVectorSource) return;

                const extent = tramVectorSource.getExtent && tramVectorSource.getExtent();
                if (!extent || !isFinite(extent[0]) || !isFinite(extent[1])) return;

                const view = map.getView && map.getView();
                if (!view || !view.fit) return;

                view.fit(extent, { padding: [40, 40, 40, 40], duration: 450, maxZoom: 16 });
            } catch (e) {}
        }

        // ================== 트램 토글 ==================
        // ================== 트램 토글 ==================
        $scope.activeTramSections = $scope.activeTramSections || {};

        $scope.toggleTram = function (sectionNo) {
            const cfg = TRAM_ROUTES[sectionNo];
            const key = String(sectionNo);
            if (!cfg) return;

            // ✅ 트램 "공구"는 색 고정: 검정 실선
            // (cfg.color 쓰면 빨강/분홍으로 바뀔 수 있음)
            const ok = ensureTramLayer('#111827');
            if (!ok || !tramVectorLayer) {
                setStatus('error', '지도가 아직 준비되지 않았습니다. 잠시 후 다시 눌러주세요.', 1500);
                return;
            }

            const src = tramVectorLayer.getSource && tramVectorLayer.getSource();
            if (!src) {
                setStatus('error', '트램 소스가 아직 준비되지 않았습니다. 잠시 후 다시 눌러주세요.', 1500);
                return;
            }

            const map = getInnerOlMap();
            const view = map && map.getView && map.getView();
            const proj = view && view.getProjection ? view.getProjection() : mapProjection;

            function toProjected(xy) {
                const lon = parseFloat(xy && xy[0]);
                const lat = parseFloat(xy && xy[1]);
                if (!isFinite(lon) || !isFinite(lat)) return null;

                if (proj && window.ol && ol.proj && ol.proj.transform) {
                    return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                }
                return [lon, lat];
            }

            const isOn = !!$scope.activeTramSections[key];

            // =========================
            // OFF
            // =========================
            if (isOn) {
                const features = (src.getFeatures && src.getFeatures()) || [];
                features.slice().forEach(function (f) {
                    // ✅ Feature 속성으로 설정된 tramSection을 기준으로 삭제
                    if (String(f.get('tramSection')) === key) src.removeFeature(f);
                });

                removeStationsForSection(sectionNo);

                delete $scope.activeTramSections[key];
                fitToTramExtent();
                return;
            }

            // =========================
            // ON
            // =========================
            $scope.activeTramSections[key] = true;

            const lines = Array.isArray(cfg.lines) ? cfg.lines : null;
            const coords = Array.isArray(cfg.coords) ? cfg.coords : null;

            let added = 0;

            // ✅ helper: feature 만들고 속성 set
            function addLine(projected, idx) {
                if (!projected || projected.length < 2) return;

                const f = new ol.Feature({
                    geometry: new ol.geom.LineString(projected),
                });
                // ✅ 여기 중요: f.get('tramSection')로 잡히게 해야 OFF에서 지워짐
                f.set('tramSection', key);
                f.set('lineIndex', idx || 0);
                f.set('kind', 'tramTool'); // (옵션) 구분용
                src.addFeature(f);
                added++;
            }

            if (lines && lines.length) {
                lines.forEach(function (oneLine, idx) {
                    if (!Array.isArray(oneLine) || oneLine.length < 2) return;
                    const projected = oneLine.map(toProjected).filter(Boolean);
                    addLine(projected, idx);
                });
            } else if (coords && coords.length >= 2) {
                const projected = coords.map(toProjected).filter(Boolean);
                addLine(projected, 0);
            } else {
                setStatus('error', '이 공구의 좌표(coords/lines)가 아직 없습니다.', 1500);
                delete $scope.activeTramSections[key];
                return;
            }

            if (!added) {
                setStatus('error', '좌표 변환 후 라인을 그릴 수 없습니다.', 1500);
                delete $scope.activeTramSections[key];
                return;
            }

            addStationsForSection(sectionNo);
            fitToTramExtent();
        };

        // =========================================================
        // ✅ 소요시간 수집(collect) - 정류장 후보 검색 공통 (DB 기반으로 통일)
        // =========================================================
        function fetchStopCandidatesByKeyword(keyword) {
            const kw = (keyword || '').trim();
            const cityCode = ($scope.collect.cityCode || CITY_CODE || 25).toString();
            if (!kw) return $q.resolve([]);

            // ✅ DB 검색
            return fetchStopsFromDb(cityCode, kw, null, 200).then(function (rows) {
                // 후보는 너무 많으면 UI 부담이니 30개로 제한
                return (rows || []).slice(0, 30);
            });
        }

        $scope.searchCollectFrom = function () {
            const kw = String(($scope.collect && $scope.collect.fromKeyword) || '').trim();

            setCollectStatus('loading', kw ? '출발 정류장 검색중...' : '출발 정류장 전체 불러오는 중...');

            fetchStopsFromDb(CITY_CODE, kw || '', null, kw ? 500 : 5000)
                .then(function (list) {
                    $scope.collect = $scope.collect || {};
                    $scope.collect.fromCandidates = list || [];
                    setCollectStatus('ok', (kw ? '검색 완료' : '전체 로드 완료') + ' (' + ($scope.collect.fromCandidates.length || 0) + ')');
                })
                .catch(function () {
                    $scope.collect = $scope.collect || {};
                    $scope.collect.fromCandidates = [];
                    setCollectStatus('error', '출발 정류장 조회 실패');
                });
        };

        $scope.searchCollectTo = function () {
            const kw = String(($scope.collect && $scope.collect.toKeyword) || '').trim();

            setCollectStatus('loading', kw ? '도착 정류장 검색중...' : '도착 정류장 전체 불러오는 중...');

            fetchStopsFromDb(CITY_CODE, kw || '', null, kw ? 500 : 5000)
                .then(function (list) {
                    $scope.collect = $scope.collect || {};
                    // ✅ 더 이상 reachableSet 필터링 하지 않음
                    $scope.collect.toCandidates = list || [];
                    setCollectStatus('ok', (kw ? '검색 완료' : '전체 로드 완료') + ' (' + ($scope.collect.toCandidates.length || 0) + ')');
                })
                .catch(function () {
                    $scope.collect = $scope.collect || {};
                    $scope.collect.toCandidates = [];
                    setCollectStatus('error', '도착 정류장 조회 실패');
                });
        };

        // ✅ NEW: 선택한 노선(routeId)의 정류장 목록을 “도착 후보”에 채우기 (그대로 유지)
        $scope.searchCollectToBySelectedRoute = function () {
            const cityCode = ($scope.collect.cityCode || CITY_CODE || 25).toString();

            const rid = String($scope.collect.routeId || '').trim() || String(($scope.collect.selectedRoute && ($scope.collect.selectedRoute.routeid || $scope.collect.selectedRoute.routeId || $scope.collect.selectedRoute.busRouteId)) || '').trim();

            if (!rid) {
                setCollectStatus('error', '먼저 노선을 선택하세요. (예: 107 클릭)');
                return;
            }

            setCollectStatus('ok', `노선(${rid}) 정류장 목록 불러오는 중...`);

            return $http
                .get('/api/bus/routePath', {
                    params: { cityCode: cityCode, routeId: rid, pageNo: 1, numOfRows: 2000 },
                })
                .then(function (res) {
                    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                    const body = ((data || {}).response || {}).body || {};
                    let list = (body.items && body.items.item) || body.item || body.itemList || body.items || [];
                    if (!Array.isArray(list)) list = list ? [list] : [];

                    console.log('[routePath] routeId=', rid, 'rawListLen=', list.length, 'body=', body);

                    const seen = new Set();
                    const stops = [];

                    list.forEach(function (p) {
                        if (!p) return;

                        const nodeId = String(p.nodeid || p.nodeId || p.nodeno || p.nodeNo || p.node_id || p.stopId || p.stop_id || p.stationId || '').trim();

                        const name = String(p.nodenm || p.nodeNm || p.node_name || p.name || p.stationNm || p.stationName || '').trim();

                        const lat = parseFloat(p.gpslati || p.gpsLat || p.lat || p.latitude || p.y || p.posY || '');
                        const lon = parseFloat(p.gpslong || p.gpsLong || p.lon || p.lng || p.longitude || p.x || p.posX || '');

                        if (!nodeId) return;

                        const safeName = name || '정류장 ' + nodeId;

                        if (seen.has(nodeId)) return;
                        seen.add(nodeId);

                        stops.push({
                            nodeid: nodeId,
                            nodenm: safeName,
                            gpslati: isFinite(lat) ? lat : null,
                            gpslong: isFinite(lon) ? lon : null,
                            _raw: p,
                        });
                    });

                    const fromId = String($scope.collect.fromStopId || '').trim();
                    const finalStops = fromId ? stops.filter((s) => String(s.nodeid) !== fromId) : stops;

                    finalStops.sort(function (a, b) {
                        return String(a.nodenm || '').localeCompare(String(b.nodenm || ''), 'ko');
                    });

                    $scope.collect.toCandidates = finalStops;

                    if (!finalStops.length) {
                        setCollectStatus('error', '이 노선에서 정류장 목록을 만들 수 없습니다. (routePath 응답 구조/필드명 확인 필요) — 콘솔의 [routePath] 로그를 확인하세요.');
                        return;
                    }

                    setCollectStatus('ok', `도착 후보에 노선 정류장 ${finalStops.length}개를 채웠습니다. 목록에서 도착을 클릭하세요.`);
                })
                .catch(function (err) {
                    console.error('[BusController] searchCollectToBySelectedRoute fail:', err);
                    $scope.collect.toCandidates = [];
                    setCollectStatus('error', '노선 정류장 목록을 불러오지 못했습니다.');
                });
        };

        // ✅ 공통: arrival 응답에서 header + item list 안전하게 뽑기
        function parseArrivalItems(res) {
            let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

            const response = (data || {}).response || {};
            const header = response.header || {};
            const body = response.body || {};

            const code = String(header.resultCode || '');
            const msg = String(header.resultMsg || '');

            let list = (body.items && body.items.item) || body.item || body.itemList || (body.items && Array.isArray(body.items) ? body.items : null) || [];
            if (!Array.isArray(list)) list = list ? [list] : [];

            return { code, msg, body, list };
        }

        function pickRouteId(x) {
            return String(x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid || '').trim();
        }
        function pickRouteNo(x) {
            return String(x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '').trim();
        }

        // ---------------------------------------------------------
        // ✅ 출발 후보 클릭 → 출발 확정
        $scope.selectCollectFrom = function (stopRaw) {
            const s = normalizeStop(stopRaw);
            if (!s || !s.stopId) {
                setCollectStatus('error', '선택한 출발 정류장의 ID를 읽을 수 없습니다.');
                return;
            }

            const stopName = String(s.name || s.nodenm || s.nodeNm || '').trim();

            $scope.collect = $scope.collect || {};

            $scope.collect.from = s;
            $scope.collect.fromStopId = s.stopId;

            // ✅🔥 여기 추가 (DB 저장용 이름)
            $scope.collect.fromStopName = stopName;

            $scope.collectFromSelected = {
                id: s.stopId,
                name: stopName,
                nodenm: stopName,
                nodeNm: stopName,
                raw: stopRaw,
            };
        };

        // ✅ 도착 후보 클릭 → 도착 확정
        $scope.selectCollectTo = function (stopRaw) {
            const s = normalizeStop(stopRaw);
            if (!s || !s.stopId) {
                setCollectStatus('error', '선택한 도착 정류장의 ID를 읽을 수 없습니다.');
                return;
            }

            const stopName = String(s.name || s.nodenm || s.nodeNm || '').trim();

            $scope.collect = $scope.collect || {};

            $scope.collect.to = s;
            $scope.collect.toStopId = s.stopId;

            // ✅🔥 여기 추가 (DB 저장용 이름)
            $scope.collect.toStopName = stopName;

            $scope.collectToSelected = {
                id: s.stopId,
                name: stopName,
                nodenm: stopName,
                nodeNm: stopName,
                raw: stopRaw,
            };
        };
        // ---------------------------------------------------------
        // ❌ 노선 수동 선택 기능은 더 이상 사용하지 않으므로 유지하되 비활성
        $scope.selectCollectRoute = function () {
            setCollectStatus('error', '노선 수동 선택은 사용하지 않습니다. 출발/도착 기준으로 자동 계산됩니다.');
        };

        // ---------------------------------------------------------
        // ✅ arrival API (출발 기준 routeId 확보용)
        // - "app.js에서 함수 없음" 문제 방지: $scope에 붙여서 어디서든 접근 가능하게
        // ---------------------------------------------------------
        $scope.fetchArrivalForStop = function (cityCode, stopId) {
            return $http
                .get('/api/bus/arrival', {
                    params: {
                        cityCode: cityCode,
                        nodeId: stopId,
                        numOfRows: 50,
                        pageNo: 1,
                    },
                })
                .then(function (res) {
                    let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                    let body = ((data || {}).response || {}).body || {};
                    let list = (body.items && body.items.item) || [];
                    if (!Array.isArray(list)) list = list ? [list] : [];
                    return list;
                });
        };

        // ✅ 전역/루트스코프 노출 (핵심)
        $rootScope.fetchArrivalForStop = $scope.fetchArrivalForStop;
        window.fetchArrivalForStop = $scope.fetchArrivalForStop;

        /* =========================================================
   ✅ 여기(수집 로직 시작하기 전)에 추가하세요: ETA 뽑기 유틸
   ========================================================= */

        function pickInt(obj, keys) {
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                var v = obj && obj[k];
                if (v === null || v === undefined) continue;
                var n = parseInt(String(v).trim(), 10);
                if (isFinite(n)) return n;
            }
            return null;
        }

        function getBestEtaSec(arrList) {
            if (!Array.isArray(arrList) || !arrList.length) return null;

            var best = null;
            for (var i = 0; i < arrList.length; i++) {
                var x = arrList[i];
                var sec = pickInt(x, ['arrtime', 'arrTime', 'remaintime', 'remainTime', 'arrsec', 'arrSec', 'arrivalSec', 'arrmsgSec']);
                if (!sec || sec <= 0) continue;
                if (best === null || sec < best) best = sec;
            }
            return best;
        }

        function secToMmSs(sec) {
            sec = Number(sec);
            if (!isFinite(sec) || sec <= 0) return '-';
            var m = Math.floor(sec / 60);
            var s = sec % 60;
            return m + '분 ' + s + '초';
        }

        // ================== 수집(폴링) ==================
        let collectTimer = null;
        let collectToken = 0;

        $scope.collecting = false; // UI: 수집 ON/OFF
        $scope.collectPaused = false; // UI: 일시중지 상태
        $scope.collectAutoBoot = true; // "페이지 진입하면 자동 시작" 정책
        $scope.collectSaveToDb = true; // 기본: DB 저장 ON (원하면 UI 토글로 바꿔도 됨)

        // UI 표시용 (너 HTML에 이미 쓰는 것들)
        $scope.collectStatusText = '';
        $scope.collectBatchInfo = '';
        $scope.collectCycleInfo = '';
        $scope.collectSavedCount = 0;
        $scope.collectLastAt = null;

        // ---------------------------------------------------------
        // ✅ 상태메시지 유틸 (setCollectStatus가 없으면 fallback)
        function setCollectStatusSafe(type, msg) {
            try {
                if (typeof setCollectStatus === 'function') {
                    setCollectStatus(type, msg);
                    return;
                }
            } catch (e) {}
            // fallback
            $scope.collectStatusText = msg || '';
        }

        // ---------------------------------------------------------
        // ✅ 수집 시작 가능 조건
        $scope.canStartCollect = function () {
            try {
                const c = $scope.collect || {};

                const fromOk = !!((c.from && c.from.stopId) || String(c.fromStopId || '').trim());
                const toOk = !!((c.to && c.to.stopId) || String(c.toStopId || '').trim());

                const period = parseInt(c.periodSec, 10);
                const periodOk = isFinite(period) && period >= 5;

                // ✅ 출발/도착 + 주기만 있으면 OK
                return fromOk && toOk && periodOk;
            } catch (e) {
                return false;
            }
        };

        // ---------------------------------------------------------
        // ✅ 내부: 타이머 정리
        function cancelCollectTimer() {
            if (collectTimer) {
                try {
                    $interval.cancel(collectTimer);
                } catch (e) {}
                collectTimer = null;
            }
        }

        // ---------------------------------------------------------
        // ✅ 수집 1tick 실행(공통)
        // - saveToDb: true면 DB 저장까지(collectOnce 내부에서 처리)
        // - token: 중지/재개 간 레이스 방지
        function runCollectTick(saveToDb, myToken, reason) {
            if (myToken !== collectToken) return;
            if (!$scope.collecting) return;
            if ($scope.collectPaused) return;

            // 수집 조건 불충족이면 자동 중단(“대기” 상태로)
            if (!$scope.canStartCollect()) {
                $scope.collecting = false;
                cancelCollectTimer();
                setCollectStatusSafe('info', '출발/도착/주기 조건이 부족해서 수집 대기중');
                $scope.collectCycleInfo = '대기중';
                return;
            }

            const c = $scope.collect || {};
            const sec = Number(c.periodSec || 10);

            $scope.collectCycleInfo = `주기: ${sec}s`;
            $scope.collectLastAt = new Date();

            // ✅ 여기서 진짜 수집/저장 실행
            // collectOnce 내부에서:
            // - arrival 호출
            // - 계산
            // - saveToDb면 서버 저장 API 호출(INSERT) 까지 해야 DB가 쌓임
            try {
                const ret = $scope.collectOnce && $scope.collectOnce(!!saveToDb, myToken);

                // collectOnce가 Promise면 UI 갱신
                if (ret && typeof ret.then === 'function') {
                    ret.then(function (r) {
                        if (myToken !== collectToken) return;
                        // ✅ r에 결과를 넣는다면 여기서 누적카운트 올리기 가능
                        // 예: r.saved === true, r.savedCount 등
                        if (r && r.saved) $scope.collectSavedCount += 1;
                        $scope.collectBatchInfo = r && r.msg ? r.msg : '수집 완료';
                    }).catch(function (e) {
                        if (myToken !== collectToken) return;
                        $scope.collectBatchInfo = '수집 실패';
                        console.warn('[collect] collectOnce error:', e);
                    });
                }
            } catch (e) {
                console.warn('[collect] collectOnce throw:', e);
            }
        }

        // ---------------------------------------------------------
        // ✅ 자동 시작(버튼 없이)
        // - 조건 충족이면 즉시 시작
        // - 조건 미충족이면 "대기" 상태로 있다가, 조건 충족 순간 자동 시작
        function ensureCollectAutoBoot() {
            if (!$scope.collectAutoBoot) return;

            // 이미 돌고 있으면 스킵
            if ($scope.collecting && collectTimer) return;

            if ($scope.canStartCollect()) {
                // 조건 충족 -> 자동 시작
                $scope.startCollect(); // 아래 startCollect는 saveToDb 기본 true
            } else {
                // 조건 미충족 -> 대기 메시지
                setCollectStatusSafe('info', '출발/도착 선택 시 자동으로 수집이 시작됩니다.');
                $scope.collectCycleInfo = '대기중';
            }
        }

        // ---------------------------------------------------------
        // ✅ 수집 시작 (UI 버튼 없어도 코드로 호출됨)
        $scope.startCollect = function () {
            const sec = Number($scope.collect && $scope.collect.periodSec);
            if (!sec || sec < 5) {
                setCollectStatusSafe('error', '주기(초)는 5 이상이어야 해요.');
                return;
            }

            if (!$scope.canStartCollect()) {
                setCollectStatusSafe('info', '출발/도착/주기 조건이 부족해서 수집 대기중');
                return;
            }

            cancelCollectTimer();

            $scope.collecting = true;
            $scope.collectPaused = false;

            collectToken++;
            const myToken = collectToken;

            setCollectStatusSafe('ok', $scope.collectSaveToDb ? '자동 수집 시작 (DB 저장 ON)' : '자동 수집 시작 (저장 OFF)');

            // 즉시 1번 실행
            runCollectTick($scope.collectSaveToDb, myToken, 'start');

            // 주기 실행
            collectTimer = $interval(function () {
                runCollectTick($scope.collectSaveToDb, myToken, 'interval');
            }, sec * 1000);
        };

        // ---------------------------------------------------------
        // ✅ 수집 중지 (UI: 중지 버튼)
        $scope.stopCollect = function () {
            cancelCollectTimer();
            collectToken++; // 진행중 Promise/루프 무효화

            $scope.collecting = false;
            $scope.collectPaused = false;

            setCollectStatusSafe('ok', '수집 중지됨');
            $scope.collectBatchInfo = '';
            $scope.collectCycleInfo = '중지';
        };

        // ---------------------------------------------------------
        // ✅ 수집 일시중지/재개 (UI: 재개/중지 버튼만 남길 때 핵심)
        $scope.pauseCollect = function () {
            if (!$scope.collecting) {
                setCollectStatusSafe('info', '수집이 시작되지 않았어요.');
                return;
            }
            $scope.collectPaused = true;
            setCollectStatusSafe('ok', '일시중지됨');
        };

        $scope.resumeCollect = function () {
            if (!$scope.collecting) {
                // 자동 정책: resume 누르면 start로 동작하게
                ensureCollectAutoBoot();
                return;
            }
            $scope.collectPaused = false;
            setCollectStatusSafe('ok', '재개됨');
        };

        // ---------------------------------------------------------
        // ✅ 디버그용: 1회 실행
        $scope.testCollectOnce = function () {
            collectToken++;
            const myToken = collectToken;
            $scope.collecting = true;
            $scope.collectPaused = false;
            runCollectTick(true, myToken, 'test');
        };

        // ---------------------------------------------------------
        // ✅ (옵션) 서버에 "JOB 등록" 방식(서버만 켜도 자동수집) — 프론트 수집과 별개
        //    이건 네가 만든 /api/buscollect/register가 진짜 서버 스케줄러를 등록할 때만 의미 있음.
        $scope.registerAutoCollect = function () {
            try {
                const c = $scope.collect || {};
                const cityCode = Number(c.cityCode || 25);
                const periodSec = Number(c.periodSec || 10);

                const fromStopId = String((c.from && c.from.stopId) || c.fromStopId || '').trim();
                const toStopId = String((c.to && c.to.stopId) || c.toStopId || '').trim();

                const fromStopName = String((c.from && (c.from.name || c.from.nodenm || c.from.nodeNm)) || c.fromStopName || '').trim();
                const toStopName = String((c.to && (c.to.name || c.to.nodenm || c.to.nodeNm)) || c.toStopName || '').trim();

                const mode = String(c.mode || 'BUS').trim();

                if (!fromStopId || !toStopId) {
                    setCollectStatusSafe('error', '출발/도착 정류장을 먼저 선택하세요.');
                    return;
                }

                const body = { cityCode, fromStopId, toStopId, fromStopName, toStopName, mode, periodSec };

                $scope.collectStatusText = 'JOB 등록 중...';
                $http.post('/api/buscollect/register', body).then(
                    function () {
                        $scope.collectStatusText = '✅ 자동수집 JOB 등록 완료 (서버가 켜져있는 동안 자동 저장됨)';
                        $scope.loadJobs && $scope.loadJobs();
                    },
                    function (err) {
                        $scope.collectStatusText = '❌ JOB 등록 실패: ' + ((err.data && err.data.message) || err.statusText);
                    }
                );
            } catch (e) {
                $scope.collectStatusText = '❌ 예외: ' + e.message;
            }
        };

        $scope.disableAutoCollect = function () {
            const c = $scope.collect || {};
            const cityCode = Number(c.cityCode || 25);

            const fromStopId = String((c.from && c.from.stopId) || c.fromStopId || '').trim();
            const toStopId = String((c.to && c.to.stopId) || c.toStopId || '').trim();
            const mode = String(c.mode || 'BUS').trim();

            if (!fromStopId || !toStopId) {
                setCollectStatusSafe('error', '출발/도착 정류장을 먼저 선택하세요.');
                return;
            }

            $scope.collectStatusText = 'JOB 해제 중...';
            $http.post('/api/buscollect/disable', { cityCode, fromStopId, toStopId, mode }).then(
                function () {
                    $scope.collectStatusText = '✅ 자동수집 JOB 해제 완료';
                    $scope.loadJobs && $scope.loadJobs();
                },
                function (err) {
                    $scope.collectStatusText = '❌ JOB 해제 실패: ' + ((err.data && err.data.message) || err.statusText);
                }
            );
        };

        $scope.loadJobs = function () {
            $http.get('/api/buscollect/jobs?enabled=1').then(function (res) {
                $scope.jobs = res.data && res.data.items ? res.data.items : [];
            });
        };

        // ---------------------------------------------------------
        // ✅ 페이지 진입 시 자동 부팅 + 출발/도착 선택 순간 자동 시작
        //  - start 버튼 없이도 동작하게 만드는 핵심
        (function initAutoCollectBoot() {
            // 1) 최초 1번 시도
            $timeout(function () {
                ensureCollectAutoBoot();
            }, 0);

            // 2) 출발/도착/주기 변경 감지 → 조건 만족 순간 자동 시작
            $scope.$watchGroup(['collect.fromStopId', 'collect.toStopId', 'collect.from.stopId', 'collect.to.stopId', 'collect.periodSec'], function () {
                // 이미 돌고 있으면 굳이 다시 시작하지 않음
                if ($scope.collecting && collectTimer) return;
                ensureCollectAutoBoot();
            });

            // 3) 컨트롤러 파괴 시 타이머 정리
            $scope.$on('$destroy', function () {
                cancelCollectTimer();
                collectToken++;
            });
        })();

        // ---------------------------------------------------------
        // ✅ arrival API (출발/도착 기준)
        function fetchArrivalForStop(cityCode, stopId) {
            return $http
                .get('/api/bus/arrival', {
                    params: {
                        cityCode: cityCode,
                        nodeId: stopId,
                        numOfRows: 50,
                        pageNo: 1,
                    },
                })
                .then(function (res) {
                    let data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
                    let body = ((data || {}).response || {}).body || {};
                    let list = (body.items && body.items.item) || [];
                    if (!Array.isArray(list)) list = list ? [list] : [];
                    return list;
                });
        }

        function pickRouteId(x) {
            return String(x && (x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid || '')).trim();
        }
        function pickRouteNo(x) {
            return String(x && (x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '')).trim();
        }
        function pickArrSec(x) {
            const sec = Number(x && (x.arrtime || x.arrTime || x.arrivalSec || x.remaintime || x.remainTime || x.traTime));
            if (!isFinite(sec) || sec < 0) return null;
            return Math.floor(sec);
        }

        // ✅ “해당 정류장”에서 가장 빨리 오는 1개(=API 기반)
        function pickBestArrivalItem(list) {
            let best = null;
            (list || []).forEach(function (x) {
                const rid = pickRouteId(x);
                const rno = pickRouteNo(x);
                const sec = pickArrSec(x);
                if (!rid || !rno) return;
                if (sec == null) return;

                if (!best || sec < best.sec) {
                    best = { routeId: rid, routeNo: rno, sec: sec, raw: x };
                }
            });
            return best;
        }

        // ✅ 공통 노선으로 “이동 소요시간 의미” 유지 가능한 케이스만 선택 (API 기반)
        function pickBestCommonRoute(fromList, toList) {
            const fromMap = new Map(); // routeId -> (가장 빠른 출발 도착 1개)
            (fromList || []).forEach(function (x) {
                const rid = pickRouteId(x);
                const sec = pickArrSec(x);
                if (!rid || sec == null) return;

                if (!fromMap.has(rid)) fromMap.set(rid, x);
                else {
                    const prev = fromMap.get(rid);
                    const prevSec = pickArrSec(prev);
                    if (prevSec == null || sec < prevSec) fromMap.set(rid, x);
                }
            });

            let best = null;

            (toList || []).forEach(function (y) {
                const rid = pickRouteId(y);
                if (!rid) return;
                if (!fromMap.has(rid)) return;

                const x = fromMap.get(rid);

                const fromSec = pickArrSec(x);
                const toSec = pickArrSec(y);
                if (fromSec == null || toSec == null) return;

                const diffSec = toSec - fromSec;
                if (diffSec <= 0 || diffSec > 7200) return;

                const routeNo = pickRouteNo(x) || pickRouteNo(y);
                if (!routeNo) return;

                const cand = {
                    routeId: rid,
                    routeNo: routeNo,
                    fromSec: fromSec,
                    toSec: toSec,
                    diffSec: diffSec,
                    mode: 'API_COMMON_ROUTE',
                };

                if (!best || cand.diffSec < best.diffSec) best = cand;
            });

            return best;
        }

        // ---------------------------------------------------------
        // ✅ 수집 1회 실행 (API ONLY + (선택) DB 저장)
        // ---------------------------------------------------------
        $scope.collectOnce = function (saveToDb, tokenFromCaller) {
            // ✅ boolean normalize (기본 true)
            saveToDb = saveToDb !== false;

            const myToken = tokenFromCaller == null ? collectToken : tokenFromCaller;

            // ✅ 수집 중지/토큰 변경이면 중단 (저장 모드일 때만 강하게 중단)
            if (saveToDb && (!$scope.collecting || myToken !== collectToken)) {
                return $q.resolve(null);
            }

            $scope.collect = $scope.collect || {};
            if ($scope.collect._saving == null) $scope.collect._saving = false;

            const cityCode = String($scope.collect.cityCode || CITY_CODE || 25);

            const fromStopId = String(($scope.collect.from && $scope.collect.from.stopId) || $scope.collect.fromStopId || '').trim();
            const toStopId = String(($scope.collect.to && $scope.collect.to.stopId) || $scope.collect.toStopId || '').trim();

            if (!fromStopId) {
                setCollectStatusSafe ? setCollectStatusSafe('error', '출발 정류장을 선택해야 해요.') : setCollectStatus('error', '출발 정류장을 선택해야 해요.');
                return $q.resolve(null);
            }
            if (!toStopId) {
                setCollectStatusSafe ? setCollectStatusSafe('error', '도착 정류장을 선택해야 해요.') : setCollectStatus('error', '도착 정류장을 선택해야 해요.');
                return $q.resolve(null);
            }

            // ---------------------------
            // ✅ 실행 시작 (API ONLY)
            // ---------------------------
            try {
                setCollectStatus('ok', saveToDb ? '수집 + DB 저장 중...(API ONLY)' : '수집 중...(저장 안 함)');
            } catch (e) {
                if (typeof setCollectStatusSafe === 'function') setCollectStatusSafe('ok', saveToDb ? '수집 + DB 저장 중...(API ONLY)' : '수집 중...(저장 안 함)');
            }

            const pFrom = $scope.fetchArrivalForStop(cityCode, fromStopId);
            const pTo = $scope.fetchArrivalForStop(cityCode, toStopId);

            return $q
                .all([pFrom, pTo])
                .then(function (arr) {
                    if (saveToDb && (myToken !== collectToken || !$scope.collecting)) {
                        console.warn('[collectOnce] canceled by stopCollect (before compute)');
                        return null;
                    }

                    const fromList = arr[0] || [];
                    const toList = arr[1] || [];

                    // ---------------------------------------------------------
                    // ✅ [추가] 출발/도착 ETA(가장 빠른 도착 초) + "분/초" 텍스트 세팅
                    // ---------------------------------------------------------
                    const fromEtaSec = getBestEtaSec(fromList);
                    const toEtaSec = getBestEtaSec(toList);

                    $scope.collectFromEtaSec = fromEtaSec;
                    $scope.collectToEtaSec = toEtaSec;

                    $scope.collectFromEtaText = secToMmSs(fromEtaSec);
                    $scope.collectToEtaText = secToMmSs(toEtaSec);

                    // ✅🔥 출발/도착 이름 fallback 보강
                    const fromName =
                        ($scope.collectFromSelected && ($scope.collectFromSelected.name || $scope.collectFromSelected.nodenm || $scope.collectFromSelected.nodeNm)) ||
                        ($scope.collect.from && ($scope.collect.from.name || $scope.collect.from.nodenm || $scope.collect.from.nodeNm)) ||
                        $scope.collect.fromStopName ||
                        '';

                    const toName =
                        ($scope.collectToSelected && ($scope.collectToSelected.name || $scope.collectToSelected.nodenm || $scope.collectToSelected.nodeNm)) ||
                        ($scope.collect.to && ($scope.collect.to.name || $scope.collect.to.nodenm || $scope.collect.to.nodeNm)) ||
                        $scope.collect.toStopName ||
                        '';

                    // ✅ 1) 공통 노선(= 이동 의미 유지 가능) → API 값만 저장
                    const bestCommon = pickBestCommonRoute(fromList, toList);
                    if (bestCommon) {
                        return saveApiOnlyResult(saveToDb, myToken, {
                            cityCode,
                            routeId: bestCommon.routeId,
                            routeNo: bestCommon.routeNo,

                            fromStopId,
                            toStopId,
                            fromStopName: fromName,
                            toStopName: toName,

                            fromArrSec: bestCommon.fromSec,
                            toArrSec: bestCommon.toSec,
                            diffSec: bestCommon.diffSec,

                            mode: bestCommon.mode || 'API_COMMON_ROUTE',
                            note: '공통노선(API) 기준',
                        });
                    }

                    // ✅ 2) 공통 노선이 없어도 저장: 각 정류장 최단 도착 1개씩 (API ONLY)
                    const bestFrom = pickBestArrivalItem(fromList);
                    const bestTo = pickBestArrivalItem(toList);

                    if (!bestFrom || !bestTo) {
                        setCollectStatus('error', 'API 도착정보에서 routeId/routeNo/arrtime을 충분히 얻지 못해 저장할 수 없습니다.');
                        return null;
                    }

                    const fromArrSec = bestFrom.sec;
                    const toArrSec = bestTo.sec;
                    const diffSec = Math.max(0, (toArrSec || 0) - (fromArrSec || 0));

                    setCollectStatus('ok', '⚠ 공통노선이 없어 “각 정류장 도착시간(API)”으로 저장합니다. (이동시간 추정 없음)');

                    return saveApiOnlyResult(saveToDb, myToken, {
                        cityCode,

                        // ✅ 출발 정류장 기준(bestFrom) — 추정 금지
                        routeId: bestFrom.routeId,
                        routeNo: bestFrom.routeNo,

                        fromStopId,
                        toStopId,
                        fromStopName: fromName,
                        toStopName: toName,

                        fromArrSec,
                        toArrSec,
                        diffSec,

                        mode: 'API_NO_COMMON_SAVE_BOTH_STOPS',

                        // 확장용(백엔드가 무시해도 OK)
                        toRouteId: bestTo.routeId,
                        toRouteNo: bestTo.routeNo,
                        note: '공통노선 없음 → 각 정류장 최단도착(API) 저장',
                    });
                })
                .catch(function (err) {
                    console.error('[collectOnce] arrival fetch error:', err);
                    try {
                        setCollectStatus('error', '도착정보 API 호출 실패');
                    } catch (e) {}
                    return null;
                });
        };

        // ---------------------------------------------------------
        // ✅ API ONLY 결과 저장(또는 저장 안함)
        // - saveToDb=false면 "결과 UI만 갱신"하고 끝
        // - saveToDb=true면 서버 저장 API POST 시도 → 성공하면 DB에 쌓임
        // ---------------------------------------------------------
        function saveApiOnlyResult(saveToDb, myToken, payload) {
            payload = payload || {};

            // 토큰 체크 (저장모드일 때만 엄격)
            if (saveToDb && (myToken !== collectToken || !$scope.collecting)) {
                console.warn('[saveApiOnlyResult] canceled');
                return $q.resolve(null);
            }

            // ✅ UI에 최신 결과 보이게(원하면 네 UI 변수에 맞춰 조정)
            $scope.lastCollect = payload;
            $scope.collectLastAt = new Date();
            $scope.collectBatchInfo = (payload.mode || 'API') + ' 저장 준비';

            // 저장 안 하면 여기서 종료
            if (!saveToDb) {
                $scope.collectBatchInfo = (payload.mode || 'API') + ' (저장 안 함)';
                return $q.resolve({ saved: false, msg: 'not saved' });
            }

            // ✅ 중복 저장 방지 플래그
            if ($scope.collect && $scope.collect._saving) {
                console.warn('[saveApiOnlyResult] already saving - skip');
                return $q.resolve(null);
            }
            $scope.collect._saving = true;

            // ---------------------------------------------------------
            // ✅ 여기서 "DB 저장"을 실제로 하는 POST가 필요함
            // 서버에 뭐가 있는지 확실치 않아서 후보를 여러 개 시도
            // ✅ 성공하는 엔드포인트가 있으면 그걸로 DB에 쌓임
            // ---------------------------------------------------------
            const SAVE_ENDPOINTS = [
                '/api/buscollect/save',
                '/api/buscollect/collect',
                '/api/buscollect/append',
                '/api/busCollect/save', // 혹시 카멜케이스
                '/api/bus_collect/save', // 혹시 스네이크
            ];

            function tryPostAt(i) {
                if (i >= SAVE_ENDPOINTS.length) {
                    $scope.collect._saving = false;
                    setCollectStatus('error', 'DB 저장 API를 찾지 못했습니다. (저장 엔드포인트 없음)');
                    console.error('[saveApiOnlyResult] No working endpoint. Tried:', SAVE_ENDPOINTS);
                    return $q.reject(new Error('No working save endpoint'));
                }

                const url = SAVE_ENDPOINTS[i];
                return $http.post(url, payload).then(
                    function (res) {
                        // ✅ 성공
                        console.log('[saveApiOnlyResult] saved via', url, res && res.data);

                        $scope.collectSavedCount = Number($scope.collectSavedCount || 0) + 1;
                        $scope.collectBatchInfo = '✅ DB 저장 성공 (' + url + ')';
                        setCollectStatus('ok', '✅ DB 저장 성공');

                        $scope.collect._saving = false;
                        return { saved: true, url: url, data: res && res.data };
                    },
                    function (err) {
                        // 실패면 다음 후보로
                        console.warn('[saveApiOnlyResult] save failed at', url, err && (err.status || err));
                        return tryPostAt(i + 1);
                    }
                );
            }

            return tryPostAt(0).catch(function (e) {
                // 최종 실패
                $scope.collect._saving = false;
                $scope.collectBatchInfo = '❌ DB 저장 실패';
                try {
                    setCollectStatus('error', 'DB 저장 실패');
                } catch (err) {}
                return null;
            });
        }

        // =========================================================
        // ✅ 최단경로(데모) - 출발/도착 후보 검색 (DB 기반으로 변경)
        // =========================================================
        // ✅ 최단경로(데모) - 출발/도착 후보 검색 (DB 기반)
        //  - BUS 모드에서 입력이 비어있으면 "버스 정류장 전체"를 후보로 띄움
        // =========================================================
        function searchStopsDbForPath(keyword, mode) {
            const kw = (keyword || '').trim();

            // ✅ TRAM 전체 목록 생성(너가 쓰던 로직을 함수로 분리)
            function buildAllTramStops() {
                // ✅ TRAM_STATIONS 우선 (이미 station 전용)
                const all = Array.isArray(window.TRAM_STATIONS) && window.TRAM_STATIONS.length ? window.TRAM_STATIONS : (window.TRAM_ROUTE_FULL_HD || []).filter((p) => p && p.type === 'station');

                const list = all
                    .map(function (p) {
                        return {
                            // ✅✅ 핵심: prefix 제거 → TRAM_STOPS(stopId:"242")와 동일 ID
                            nodeid: String(p.stopId || p.id),

                            nodenm: String(p.name || '트램 정류장'),
                            gpslati: Number(p.lat),

                            // ✅ lon/lng 혼용 방어
                            gpslong: Number(p.lon ?? p.lng),

                            type: 'TRAM',
                            _tram: p,
                        };
                    })
                    .map(normalizeStop)
                    .filter(function (x) {
                        return x && x.stopId && x.name;
                    })
                    .sort(function (a, b) {
                        const ai = parseInt(String(a.stopId).replace(/[^\d]/g, ''), 10);
                        const bi = parseInt(String(b.stopId).replace(/[^\d]/g, ''), 10);
                        return (ai || 0) - (bi || 0);
                    });

                return list;
            }

            // ✅ [TRAM] 입력이 비어있으면 → 트램 전체 반환
            if (mode === 'TRAM' && !kw) {
                return $q.resolve(buildAllTramStops());
            }

            // ✅ [MIXED] 입력이 비어있으면 → BUS 전체 + TRAM 전체 같이 반환
            if (mode === 'MIXED' && !kw) {
                const limitBus = 20000;

                const pBus = fetchStopsFromDb(CITY_CODE, '', 'BUS', limitBus).then(function (rows) {
                    return (rows || []).map(normalizeStop).filter(function (x) {
                        return x && x.stopId && x.name;
                    });
                });

                const pTram = $q.resolve(buildAllTramStops());

                return $q.all([pBus, pTram]).then(function (arr) {
                    const busList = arr[0] || [];
                    const tramList = arr[1] || [];

                    // ✅ 합쳐서 반환
                    return busList.concat(tramList);
                });
            }

            // ✅ mode에 따른 DB type 필터 (MIXED는 일단 BUS만 DB에서 가져오고, TRAM은 별도로 합침)
            let type = null;
            if (mode === 'BUS') type = 'BUS';
            else if (mode === 'TRAM') type = 'TRAM';
            else type = null; // MIXED 등

            // ✅ BUS 전체조회(kw 없음)는 크게
            const limit = kw ? 50 : 20000;

            // ✅ DB 조회 (BUS/TRAM/전체)
            const pDb = fetchStopsFromDb(CITY_CODE, kw, type, limit).then(function (rows) {
                const list = (rows || []).map(normalizeStop).filter(function (x) {
                    return x && x.stopId && x.name;
                });

                // ✅ 검색어 없으면 전체 반환
                if (!kw) return list;

                // ✅ 검색어 있을 때만 제한
                return list.slice(0, 10);
            });

            // ✅ MIXED + 검색어 있는 경우: TRAM도 검색어로 필터해서 같이 보여주기
            // (BUS 모드/ TRAM 모드일 땐 굳이 합치지 않음)
            const pTramFiltered =
                mode === 'MIXED' && kw
                    ? $q.resolve(buildAllTramStops()).then(function (list) {
                          const lower = kw.toLowerCase();
                          const filtered = list.filter(function (s) {
                              const name = String(s.name || s.nodenm || '').toLowerCase();
                              const id = String(s.stopId || '').toLowerCase();
                              return name.includes(lower) || id.includes(lower);
                          });

                          // ✅ TRAM도 결과 너무 많으면 제한(원하면 10->20 등 조절)
                          return filtered.slice(0, 10);
                      })
                    : $q.resolve([]);

            // ✅ 최종 합치기
            return $q.all([pDb, pTramFiltered]).then(function (arr) {
                const dbList = arr[0] || [];
                const tramList = arr[1] || [];

                // MIXED일 때만 합쳐서 반환
                if (mode === 'MIXED') return dbList.concat(tramList);

                // 그 외에는 DB 결과만
                return dbList;
            });
        }

        // ✅ (추가) type 정규화 + 트램 판별 헬퍼
        function normType(v) {
            return String(v || '')
                .trim()
                .toUpperCase();
        }

        function isTramRow(s) {
            const t = normType(s && s.type);
            if (t === 'TRAM') return true;
            if (t === 'T') return true;
            if (t.indexOf('TRAM') !== -1) return true;
            if (t.indexOf('트램') !== -1) return true;
            return false;
        }

        // =========================================================
        // ✅ searchFrom / searchTo : searchStopsDbForPath() 사용
        // =========================================================
        $scope.searchFrom = function () {
            $scope.pathResult = null;

            const mode = ($scope.path && $scope.path.mode) || 'BUS';
            const kw = (($scope.path && $scope.path.fromKeyword) || '').trim();

            setPathStatus('info', kw ? '출발 정류장 검색 중...' : mode === 'TRAM' ? '출발 트램 정류장 목록 불러오는 중...' : '출발 정류장 전체 불러오는 중...');

            return searchStopsDbForPath(kw, mode)
                .then(function (list) {
                    list = list || [];

                    $scope.path.fromCandidates = list;

                    // ✅ 후보 다시 불러오면 기존 선택 초기화
                    $scope.path.from = null;
                    $scope.path.fromNodeId = null; // 버튼 disabled 조건이 이거라서 초기화는 OK

                    if (!list.length) {
                        setPathStatus('error', mode === 'TRAM' ? '출발 트램 후보가 없습니다. (tram-data.js 로드/데이터 확인)' : '출발 후보가 없습니다.');
                    } else {
                        if (mode === 'BUS') {
                            setPathStatus('', kw ? `출발 후보를 선택하세요. (${list.length}개)` : `출발 버스 정류장 후보를 선택하세요. (${list.length}개)`);
                        } else if (mode === 'TRAM') {
                            setPathStatus('', kw ? `출발 후보를 선택하세요. (${list.length}개)` : `출발 트램 정류장 후보를 선택하세요. (${list.length}개)`);
                        } else {
                            setPathStatus('', kw ? `출발 후보를 선택하세요. (${list.length}개)` : `출발 후보(전체)를 선택하세요. (${list.length}개)`);
                        }
                    }

                    return list;
                })
                .catch(function (err) {
                    console.error('[searchFrom] fail:', err);
                    $scope.path.fromCandidates = [];
                    $scope.path.from = null;
                    $scope.path.fromNodeId = null;
                    setPathStatus('error', '출발 정류장 검색 실패');
                    return [];
                });
        };

        $scope.searchTo = function () {
            $scope.pathResult = null;

            const mode = ($scope.path && $scope.path.mode) || 'BUS';
            const kw = (($scope.path && $scope.path.toKeyword) || '').trim();

            setPathStatus('info', kw ? '도착 정류장 검색 중...' : mode === 'TRAM' ? '도착 트램 정류장 목록 불러오는 중...' : '도착 정류장 전체 불러오는 중...');

            return searchStopsDbForPath(kw, mode)
                .then(function (list) {
                    list = list || [];

                    $scope.path.toCandidates = list;

                    // ✅ 후보 다시 불러오면 기존 선택 초기화
                    $scope.path.to = null;
                    $scope.path.toNodeId = null;

                    if (!list.length) {
                        setPathStatus('error', mode === 'TRAM' ? '도착 트램 후보가 없습니다. (tram-data.js 로드/데이터 확인)' : '도착 후보가 없습니다.');
                    } else {
                        if (mode === 'BUS') {
                            setPathStatus('', kw ? `도착 후보를 선택하세요. (${list.length}개)` : `도착 버스 정류장 후보를 선택하세요. (${list.length}개)`);
                        } else if (mode === 'TRAM') {
                            setPathStatus('', kw ? `도착 후보를 선택하세요. (${list.length}개)` : `도착 트램 정류장 후보를 선택하세요. (${list.length}개)`);
                        } else {
                            setPathStatus('', kw ? `도착 후보를 선택하세요. (${list.length}개)` : `도착 후보(전체)를 선택하세요. (${list.length}개)`);
                        }
                    }

                    return list;
                })
                .catch(function (err) {
                    console.error('[searchTo] fail:', err);
                    $scope.path.toCandidates = [];
                    $scope.path.to = null;
                    $scope.path.toNodeId = null;
                    setPathStatus('error', '도착 정류장 검색 실패');
                    return [];
                });
        };

        $scope.selectFrom = function (s) {
            if (!s) return;

            // ✅ raw(stop dto) 그대로 들어와도 normalize해서 통일
            var ns = s.stopId ? s : normalizeStop(s);
            if (!ns || !ns.stopId) {
                return setPathStatus('error', '출발 후보 데이터에 stopId(nodeid)가 없습니다.');
            }

            $scope.path.from = ns;

            // 🔥 버튼 활성화 조건 핵심
            $scope.path.fromNodeId = String(ns.stopId || '').trim();

            setPathStatus('', '출발 선택: ' + (ns.name || '-') + ' (' + $scope.path.fromNodeId + ')');
        };

        $scope.selectTo = function (s) {
            if (!s) return;

            var ns = s.stopId ? s : normalizeStop(s);
            if (!ns || !ns.stopId) {
                return setPathStatus('error', '도착 후보 데이터에 stopId(nodeid)가 없습니다.');
            }

            $scope.path.to = ns;

            $scope.path.toNodeId = String(ns.stopId || '').trim();

            setPathStatus('', '도착 선택: ' + (ns.name || '-') + ' (' + $scope.path.toNodeId + ')');
        };

        // =========================================================

        // =========================================================
        // ✅ 공통: 현재 지도 projection 기준으로 [lon,lat] -> map XY 변환
        //    (NGII/OpenLayers는 view projection이 3857이 아닐 수 있어서 필수)
        // =========================================================
        // ✅ 좌표 변환: EPSG:4326(lon/lat) -> 현재 지도 projection
        // =========================================================
        function lonLatToMapXY(lon, lat) {
            lon = Number(lon);
            lat = Number(lat);
            if (!isFinite(lon) || !isFinite(lat)) return null;

            const map = getInnerOlMap();
            if (!map || !window.ol || !ol.proj) return null;

            const view = map.getView && map.getView();
            const proj = (view && view.getProjection && view.getProjection()) || window.mapProjection || null;

            try {
                if (proj && ol.proj.transform) {
                    return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                }
            } catch (e) {}

            // fallback
            try {
                if (ol.proj.fromLonLat) return ol.proj.fromLonLat([lon, lat]);
            } catch (e) {}

            return [lon, lat];
        }

        // ✅ 좌표가 거의 같을 때 눈에 보이도록 살짝 밀기
        function offsetLonLat(lon, lat, meters) {
            lon = Number(lon);
            lat = Number(lat);
            if (!isFinite(lon) || !isFinite(lat)) return [lon, lat];

            const dLat = meters / 111000;
            const dLon = meters / (111000 * Math.cos((lat * Math.PI) / 180));

            return [lon + dLon, lat + dLat];
        }

        // =========================================================
        // ✅ PATH (단일: BUS/TRAM) + MIXED(구간별) 레이어 세트
        // =========================================================

        // ---------------------------
        // 1) 단일 모드용(기존 유지)
        // ---------------------------
        let pathVectorSource = null;
        let pathVectorLayer = null;

        // ---------------------------
        // 2) MIXED 전용(추가)
        // ---------------------------
        let mixedBusSource = null;
        let mixedBusLayer = null;

        let mixedTramSource = null;
        let mixedTramLayer = null;

        let mixedWalkSource = null;
        let mixedWalkLayer = null;

        // =========================================================
        // ✅ 단일모드 레이어: BUS(파랑) / TRAM(핑크)
        // =========================================================
        function ensurePathLayer(mode) {
            const map = getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return false;

            if (!pathVectorSource) pathVectorSource = new ol.source.Vector();

            const m = String(mode || '').toUpperCase();
            const isTram = m === 'TRAM';

            const STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: isTram ? 'rgba(236, 72, 153, 0.95)' : '#2563eb',
                    width: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!pathVectorLayer) {
                pathVectorLayer = new ol.layer.Vector({
                    source: pathVectorSource,
                    style: STYLE,
                    zIndex: 14,
                });

                // ✅✅✅ 여기 추가 (처음 만들 때)
                pathVectorLayer.set('tag', 'path');

                map.addLayer(pathVectorLayer);
            } else {
                pathVectorLayer.setStyle(STYLE);
                pathVectorLayer.setZIndex(14);

                // ✅✅✅ 여기 추가 (기존 레이어 재사용 시에도 보장)
                pathVectorLayer.set('tag', 'path');
            }

            return true;
        }

        // =========================================================
        // ✅ 경로 관련 정류장만 찍는 레이어 (Route Stops Only)
        // =========================================================
        var routeStopSource = null;
        var routeStopLayer = null;

        // ✅ stopId 정규화(매칭 안 될 때가 제일 흔한 원인)
        // - "DJB8001795" / "25_8001795" / "8001795" 같은 변형을 최대한 동일하게
        function __normStopId(v) {
            var s = String(v || '').trim();
            if (!s) return '';

            // 1) 공백 제거
            s = s.replace(/\s+/g, '');

            // 2) 구분자 뒤만 사용 (예: "25_8001795" -> "8001795")
            if (s.indexOf('_') >= 0) s = s.split('_').pop();

            // 3) 앞에 붙은 문자 제거 (예: "DJB8001795" -> "8001795")
            //    숫자가 포함된 경우 숫자만 남기는 방식이 매칭 성공률 높음
            var digits = s.replace(/[^0-9]/g, '');
            if (digits && digits.length >= 5) return digits; // 너무 짧으면 의미 없을 수 있어

            return s;
        }

        function clearRouteStops() {
            try {
                if (routeStopSource && routeStopSource.clear) routeStopSource.clear(true);
            } catch (e) {}
        }

        // =========================================================
        // ✅ routePath 응답에서 "정류장 ID 배열"을 최대한 안전하게 뽑기
        // =========================================================
        function extractStopIdsFromRoutePath(cached) {
            try {
                if (!cached) return [];

                if (Array.isArray(cached.stops)) {
                    return cached.stops
                        .map(function (s) {
                            return s && (s.stopId || s.nodeId || s.id || s.node || s.stationId);
                        })
                        .filter(Boolean)
                        .map(String);
                }

                if (Array.isArray(cached.nodes)) {
                    return cached.nodes
                        .map(function (n) {
                            return n && (n.nodeId || n.stopId || n.id);
                        })
                        .filter(Boolean)
                        .map(String);
                }

                if (Array.isArray(cached.pathStops)) {
                    return cached.pathStops.filter(Boolean).map(String);
                }

                if (Array.isArray(cached.path)) {
                    var ids = [];
                    for (var i = 0; i < cached.path.length; i++) {
                        var seg = cached.path[i] || {};
                        var a = seg.fromStopId || seg.from || seg.a || seg.start || seg.u;
                        var b = seg.toStopId || seg.to || seg.b || seg.end || seg.v;
                        if (a) ids.push(String(a));
                        if (b) ids.push(String(b));
                    }

                    // 중복 제거 (정규화 기준)
                    var seen = {};
                    var out = [];
                    for (var j = 0; j < ids.length; j++) {
                        var k = __normStopId(ids[j]);
                        if (!k || seen[k]) continue;
                        seen[k] = true;
                        out.push(k);
                    }
                    return out;
                }
            } catch (e) {}

            return [];
        }

        // =========================================================
        // ✅ stopId -> 좌표맵(stopCoordMap) 만들기
        // - 좌표는 EPSG:4326 -> 현재 맵 projection으로 변환
        // =========================================================
        function buildStopCoordMapFallback() {
            try {
                if (window.__stopCoordMap && typeof window.__stopCoordMap === 'object') return window.__stopCoordMap;
            } catch (e) {}

            var map = getInnerOlMap();
            if (!map || !window.ol || !ol.proj) return {};

            var list = [];
            try {
                if (Array.isArray(window.__allStops)) list = window.__allStops;
            } catch (e0) {}
            try {
                if (Array.isArray($scope && $scope.stops)) list = $scope.stops;
            } catch (e1) {}

            if (!list || !list.length) return {};

            var view = map.getView && map.getView();
            var proj = (view && view.getProjection && view.getProjection()) || null;

            function toXY(lon, lat) {
                lon = Number(lon);
                lat = Number(lat);
                if (!isFinite(lon) || !isFinite(lat)) return null;
                try {
                    if (proj) return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                } catch (e) {}
                return null;
            }

            var out = {};
            for (var i = 0; i < list.length; i++) {
                var s = list[i] || {};

                // ✅ id 정규화
                var rawId = s.nodeid || s.nodeId || s.stopId || s.id || '';
                var id = __normStopId(rawId);
                if (!id) continue;

                var lat = s.gpslati || s.gpsLati || s.lat || s.latitude || s.y;
                var lon = s.gpslong || s.gpsLong || s.lon || s.longitude || s.x;

                var xy = toXY(lon, lat);
                if (xy) out[id] = xy;
            }

            console.log('[buildStopCoordMapFallback] size=', Object.keys(out).length);

            return out;
        }

        // =========================================================
        // ✅ MIXED 렌더 전역 변수 (없으면 반드시 선언)
        // =========================================================

        if (typeof mixedTransferSource === 'undefined') var mixedTransferSource = null;
        if (typeof mixedTransferLayer === 'undefined') var mixedTransferLayer = null;

        // =========================================================
        // ✅ MIXED 레이어 4개: BUS / TRAM / WALK / TRANSFER (ES5)
        // - ✅ 레이어가 "현재 map"에 없으면 다시 addLayer
        // - ✅ tag 통일
        // - ✅ window에 소스/레이어 노출해서 콘솔 디버깅 가능
        // =========================================================
        function ensureMixedLayers() {
            var map = getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            // ✅ 현재 map에 레이어가 붙어있는지 체크(안전)
            function ensureAddedToMap(layer) {
                if (!layer || !map || !map.getLayers || !map.addLayer) return;

                try {
                    var group = map.getLayers();
                    if (!group || !group.getArray) {
                        // map.getLayers()가 배열처럼 안 나오는 특이 케이스 방어
                        map.addLayer(layer);
                        return;
                    }

                    var layers = group.getArray() || [];
                    // 레퍼런스로 비교(같은 객체인지)
                    for (var i = 0; i < layers.length; i++) {
                        if (layers[i] === layer) return; // 이미 붙어있음
                    }
                    map.addLayer(layer);
                } catch (e) {
                    try {
                        map.addLayer(layer);
                    } catch (e2) {}
                }
            }

            // ------------------------
            // BUS
            // ------------------------
            if (!mixedBusSource) mixedBusSource = new ol.source.Vector();

            var BUS_STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#2563eb',
                    width: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!mixedBusLayer) {
                mixedBusLayer = new ol.layer.Vector({
                    source: mixedBusSource,
                    style: BUS_STYLE,
                });
            } else {
                try {
                    mixedBusLayer.setSource(mixedBusSource);
                } catch (e1) {}
                try {
                    mixedBusLayer.setStyle(BUS_STYLE);
                } catch (e2) {}
            }
            try {
                mixedBusLayer.set('tag', 'mixed-bus');
            } catch (e3) {}
            try {
                mixedBusLayer.setZIndex(14);
            } catch (e4) {}
            ensureAddedToMap(mixedBusLayer);

            // ------------------------
            // TRAM
            // ------------------------
            if (!mixedTramSource) mixedTramSource = new ol.source.Vector();

            var TRAM_STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#ec4899',
                    width: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!mixedTramLayer) {
                mixedTramLayer = new ol.layer.Vector({
                    source: mixedTramSource,
                    style: TRAM_STYLE,
                });
            } else {
                try {
                    mixedTramLayer.setSource(mixedTramSource);
                } catch (e5) {}
                try {
                    mixedTramLayer.setStyle(TRAM_STYLE);
                } catch (e6) {}
            }
            try {
                mixedTramLayer.set('tag', 'mixed-tram');
            } catch (e7) {}
            try {
                mixedTramLayer.setZIndex(15);
            } catch (e8) {}
            ensureAddedToMap(mixedTramLayer);

            // ------------------------
            // WALK (검정 점선)
            // ------------------------
            if (!mixedWalkSource) mixedWalkSource = new ol.source.Vector();

            var WALK_STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#111827',
                    width: 3,
                    lineDash: [8, 6],
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!mixedWalkLayer) {
                mixedWalkLayer = new ol.layer.Vector({
                    source: mixedWalkSource,
                    style: WALK_STYLE,
                });
            } else {
                try {
                    mixedWalkLayer.setSource(mixedWalkSource);
                } catch (e9) {}
                try {
                    mixedWalkLayer.setStyle(WALK_STYLE);
                } catch (e10) {}
            }
            try {
                mixedWalkLayer.set('tag', 'mixed-walk');
            } catch (e11) {}
            try {
                mixedWalkLayer.setZIndex(16);
            } catch (e12) {}
            ensureAddedToMap(mixedWalkLayer);

            // ------------------------
            // TRANSFER (회색 얇은 점선)
            // ------------------------
            if (!mixedTransferSource) mixedTransferSource = new ol.source.Vector();

            var TRANSFER_STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#9ca3af',
                    width: 2,
                    lineDash: [4, 7],
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            if (!mixedTransferLayer) {
                mixedTransferLayer = new ol.layer.Vector({
                    source: mixedTransferSource,
                    style: TRANSFER_STYLE,
                });
            } else {
                try {
                    mixedTransferLayer.setSource(mixedTransferSource);
                } catch (e13) {}
                try {
                    mixedTransferLayer.setStyle(TRANSFER_STYLE);
                } catch (e14) {}
            }
            try {
                mixedTransferLayer.set('tag', 'mixed-transfer');
            } catch (e15) {}
            try {
                mixedTransferLayer.setZIndex(13);
            } catch (e16) {}
            ensureAddedToMap(mixedTransferLayer);

            // =========================================================
            // ✅✅✅ 콘솔 디버깅용 전역 노출 (안전)
            // =========================================================
            try {
                window.__DBG = window.__DBG || {};
                window.__DBG.mixed = {
                    busSource: mixedBusSource,
                    tramSource: mixedTramSource,
                    walkSource: mixedWalkSource,
                    transferSource: mixedTransferSource,

                    busLayer: mixedBusLayer,
                    tramLayer: mixedTramLayer,
                    walkLayer: mixedWalkLayer,
                    transferLayer: mixedTransferLayer,
                };

                // 예전 습관 alias
                window.__mixedBusSource = mixedBusSource;
                window.__mixedTramSource = mixedTramSource;
                window.__mixedWalkSource = mixedWalkSource;
                window.__mixedTransferSource = mixedTransferSource;

                // ✅ 확인 로그 (원하면 지워도 됨)
                console.log('[ensureMixedLayers] OK', 'bus=', !!mixedBusSource, 'tram=', !!mixedTramSource, 'walk=', !!mixedWalkSource, 'xfer=', !!mixedTransferSource);
            } catch (eWin) {}

            return true;
        }

        // =========================================================
        // ✅ MIXED 경로 지우기 (필요하면 clearPathOnMap() 내부에서 호출해도 됨)
        // =========================================================
        function clearMixedOnMap() {
            try {
                if (mixedBusSource) mixedBusSource.clear(true);
                if (mixedTramSource) mixedTramSource.clear(true);
                if (mixedWalkSource) mixedWalkSource.clear(true);
                if (mixedTransferSource) mixedTransferSource.clear(true);
            } catch (e) {}
        }

        // =========================================================
        // ✅ MIXED 전용: BUS/TRAM/WALK/TRANSFER 구간별로 그리기
        // - r.path(구간) + r.stops(좌표) 기반
        // - 좌표맵 보강(r.stops / r.polyline+stopIds / TRAM_STOPS)
        // =========================================================

        // ✅ 세그먼트 추가 (A,B는 "map 좌표" 또는 "lonlat" 둘다 받아서 안전처리)
        function addSegmentToSource(vectorSource, A, B, alreadyMapXY) {
            if (!vectorSource || !A || !B) return false;

            var a, b;

            // alreadyMapXY === true면 A/B가 이미 map좌표라고 가정
            if (alreadyMapXY) {
                a = A;
                b = B;
            } else {
                // A/B는 [lon,lat]
                a = lonLatToMapXY(Number(A[0]), Number(A[1]));
                b = lonLatToMapXY(Number(B[0]), Number(B[1]));
            }

            if (!a || !b) return false;

            const line = new ol.geom.LineString([a, b]);
            vectorSource.addFeature(new ol.Feature({ geometry: line }));
            return true;
        }

        // =========================================================
        // ✅ 거리 계산 유틸 (없으면 이거 써)
        // =========================================================
        function distanceMeters(lon1, lat1, lon2, lat2) {
            var R = 6371000;
            function toRad(d) {
                return (d * Math.PI) / 180;
            }
            var dLat = toRad(lat2 - lat1);
            var dLon = toRad(lon2 - lon1);

            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // =========================================================
        // ✅ [REPLACE] pathArr(서버 구간 정보) -> 메타맵 생성 (강화판)
        //  - key: from>to (기본) + from|to + from->to 도 같이 저장
        //  - dist/time이 문자열이어도 파싱 (ex: "11분 20초", "720", "1.2km")
        //  - 파싱 실패 시 0으로 덮지 않음 (NaN 유지) -> fallback 계산이 제대로 동작
        // =========================================================
        function buildEdgeMetaMapFromPath(pathArr) {
            var map = {};
            if (!Array.isArray(pathArr)) return map;

            function S(v) {
                return String(v == null ? '' : v).trim();
            }

            // ✅ 숫자/문자열 파싱: 실패하면 NaN (절대 0으로 만들지 않기)
            function numOrNaN(v) {
                if (v == null) return NaN;
                if (typeof v === 'number') return isFinite(v) ? v : NaN;

                var s = String(v).trim();
                if (!s) return NaN;

                // "1,234" 같은 케이스
                s = s.replace(/,/g, '');

                // 순수 숫자 문자열
                var n = Number(s);
                if (isFinite(n)) return n;

                return NaN;
            }

            // ✅ "11분 20초" / "11분" / "20초" / "00:30" 형태 파싱 -> 초
            function parseTimeToSec(v) {
                if (v == null) return NaN;
                if (typeof v === 'number') return isFinite(v) ? v : NaN;

                var s = String(v).trim();
                if (!s) return NaN;

                // 00:30 / 12:05
                var mColon = s.match(/^(\d+)\s*:\s*(\d+)$/);
                if (mColon) {
                    var mm = Number(mColon[1]);
                    var ss = Number(mColon[2]);
                    if (isFinite(mm) && isFinite(ss)) return mm * 60 + ss;
                }

                // "11분 20초"
                var min = 0,
                    sec = 0;
                var m1 = s.match(/(\d+)\s*분/);
                var m2 = s.match(/(\d+)\s*초/);
                if (m1) min = Number(m1[1] || 0);
                if (m2) sec = Number(m2[1] || 0);
                if (m1 || m2) {
                    if (!isFinite(min)) min = 0;
                    if (!isFinite(sec)) sec = 0;
                    return min * 60 + sec;
                }

                // 그냥 숫자면 초로 간주
                var n = numOrNaN(s);
                return isFinite(n) ? n : NaN;
            }

            // ✅ "1.2km" / "350m" 같은 형태 파싱 -> m
            function parseDistToM(v) {
                if (v == null) return NaN;
                if (typeof v === 'number') return isFinite(v) ? v : NaN;

                var s = String(v).trim();
                if (!s) return NaN;

                s = s.replace(/,/g, '');

                // 1.23km
                var km = s.match(/([\d.]+)\s*km/i);
                if (km) {
                    var k = Number(km[1]);
                    return isFinite(k) ? k * 1000 : NaN;
                }

                // 350m
                var m = s.match(/([\d.]+)\s*m/i);
                if (m) {
                    var mm = Number(m[1]);
                    return isFinite(mm) ? mm : NaN;
                }

                // 그냥 숫자면 m로 간주
                var n = numOrNaN(s);
                return isFinite(n) ? n : NaN;
            }

            function pickMode(seg) {
                var v = seg && (seg.mode != null ? seg.mode : seg.kind != null ? seg.kind : seg.type != null ? seg.type : seg.vehicle != null ? seg.vehicle : seg.edgeType != null ? seg.edgeType : seg.transitType != null ? seg.transitType : '');
                v = String(v || '')
                    .trim()
                    .toUpperCase();

                if (v === 'B') v = 'BUS';
                if (v === 'T') v = 'TRAM';
                if (v === 'W' || v === 'FOOT' || v === 'PED' || v === 'WALKING') v = 'WALK';
                if (v === 'LINK' || v === 'XFER') v = 'TRANSFER';
                return v;
            }

            function pickFrom(seg) {
                return S(
                    seg &&
                        (seg.fromStopId != null
                            ? seg.fromStopId
                            : seg.from != null
                            ? seg.from
                            : seg.a != null
                            ? seg.a
                            : seg.start != null
                            ? seg.start
                            : seg.u != null
                            ? seg.u
                            : seg.fromId != null
                            ? seg.fromId
                            : seg.fromNodeId != null
                            ? seg.fromNodeId
                            : '')
                );
            }

            function pickTo(seg) {
                return S(seg && (seg.toStopId != null ? seg.toStopId : seg.to != null ? seg.to : seg.b != null ? seg.b : seg.end != null ? seg.end : seg.v != null ? seg.v : seg.toId != null ? seg.toId : seg.toNodeId != null ? seg.toNodeId : ''));
            }

            function pickDistM(seg) {
                var v = seg && (seg.distM != null ? seg.distM : seg.dist != null ? seg.dist : seg.distanceM != null ? seg.distanceM : seg.distance != null ? seg.distance : seg.lengthM != null ? seg.lengthM : seg.lenM != null ? seg.lenM : null);
                return parseDistToM(v);
            }

            function pickTimeS(seg) {
                var v = seg && (seg.timeS != null ? seg.timeS : seg.time != null ? seg.time : seg.durationS != null ? seg.durationS : seg.duration != null ? seg.duration : seg.diffSec != null ? seg.diffSec : seg.sec != null ? seg.sec : null);
                return parseTimeToSec(v);
            }

            function setAllKeys(fromId, toId, meta) {
                var k1 = fromId + '>' + toId;
                var k2 = fromId + '|' + toId;
                var k3 = fromId + '->' + toId;

                var r1 = toId + '>' + fromId;
                var r2 = toId + '|' + fromId;
                var r3 = toId + '->' + fromId;

                // ✅ “0”보다 “유효값” 우선 갱신, NaN이면 기존 유지
                function better(oldM, newM) {
                    if (!oldM) return newM;

                    var oldD = Number(oldM.distM);
                    var oldT = Number(oldM.timeS);
                    var newD = Number(newM.distM);
                    var newT = Number(newM.timeS);

                    var oldDok = isFinite(oldD) && oldD > 0;
                    var oldTok = isFinite(oldT) && oldT > 0;
                    var newDok = isFinite(newD) && newD > 0;
                    var newTok = isFinite(newT) && newT > 0;

                    // 둘 다 더 좋으면 교체
                    if ((!oldDok && newDok) || (!oldTok && newTok)) return newM;
                    return oldM;
                }

                map[k1] = better(map[k1], meta);
                map[k2] = better(map[k2], meta);
                map[k3] = better(map[k3], meta);

                map[r1] = better(map[r1], meta);
                map[r2] = better(map[r2], meta);
                map[r3] = better(map[r3], meta);
            }

            for (var i = 0; i < pathArr.length; i++) {
                var seg = pathArr[i];
                if (!seg) continue;

                var fromId = pickFrom(seg);
                var toId = pickTo(seg);
                if (!fromId || !toId) continue;

                var meta = {
                    fromId: fromId,
                    toId: toId,
                    mode: pickMode(seg),
                    distM: pickDistM(seg), // NaN 가능
                    timeS: pickTimeS(seg), // NaN 가능
                    raw: seg,
                };

                setAllKeys(fromId, toId, meta);
            }

            // ✅ 디버그: 여기 값이 전부 NaN이면 서버가 dist/time을 안 주는 것
            try {
                console.log('[edgeMeta] keys=', Object.keys(map).length, 'sample=', map[Object.keys(map)[0]]);
            } catch (e) {}

            return map;
        }

        // =========================================================
        // ✅ [REPLACE] 단일 경로(버스/트램) 구간(세그먼트) 레이어 (hover hit 전용)
        //  - ⚠️ 완전 투명(rgba(...,0))이면 hit가 안 잡히는 경우가 있어
        //  - 그래서 알파를 0.01로(눈에는 안 보이는데 hit는 됨)
        //  - ✅ renderBuffer / updateWhileInteracting 보강으로 hit 안정화
        // =========================================================
        var pathSegSource = null;
        var pathSegLayer = null;

        // ✅ 스타일 캐시(매 pointermove마다 style 재생성 방지)
        var __pathSegHitStyle = null;

        function ensurePathSegLayer() {
            var map = getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            if (!pathSegSource) pathSegSource = new ol.source.Vector();

            if (!__pathSegHitStyle) {
                __pathSegHitStyle = new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        // ✅ 핵심: 알파 0이면 hit가 씹히는 경우가 있어서 0.01로
                        color: 'rgba(0,0,0,0.01)',
                        width: 16, // ✅ hit 잘 잡히게
                        lineCap: 'round',
                        lineJoin: 'round',
                    }),
                });
            }

            if (!pathSegLayer) {
                pathSegLayer = new ol.layer.Vector({
                    source: pathSegSource,

                    // ✅ 픽 안정성 향상 옵션들
                    renderBuffer: 200,
                    declutter: false,
                    updateWhileAnimating: true,
                    updateWhileInteracting: true,

                    style: function (f) {
                        return __pathSegHitStyle; // ✅ 캐시 스타일 반환
                    },
                    zIndex: 998,
                });

                // tag는 있어도 되고 없어도 되지만, 디버깅/식별용으로 유지
                try {
                    pathSegLayer.set('tag', 'path-seg');
                } catch (e) {}

                map.addLayer(pathSegLayer);
            }

            return true;
        }

        // =========================================================
        // ✅ [ADD/REPLACE] 단일 세그먼트 전용 레이어 (window 단일화)
        // - window.singleSegSource / window.singleSegLayer 가 "유일한 진실"
        // - 기존 코드가 singleSegSource/singleSegLayer를 참조해도 깨지지 않게 동기화
        // - map 재생성/탭 이동 시 레이어가 빠지면 재-add
        // - 콘솔에서 window.ensureSingleSegLayer()로 즉시 확인 가능
        // =========================================================
        var singleSegSource = null;
        var singleSegLayer = null;

        function ensureSingleSegLayer() {
            // ✅ map 안전 획득 ( __getMapSafe 없거나 늦게 로드돼도 안전 )
            var map = null;
            try {
                if (typeof __getMapSafe === 'function') map = __getMapSafe();
            } catch (e0) {}

            if (!map) {
                try {
                    if (typeof getInnerOlMap === 'function') map = getInnerOlMap();
                } catch (e1) {}
            }
            if (!map) {
                map = window.map || window.olMap || window.__olMap || window.ngiiMap || null;
            }

            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            // ✅ source는 window가 유일
            if (!window.singleSegSource) window.singleSegSource = new ol.source.Vector();

            // ✅ style
            var STYLE = new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: '#2563eb',
                    width: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                }),
            });

            // ✅ layer도 window가 유일
            if (!window.singleSegLayer) {
                window.singleSegLayer = new ol.layer.Vector({
                    source: window.singleSegSource,
                    style: STYLE,
                    zIndex: 9999,
                });
                // hover 필터링용 tag
                window.singleSegLayer.set('tag', 'single-seg-layer');
                map.addLayer(window.singleSegLayer);
            } else {
                // 최신화
                try {
                    window.singleSegLayer.setSource(window.singleSegSource);
                } catch (e2) {}
                try {
                    window.singleSegLayer.setStyle(STYLE);
                } catch (e3) {}
                try {
                    window.singleSegLayer.setZIndex(9999);
                } catch (e4) {}

                // map 재생성/탭 이동으로 빠졌으면 재-add
                try {
                    var arr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    if (arr && arr.indexOf(window.singleSegLayer) === -1) map.addLayer(window.singleSegLayer);
                } catch (e5) {}
            }

            // ✅ 기존 지역변수 호환(ReferenceError 방지)
            singleSegSource = window.singleSegSource;
            singleSegLayer = window.singleSegLayer;

            return true;
        }

        // ✅ 중요: "함수 실행 전"에도 콘솔에서 바로 호출 가능하게 전역 export
        try {
            window.ensureSingleSegLayer = ensureSingleSegLayer;
        } catch (e6) {}

        // =========================================================
        // ✅ [REPLACE] drawPathPolylineLonLat (단일 segSource 통일 + hover segTag만)
        //  - edgeMeta 키 탐색: '>' / '|' / '->' 모두 지원
        //  - meta 필드명 변형(distM/timeS/diffSec 등) 흡수
        //  - meta 없으면 haversine dist + 속도로 time 추정
        //  - 좌표 [lat,lon] 들어오는 경우 스왑 방어
        //  - "없으면 0으로 덮기" 금지
        //  - ✅ 핵심: 단일(BUS/TRAM)일 때 pathSegSource === window.singleSegSource 로 통일
        // =========================================================
        function drawPathPolylineLonLat(polyLonLat, mode) {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map) return false;

            var m = String(mode || '').toUpperCase();
            if (m === 'MIXED') return false;

            if (!ensurePathLayer(m)) return false;
            if (!pathVectorSource) return false;

            if (!ensurePathSegLayer()) return false;
            if (!pathSegSource) return false;

            // ✅ 단일 모드면 singleSegLayer 확보 + hover는 segTag만 잡게
            var isSingle = m === 'BUS' || m === 'TRAM';
            if (isSingle) {
                try {
                    if (typeof ensureSingleSegLayer === 'function') ensureSingleSegLayer();
                } catch (eS0) {}

                // ✅ hover: 단일은 segTag만 허용(통짜 path 라인 차단)
                try {
                    if (typeof ensureSegmentHoverHandler === 'function') {
                        ensureSegmentHoverHandler(map, ['single-seg'], ['__never__']);
                    }
                } catch (eS1) {}
            } else {
                // (혹시) 단일이 아닐 때 기본 hover
                try {
                    if (typeof ensureSegmentHoverHandler === 'function') {
                        ensureSegmentHoverHandler(map);
                    }
                } catch (eH0) {}
            }

            try {
                if (pathVectorLayer && pathVectorLayer.set) pathVectorLayer.set('tag', 'path');
            } catch (e0) {}

            // ✅ 초기화
            try {
                pathVectorSource.clear(true);
            } catch (e1) {}
            try {
                pathSegSource.clear(true);
            } catch (e2) {}

            // ✅ 단일용 소스도 같이 비워서 “오염” 방지
            if (isSingle) {
                try {
                    if (window.singleSegSource && window.singleSegSource.clear) window.singleSegSource.clear(true);
                } catch (e2b) {}
            }

            if (!Array.isArray(polyLonLat) || polyLonLat.length < 2) return false;

            // =========================
            // ✅ 안전 거리 계산(haversine)
            // =========================
            function distanceMeters(lon1, lat1, lon2, lat2) {
                lon1 = Number(lon1);
                lat1 = Number(lat1);
                lon2 = Number(lon2);
                lat2 = Number(lat2);
                if (!isFinite(lon1) || !isFinite(lat1) || !isFinite(lon2) || !isFinite(lat2)) return NaN;

                var R = 6371000;
                function toRad(d) {
                    return (d * Math.PI) / 180;
                }
                var dLat = toRad(lat2 - lat1);
                var dLon = toRad(lon2 - lon1);
                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            // 0) 전체 polyline 투영(전체 라인 그리기용)
            var projected = polyLonLat
                .map(function (xy) {
                    var lon = Number(xy && xy[0]);
                    var lat = Number(xy && xy[1]);
                    return lonLatToMapXY(lon, lat);
                })
                .filter(function (v) {
                    return !!v;
                });

            if (projected.length < 2) return false;

            // 1) 전체 라인 (시각용)
            var line = new ol.geom.LineString(projected);
            var feature = new ol.Feature({ geometry: line });

            var isTram = m === 'TRAM';
            feature.setStyle(
                new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: isTram ? '#ec4899' : '#2563eb',
                        width: 5,
                        lineCap: 'round',
                        lineJoin: 'round',
                    }),
                })
            );
            feature.set('layerTag', 'path');
            pathVectorSource.addFeature(feature);

            // =========================================================
            // 1.5) 정류장 기반 세그먼트 생성 (hover 대상)
            // =========================================================
            try {
                var labelMap = window.__lastStopLabelMap || {};
                var stopCoordMap = window.__lastStopCoordMap || {};
                var routeStopIds = window.__lastRouteStopIds || [];
                var edgeMeta = window.__lastEdgeMetaMap || {};

                function getCoordLonLatById(id) {
                    id = String(id || '').trim();
                    if (!id) return null;

                    var v = stopCoordMap[id];
                    if (!v) return null;

                    // {lon,lat}
                    if (typeof v === 'object' && !Array.isArray(v)) {
                        var lonO = Number(v.lon != null ? v.lon : v.lng != null ? v.lng : v.longitude);
                        var latO = Number(v.lat != null ? v.lat : v.latitude);
                        if (!isFinite(lonO) || !isFinite(latO)) return null;

                        // ✅ lat/lon 스왑 방어
                        if (Math.abs(latO) > 90 && Math.abs(lonO) <= 90) {
                            var tmp0 = lonO;
                            lonO = latO;
                            latO = tmp0;
                        }
                        return [lonO, latO];
                    }

                    // [lon,lat] or [lat,lon]
                    if (Array.isArray(v) && v.length >= 2) {
                        var lon = Number(v[0]);
                        var lat = Number(v[1]);
                        if (!isFinite(lon) || !isFinite(lat)) return null;

                        // ✅ lat/lon 스왑 방어
                        if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                            var tmp = lon;
                            lon = lat;
                            lat = tmp;
                        }
                        return [lon, lat];
                    }

                    return null;
                }

                function nameById(id, idx, isLast) {
                    id = String(id || '').trim();
                    if (id && labelMap[id]) return String(labelMap[id]);

                    var fallbackFromName = String(($scope.collectFromSelected && $scope.collectFromSelected.name) || '출발').trim();
                    var fallbackToName = String(($scope.collectToSelected && $scope.collectToSelected.name) || '도착').trim();

                    if (idx === 0) return fallbackFromName;
                    if (isLast) return fallbackToName;
                    return id || '정류장' + (idx + 1);
                }

                function findMeta(fromId, toId) {
                    fromId = String(fromId || '').trim();
                    toId = String(toId || '').trim();
                    if (!fromId || !toId) return null;

                    return edgeMeta[fromId + '>' + toId] || edgeMeta[fromId + '|' + toId] || edgeMeta[fromId + '->' + toId] || edgeMeta[toId + '>' + fromId] || edgeMeta[toId + '|' + fromId] || edgeMeta[toId + '->' + fromId] || null;
                }

                function pickMetaDistM(meta) {
                    if (!meta) return NaN;
                    var v = meta.distM != null ? meta.distM : meta.dist != null ? meta.dist : meta.distance != null ? meta.distance : meta.meters != null ? meta.meters : meta.lenM != null ? meta.lenM : null;
                    v = Number(v);
                    return isFinite(v) ? v : NaN;
                }

                function pickMetaTimeS(meta, distM) {
                    if (!meta) return NaN;
                    var v =
                        meta.timeS != null
                            ? meta.timeS
                            : meta.time != null
                            ? meta.time
                            : meta.sec != null
                            ? meta.sec
                            : meta.secs != null
                            ? meta.secs
                            : meta.diffSec != null
                            ? meta.diffSec
                            : meta.diff_sec != null
                            ? meta.diff_sec
                            : meta.duration != null
                            ? meta.duration
                            : null;

                    v = Number(v);
                    if (!isFinite(v)) return NaN;

                    // ✅ 분으로 들어온 케이스 보정(보수적으로)
                    distM = Number(distM);
                    if (isFinite(distM) && distM >= 200 && v > 0 && v < 10) return Math.round(v * 60);

                    return v;
                }

                var BUS_SPEED_MPS = 6.0;
                var TRAM_SPEED_MPS = 6.94;
                var SPEED = isTram ? TRAM_SPEED_MPS : BUS_SPEED_MPS;

                if (Array.isArray(routeStopIds) && routeStopIds.length >= 2) {
                    for (var i = 0; i < routeStopIds.length - 1; i++) {
                        var fromId = String(routeStopIds[i] || '').trim();
                        var toId = String(routeStopIds[i + 1] || '').trim();
                        if (!fromId || !toId) continue;

                        var fromLL = getCoordLonLatById(fromId);
                        var toLL = getCoordLonLatById(toId);
                        if (!fromLL || !toLL) continue;

                        var a = lonLatToMapXY(fromLL[0], fromLL[1]);
                        var b = lonLatToMapXY(toLL[0], toLL[1]);
                        if (!a || !b) continue;

                        var segLine = new ol.geom.LineString([a, b]);
                        var segF = new ol.Feature({ geometry: segLine });

                        var meta = findMeta(fromId, toId);

                        var distM = pickMetaDistM(meta);
                        if (!isFinite(distM) || distM <= 0) distM = distanceMeters(fromLL[0], fromLL[1], toLL[0], toLL[1]);

                        var timeS = pickMetaTimeS(meta, distM);
                        if (!isFinite(timeS) || timeS <= 0) timeS = SPEED > 0 && isFinite(distM) ? Math.max(1, Math.round(distM / SPEED)) : NaN;

                        if (!isFinite(distM) || distM <= 0) continue;
                        if (!isFinite(timeS) || timeS < 0) continue;

                        segF.set('segTag', 'single-seg');
                        segF.set('mode', meta && meta.mode ? String(meta.mode) : isTram ? 'TRAM' : 'BUS');
                        segF.set('fromId', fromId);
                        segF.set('toId', toId);
                        segF.set('fromName', nameById(fromId, i, false));
                        segF.set('toName', nameById(toId, i + 1, i + 1 === routeStopIds.length - 1));
                        segF.set('distM', distM);
                        segF.set('timeS', timeS);
                        segF.set('segIndex', i);

                        pathSegSource.addFeature(segF);
                    }
                }

                // ✅✅✅ 핵심: 단일(BUS/TRAM)일 때 singleSegSource가 pathSegSource를 "그대로" 보게 alias
                if (isSingle) {
                    try {
                        window.singleSegSource = pathSegSource;
                        try {
                            singleSegSource = window.singleSegSource;
                        } catch (eA0) {}

                        if (window.singleSegLayer && window.singleSegLayer.setSource) {
                            window.singleSegLayer.setSource(window.singleSegSource);
                        }
                        try {
                            singleSegLayer = window.singleSegLayer;
                        } catch (eA1) {}

                        console.log('[SINGLE][ALIAS] singleSegSource <= pathSegSource', {
                            singleSegLen: window.singleSegSource.getFeatures().length,
                        });
                    } catch (eAlias) {
                        console.warn('[SINGLE][ALIAS] fail', eAlias);
                    }
                }

                try {
                    console.log('[SEG][SINGLE] segments=', pathSegSource.getFeatures().length, {
                        routeStopIds: Array.isArray(routeStopIds) ? routeStopIds.length : -1,
                        edgeKeys: Object.keys(edgeMeta || {}).length,
                        coordKeys: Object.keys(stopCoordMap || {}).length,
                    });
                } catch (eDbg) {}
            } catch (eSeg) {
                console.warn('[drawPathPolylineLonLat] build segments failed:', eSeg);
            }

            // 2) 출발/도착 마커
            try {
                var startXY = projected[0];
                var endXY = projected[projected.length - 1];

                var fromName2 = String(($scope.collectFromSelected && $scope.collectFromSelected.name) || '출발').trim();
                var toName2 = String(($scope.collectToSelected && $scope.collectToSelected.name) || '도착').trim();

                function makeMarker(pointXY, fillColor, labelText) {
                    var f = new ol.Feature({ geometry: new ol.geom.Point(pointXY) });
                    f.setStyle(
                        new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: 8,
                                fill: new ol.style.Fill({ color: fillColor }),
                                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                            }),
                            text: new ol.style.Text({
                                text: labelText,
                                offsetY: -18,
                                font: 'bold 12px Segoe UI',
                                fill: new ol.style.Fill({ color: '#111827' }),
                                stroke: new ol.style.Stroke({ color: '#ffffff', width: 4 }),
                            }),
                        })
                    );
                    return f;
                }

                pathVectorSource.addFeature(makeMarker(startXY, '#22c55e', fromName2));
                pathVectorSource.addFeature(makeMarker(endXY, '#ef4444', toName2));
            } catch (eMark) {
                console.warn('[drawPathPolylineLonLat] endpoint marker error:', eMark);
            }

            // 3) 상태값
            $scope.pathPolylineFeature = feature;
            $scope.pathPolylineExtent = line.getExtent();
            $scope.pathPolylineReady = true;

            try {
                if (map.renderSync) map.renderSync();
            } catch (eR) {}
            return true;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 세그먼트 추가 (projection 안전 + dist/time 보정 제거 + sphere fallback)
        // - distM:
        //    1) meta.distM가 정상(>0)이면 그걸 그대로 사용
        //    2) 아니면 line.getLength() 시도
        //    3) 그래도 이상하면(도 단위 가능성) ol.sphere.getLength로 재계산
        // - timeS: meta.timeS가 정상(>0)이면 그대로, 아니면 dist/speed
        // - segId/title/debugKey 추가로 "전부 동일" 원인 추적 쉬움
        // =========================================================
        function addSegmentToSourceXY(source, AX, BX, meta) {
            try {
                if (!source || !window.ol || !ol.geom || !ol.Feature) return false;
                if (!AX || !BX) return false;

                var line = new ol.geom.LineString([AX, BX]);
                var f = new ol.Feature({ geometry: line });

                meta = meta || {};

                // ✅ 세그먼트 태그
                f.set('segTag', meta.segTag != null ? String(meta.segTag) : 'mixed-seg');

                // ✅ 모드/종류
                var mode = meta.mode != null ? String(meta.mode).toUpperCase() : '';
                if (mode) f.set('mode', mode);
                if (meta.kind != null) f.set('kind', meta.kind);

                function toNum(v) {
                    if (v == null) return null;
                    if (typeof v === 'number') return isFinite(v) ? v : null;
                    var s = String(v).trim();
                    if (!s) return null;
                    s = s.replace(/,/g, '');
                    var n = Number(s);
                    if (isFinite(n)) return n;
                    var m = s.match(/-?\d+(\.\d+)?/);
                    if (!m) return null;
                    n = Number(m[0]);
                    return isFinite(n) ? n : null;
                }

                function speedMpsForMode(m) {
                    m = String(m || '').toUpperCase();
                    if (m === 'BUS') return 6.0;
                    if (m === 'TRAM') return 7.0;
                    if (m === 'TRANSFER') return 1.2;
                    return 1.2; // WALK 기본
                }

                // ✅ raw 저장(디버그)
                f.set('rawDistM', meta.distM);
                f.set('rawTimeS', meta.timeS);

                // -------------------------------------------------
                // ✅ distM 계산 (투영 안전)
                // -------------------------------------------------
                var distM = toNum(meta.distM);

                // 1) meta.distM가 유효하면 그대로
                if (!(isFinite(distM) && distM > 0)) {
                    // 2) projection 좌표(미터)면 보통 getLength()가 미터
                    try {
                        if (line && typeof line.getLength === 'function') {
                            var len = Number(line.getLength());
                            if (isFinite(len) && len > 0) distM = len;
                        }
                    } catch (e1) {}
                }

                // 3) 그래도 이상하면 sphere.getLength로 fallback
                //    - 특히 EPSG:4326(도) 좌표였으면 getLength가 '도 단위'라서 dist가 비정상적일 수 있음
                if (!(isFinite(distM) && distM > 0)) {
                    try {
                        if (ol.sphere && typeof ol.sphere.getLength === 'function') {
                            var len2 = Number(ol.sphere.getLength(line));
                            if (isFinite(len2) && len2 > 0) distM = len2;
                        }
                    } catch (e2) {}
                }

                if (!(isFinite(distM) && distM > 0)) distM = 0;

                // -------------------------------------------------
                // ✅ timeS 계산 (보정 제거, 단순 dist/speed)
                // -------------------------------------------------
                var timeS = toNum(meta.timeS);
                if (!(isFinite(timeS) && timeS > 0)) {
                    var sp = speedMpsForMode(mode);
                    timeS = sp > 0 ? Math.round(distM / sp) : 0;
                }
                if (!(isFinite(timeS) && timeS >= 0)) timeS = 0;

                f.set('distM', distM);
                f.set('timeS', timeS);

                // -------------------------------------------------
                // ✅ from/to 정보 (이게 세그먼트마다 달라야 함!!)
                // -------------------------------------------------
                var fromId = meta.fromId != null ? String(meta.fromId) : '';
                var toId = meta.toId != null ? String(meta.toId) : '';
                var fromName = meta.fromName != null ? String(meta.fromName) : '';
                var toName = meta.toName != null ? String(meta.toName) : '';

                if (fromId) f.set('fromId', fromId);
                if (toId) f.set('toId', toId);
                if (fromName) f.set('fromName', fromName);
                if (toName) f.set('toName', toName);

                // ✅ hover 표시용 title (없으면 자동 구성)
                var title = meta.title != null ? String(meta.title) : '';
                if (!title) {
                    if (fromName || toName) title = (fromName || fromId || '출발') + ' → ' + (toName || toId || '도착');
                }
                if (title) f.set('title', title);

                // ✅ 좌표 저장(복사본)
                if (meta.fromXY && Array.isArray(meta.fromXY) && meta.fromXY.length >= 2) {
                    f.set('fromXY', [Number(meta.fromXY[0]), Number(meta.fromXY[1])]);
                }
                if (meta.toXY && Array.isArray(meta.toXY) && meta.toXY.length >= 2) {
                    f.set('toXY', [Number(meta.toXY[0]), Number(meta.toXY[1])]);
                }

                // ✅✅✅ 디버그용: “전부 동일”인지 바로 보이게 키 심기
                // (콘솔에서 feature.get('debugKey') 보면 다르면 정상)
                var debugKey = f.get('segTag') + '|' + mode + '|' + (fromId || '') + '|' + (toId || '') + '|' + distM + '|' + timeS;
                f.set('debugKey', debugKey);

                source.addFeature(f);
                return true;
            } catch (e) {
                console.warn('[addSegmentToSourceXY] fail', e);
                return false;
            }
        }

        // =========================================================
        // ✅✅✅ [ADD] 경로 클릭 팝업(Overlay) + 세그먼트 시간/거리 추출 유틸
        // - BUS/TRAM/MIXED/WALK 전부 클릭 시 정보 표시
        // =========================================================
        var pathInfoOverlay = null;
        var pathInfoOverlayEl = null;
        var pathClickBound = false;

        // 마지막 경로 요약(전체 합계) 저장
        var lastPathSummary = {
            totalTimeS: 0,
            totalDistM: 0,
            busTimeS: 0,
            tramTimeS: 0,
            walkTimeS: 0,
            transferTimeS: 0,
        };

        // ✅ seg에서 시간(초) 꺼내기: 서버가 주는 필드 최대한 흡수
        function pickSegTimeS(seg) {
            if (!seg) return null;
            var cand =
                seg.timeS != null
                    ? seg.timeS
                    : seg.timeSec != null
                    ? seg.timeSec
                    : seg.durationS != null
                    ? seg.durationS
                    : seg.durationSec != null
                    ? seg.durationSec
                    : seg.totalTimeS != null
                    ? seg.totalTimeS
                    : seg.costTime != null
                    ? seg.costTime
                    : seg.t != null
                    ? seg.t
                    : null;

            var n = Number(cand);
            return isFinite(n) && n >= 0 ? n : null;
        }

        // ✅ seg에서 거리(m) 꺼내기
        function pickSegDistM(seg) {
            if (!seg) return null;
            var cand = seg.distM != null ? seg.distM : seg.distanceM != null ? seg.distanceM : seg.dist != null ? seg.dist : seg.distance != null ? seg.distance : seg.d != null ? seg.d : null;

            var n = Number(cand);
            return isFinite(n) && n >= 0 ? n : null;
        }

        function secToMinText(sec) {
            var s = Number(sec || 0);
            if (!isFinite(s) || s <= 0) return '0분';
            var m = Math.round(s / 60);
            return String(m) + '분';
        }

        function meterText(m) {
            var v = Number(m || 0);
            if (!isFinite(v) || v <= 0) return '0m';
            if (v >= 1000) return (v / 1000).toFixed(2) + 'km';
            return Math.round(v) + 'm';
        }

        function ensurePathInfoOverlay() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol) return false;

            if (!pathInfoOverlayEl) {
                pathInfoOverlayEl = document.createElement('div');
                pathInfoOverlayEl.style.cssText =
                    'position:absolute; background:#111827; color:#fff; padding:10px 12px; border-radius:10px; ' +
                    'font:12px/1.4 sans-serif; box-shadow:0 10px 25px rgba(0,0,0,0.25); min-width:220px; ' +
                    'transform:translate(-50%,-110%); pointer-events:none; white-space:normal;';

                pathInfoOverlayEl.innerHTML = '';
            }

            if (!pathInfoOverlay) {
                pathInfoOverlay = new ol.Overlay({
                    element: pathInfoOverlayEl,
                    positioning: 'bottom-center',
                    stopEvent: false,
                    offset: [0, -10],
                });
                map.addOverlay(pathInfoOverlay);
            }
            return true;
        }

        function hidePathInfoOverlay() {
            try {
                if (pathInfoOverlay) pathInfoOverlay.setPosition(undefined);
            } catch (e) {}
        }

        // ✅ 전체 합계 요약 계산(서버 pathArr에 timeS/distM 있으면 그걸 우선 사용)
        // - 0m/0초 방지 강화판
        function computeSummaryFromPathArr(pathArr, stopCoord, distanceMetersFn, WALK_SPEED_MPS, TRAM_SPEED_MPS, BUS_SPEED_MPS) {
            var sum = {
                totalTimeS: 0,
                totalDistM: 0,
                busTimeS: 0,
                tramTimeS: 0,
                walkTimeS: 0,
                transferTimeS: 0,
            };

            if (!Array.isArray(pathArr) || !pathArr.length) return sum;

            // ---------------------------
            // ✅ 숫자 파싱 유틸 (문자열/단위 포함 방어)
            // ---------------------------
            function toNum(v) {
                if (v == null) return null;
                if (typeof v === 'number') return isFinite(v) ? v : null;

                var s = String(v).trim();
                if (!s) return null;

                // "123", "12.3" 바로 변환 시도
                var n = Number(s);
                if (isFinite(n)) return n;

                // "123m", "12분", "1,234" 같은 경우 처리
                s = s.replace(/,/g, '');
                n = Number(s);
                if (isFinite(n)) return n;

                var m = s.match(/-?\d+(\.\d+)?/);
                if (!m) return null;
                n = Number(m[0]);
                return isFinite(n) ? n : null;
            }

            // ---------------------------
            // ✅ mode 판별
            // ---------------------------
            function segMode(seg) {
                var v = seg && (seg.mode != null ? seg.mode : seg.kind != null ? seg.kind : seg.type != null ? seg.type : seg.vehicle != null ? seg.vehicle : seg.edgeType != null ? seg.edgeType : seg.transitType != null ? seg.transitType : '');
                v = String(v || '').toUpperCase();
                if (v === 'FOOT' || v === 'PED' || v === 'WALKING') v = 'WALK';
                if (v === 'LINK' || v === 'XFER') v = 'TRANSFER';
                return v || 'WALK';
            }

            // ---------------------------
            // ✅ id 추출
            // ---------------------------
            function getFromId(seg) {
                return String((seg && (seg.from != null ? seg.from : seg.fromStopId != null ? seg.fromStopId : seg.a != null ? seg.a : seg.start != null ? seg.start : seg.u != null ? seg.u : '')) || '').trim();
            }
            function getToId(seg) {
                return String((seg && (seg.to != null ? seg.to : seg.toStopId != null ? seg.toStopId : seg.b != null ? seg.b : seg.end != null ? seg.end : seg.v != null ? seg.v : '')) || '').trim();
            }
            function getAtId(seg) {
                return String((seg && (seg.at != null ? seg.at : seg.nodeId != null ? seg.nodeId : seg.stopId != null ? seg.stopId : seg.id != null ? seg.id : '')) || '').trim();
            }

            // ---------------------------
            // ✅ 좌표 추출(0,0/뒤집힘/범위 밖 방어)
            // stopCoord: { id: [lon,lat] } 전제
            // ---------------------------
            function coordOf(id) {
                id = String(id || '').trim();
                if (!id) return null;

                var c = stopCoord ? stopCoord[id] : null;
                if (!c || !Array.isArray(c) || c.length < 2) return null;

                var lon = Number(c[0]);
                var lat = Number(c[1]);
                if (!isFinite(lon) || !isFinite(lat)) return null;

                // (0,0) 제거
                if (lon === 0 && lat === 0) return null;

                // lat/lon 뒤집힘 방어 (lat가 90넘고 lon이 90이하일 때 swap)
                if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                    var tmp = lon;
                    lon = lat;
                    lat = tmp;
                }

                // 한국 근방 범위 방어 (원하면 주석 가능)
                if (lon < 120 || lon > 135 || lat < 30 || lat > 45) return null;

                return [lon, lat];
            }

            // ---------------------------
            // ✅ timeS가 "분"으로 들어온 케이스 보정(휴리스틱)
            // - dist가 200m 이상인데 time이 1~200이면 "분"일 가능성 → 초로 변환
            // ---------------------------
            function normalizeTimeS(timeS, distM) {
                var t = toNum(timeS);
                var d = toNum(distM);

                if (t == null || !isFinite(t) || t < 0) t = 0;
                if (d == null || !isFinite(d) || d < 0) d = 0;

                if (d >= 200 && t > 0 && t <= 200) return Math.round(t * 60);
                return Math.round(t);
            }

            // ---------------------------
            // ✅ 속도 fallback
            // ---------------------------
            function speedForMode(m) {
                m = String(m || '').toUpperCase();
                if (m === 'TRAM') return TRAM_SPEED_MPS > 0 ? TRAM_SPEED_MPS : 7.0;
                if (m === 'BUS') return BUS_SPEED_MPS > 0 ? BUS_SPEED_MPS : 6.0;
                return WALK_SPEED_MPS > 0 ? WALK_SPEED_MPS : 1.2; // WALK/TRANSFER
            }

            // =========================================================
            // ✅ 본문 루프
            // =========================================================
            var prevAnchor = null;

            for (var i = 0; i < pathArr.length; i++) {
                var seg = pathArr[i];
                if (!seg) continue;

                var m = segMode(seg);

                var fromId = getFromId(seg);
                var toId = getToId(seg);
                var atId = getAtId(seg);

                // at-only면 prevAnchor -> at 연결
                if ((!fromId || !toId) && atId) {
                    fromId = prevAnchor || atId;
                    toId = atId;
                } else {
                    if (!fromId && prevAnchor) fromId = prevAnchor;
                }

                if (!fromId || !toId) {
                    prevAnchor = atId || toId || fromId || prevAnchor;
                    continue;
                }

                var A = coordOf(fromId);
                var B = coordOf(toId);

                // ---------------------------
                // ✅ distM: 서버 우선, 없으면 좌표거리
                // ---------------------------
                var distM = toNum(pickSegDistM(seg)); // ⭐ 숫자 파싱 추가
                if ((distM == null || !isFinite(distM) || distM <= 0) && A && B) {
                    distM = toNum(distanceMetersFn(A[0], A[1], B[0], B[1]));
                }
                if (!isFinite(distM) || distM <= 0) {
                    // ✅ dist가 0이면 이 seg는 누적 제외(좌표/데이터가 없다는 뜻)
                    prevAnchor = toId;
                    continue;
                }

                // ---------------------------
                // ✅ timeS: 서버 우선, 없으면 dist/speed
                // ---------------------------
                var timeS = normalizeTimeS(pickSegTimeS(seg), distM); // ⭐ 파싱+분→초 보정
                if (!timeS || timeS <= 0) {
                    var sp = speedForMode(m);
                    timeS = sp > 0 ? Math.round(distM / sp) : 0;
                }

                // 누적
                sum.totalDistM += distM;
                sum.totalTimeS += timeS;

                if (m === 'BUS') sum.busTimeS += timeS;
                else if (m === 'TRAM') sum.tramTimeS += timeS;
                else if (m === 'TRANSFER') sum.transferTimeS += timeS;
                else sum.walkTimeS += timeS;

                prevAnchor = toId;
            }

            return sum;
        }

        // ✅ map 클릭 이벤트(한 번만 바인딩)
        function bindPathClickOnce() {
            if (pathClickBound) return;
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !map.on) return;

            pathClickBound = true;

            map.on('singleclick', function (evt) {
                try {
                    if (!ensurePathInfoOverlay()) return;

                    var feature = null;
                    map.forEachFeatureAtPixel(
                        evt.pixel,
                        function (f, layer) {
                            feature = f;
                            return true;
                        },
                        {
                            hitTolerance: 6,
                        }
                    );

                    if (!feature) {
                        hidePathInfoOverlay();
                        return;
                    }

                    // ✅ 우리가 그린 선/경로 feature만 표시(속성 tag/mode가 있는 애들)
                    var fMode = feature.get && feature.get('mode');
                    var fKind = feature.get && feature.get('kind');
                    if (!fMode && !fKind) {
                        // pathPolyline(단일)도 정보 뜨게 하고 싶으면 아래 주석 해제 가능
                        // fMode = 'PATH';
                        hidePathInfoOverlay();
                        return;
                    }

                    var modeUpper = String(fMode || '').toUpperCase();
                    var distM = Number(feature.get('distM') || 0);
                    var timeS = Number(feature.get('timeS') || 0);

                    // 전체 합계는 lastPathSummary 사용
                    var s = lastPathSummary || {};
                    var totalTxt = '총 ' + secToMinText(s.totalTimeS) + ' / 버스 ' + secToMinText(s.busTimeS) + ' / 트램 ' + secToMinText(s.tramTimeS) + ' / 도보 ' + secToMinText((s.walkTimeS || 0) + (s.transferTimeS || 0));

                    var title = '';
                    if (modeUpper === 'BUS') title = '🚌 버스 구간';
                    else if (modeUpper === 'TRAM') title = '🚋 트램 구간';
                    else if (modeUpper === 'TRANSFER') title = '🔁 환승/연결';
                    else title = '🚶 도보 구간';

                    pathInfoOverlayEl.innerHTML =
                        '<div style="font-weight:700; font-size:13px; margin-bottom:6px;">' +
                        title +
                        '</div>' +
                        '<div style="opacity:.95">구간: <b>' +
                        secToMinText(timeS) +
                        '</b> · ' +
                        meterText(distM) +
                        '</div>' +
                        '<div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,.15); opacity:.95">' +
                        totalTxt +
                        '</div>';

                    pathInfoOverlay.setPosition(evt.coordinate);
                } catch (e) {
                    console.warn('[path click] error', e);
                }
            });
        }

        // =========================================================
        // ✅ [REPLACE][ES5] r에서 stopId -> [lon,lat] 맵 생성 (MIXED 공통)
        // - ES5 호환(?? 제거)
        // - lon/lat 뒤집힘 방어
        // - 숫자 파싱 강화(문자열/공백/콤마 대응)
        // =========================================================
        function buildStopCoordMapFromResult(r) {
            var m = {};
            if (!r) return m;

            function pickId(s) {
                if (!s) return '';
                var v = s.stopId != null ? s.stopId : s.stop_id != null ? s.stop_id : s.nodeId != null ? s.nodeId : s.nodeid != null ? s.nodeid : s.id != null ? s.id : '';
                return String(v || '').trim();
            }

            function toNum(x) {
                // 숫자/문자열 모두 안전하게 Number로
                if (x == null) return NaN;
                if (typeof x === 'number') return x;
                var s = String(x).trim();
                if (!s) return NaN;

                // "127,123" 같은 콤마 제거
                s = s.replace(/,/g, '');
                var n = Number(s);
                return n;
            }

            function pickLon(s) {
                if (!s) return NaN;
                // lon 후보들
                var v = s.lon != null ? s.lon : s.lng != null ? s.lng : s.longitude != null ? s.longitude : s.gpslong != null ? s.gpslong : s.gpsLong != null ? s.gpsLong : null;
                return toNum(v);
            }

            function pickLat(s) {
                if (!s) return NaN;
                // lat 후보들
                var v = s.lat != null ? s.lat : s.latitude != null ? s.latitude : s.gpslati != null ? s.gpslati : s.gpsLat != null ? s.gpsLat : null;
                return toNum(v);
            }

            function normalizeLonLat(lon, lat) {
                // lat/lon 뒤집힘 방어:
                // 정상이라면 lat 절대값<=90, lon 절대값<=180
                if (!isFinite(lon) || !isFinite(lat)) return null;

                // (lat>90 && lon<=90) 이면 뒤집힌 확률 높음
                if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                    var tmp = lon;
                    lon = lat;
                    lat = tmp;
                }

                // 범위 체크(너무 이상하면 버림)
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

                return [lon, lat];
            }

            // ---------------------------------------------------------
            // 1) r.stops 우선
            // ---------------------------------------------------------
            if (Array.isArray(r.stops)) {
                for (var i = 0; i < r.stops.length; i++) {
                    var s = r.stops[i];
                    if (!s) continue;

                    var id = pickId(s);
                    if (!id) continue;

                    var lon = pickLon(s);
                    var lat = pickLat(s);

                    var ll = normalizeLonLat(lon, lat);
                    if (ll) m[id] = ll;
                }
            }

            // ---------------------------------------------------------
            // 2) stopIds + polyline 길이 같으면 매칭 보강
            //    (기존 stop이 없을 때만 채움)
            // ---------------------------------------------------------
            if (Array.isArray(r.stopIds) && Array.isArray(r.polyline) && r.stopIds.length === r.polyline.length) {
                for (var j = 0; j < r.stopIds.length; j++) {
                    var id2 = String(r.stopIds[j] || '').trim();
                    if (!id2) continue;
                    if (m[id2]) continue; // 이미 있으면 건너뜀

                    var p = r.polyline[j] || {};
                    var lon2 = toNum(p.lon != null ? p.lon : p.lng);
                    var lat2 = toNum(p.lat);

                    var ll2 = normalizeLonLat(lon2, lat2);
                    if (ll2) m[id2] = ll2;
                }
            }

            return m;
        }

        // =========================================================
        // ✅✅✅ [ADD] MIXED seg에서 mode/dist/time 안전 추출 유틸 (ES5)
        //  - 서버 필드명이 달라도 최대한 흡수
        // =========================================================
        function pickSegMode(seg) {
            var v =
                seg &&
                (seg.mode != null
                    ? seg.mode
                    : seg.kind != null
                    ? seg.kind
                    : seg.type != null
                    ? seg.type
                    : seg.vehicle != null
                    ? seg.vehicle
                    : seg.edgeType != null
                    ? seg.edgeType
                    : seg.transitType != null
                    ? seg.transitType
                    : seg.transMode != null
                    ? seg.transMode
                    : '');
            v = String(v || '').toUpperCase();

            // 흔한 동의어 정리
            if (v === 'FOOT' || v === 'PED' || v === 'PEDESTRIAN' || v === 'WALKING') v = 'WALK';
            if (v === 'LINK' || v === 'XFER' || v === 'TRANSFER' || v === 'TRANS' || v === 'CONNECTION') v = 'TRANSFER';

            // 비어있으면 WALK 취급(최소 안전)
            if (!v) v = 'WALK';
            return v;
        }

        function pickSegDistM(seg) {
            var d = seg && (seg.distM != null ? seg.distM : seg.distanceM != null ? seg.distanceM : seg.distance != null ? seg.distance : seg.dist != null ? seg.dist : seg.lenM != null ? seg.lenM : seg.meters != null ? seg.meters : null);
            d = Number(d);
            return isFinite(d) ? d : null;
        }

        function pickSegTimeS(seg) {
            var t = seg && (seg.timeS != null ? seg.timeS : seg.diffSec != null ? seg.diffSec : seg.durationS != null ? seg.durationS : seg.duration != null ? seg.duration : seg.time != null ? seg.time : seg.sec != null ? seg.sec : null);
            t = Number(t);
            return isFinite(t) ? t : null;
        }

        // ✅ timeS가 '분'으로 들어오는 케이스를 아주 보수적으로만 보정
        function normalizeTimeMaybeMinutes(timeS, distM) {
            var t = Number(timeS);
            var d = Number(distM);
            if (!isFinite(t) || t < 0) return t;
            if (!isFinite(d) || d < 0) d = 0;

            // dist가 좀 있는데 time이 1~9면 분일 가능성 ↑
            if (d >= 200 && t > 0 && t < 10) return Math.round(t * 60);
            return t;
        }

        // =========================================================
        // ✅✅✅ [ADD] MIXED 세그먼트 Hover 핸들러
        // - segTag === 'mixed-seg' 인 폴리라인(구간)만 hover 팝업 표시
        // - hitTolerance 적용 (선이 잘 잡힘)
        // - map이 재생성되면 자동으로 재바인딩 (1회 바인딩 버그 방지)
        // =========================================================
        var __mixedSegHoverBound = false;
        var __mixedSegHoverBoundMap = null;
        var __mixedSegHoverOverlay = null;
        var __mixedSegHoverEl = null;

        function fmtSecToText(sec) {
            sec = Number(sec);
            if (!isFinite(sec) || sec <= 0) return '-';
            var m = Math.floor(sec / 60);
            var s = Math.floor(sec % 60);
            if (m <= 0) return s + '초';
            return m + '분 ' + s + '초';
        }
        function fmtMeter(m) {
            m = Number(m);
            if (!isFinite(m) || m <= 0) return '-';
            if (m >= 1000) return (m / 1000).toFixed(2) + 'km';
            return Math.round(m) + 'm';
        }
        function modeLabel(modeU) {
            modeU = String(modeU || '').toUpperCase();
            if (modeU === 'BUS') return '🚌 버스';
            if (modeU === 'TRAM') return '🚋 트램';
            if (modeU === 'TRANSFER') return '🔁 환승/연결';
            return '🚶 도보';
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 단일 모드(버스/트램) 세그먼트 Feature 생성 공용 (안전판)
        // - stopCoord: [lon,lat] / [lat,lon] / {lon,lat}/{lng,lat}/{longitude,latitude} 모두 지원
        // - distM/timeS: null 금지 → hover에서 0 되는 문제 차단
        // - segTag='single-seg' 보장
        // =========================================================
        function buildSingleSegFeatures(map, pathArr, stopCoord, stopMeta, modeU, targetSource) {
            if (!map || !Array.isArray(pathArr) || !pathArr.length) return 0;
            if (!targetSource || !targetSource.addFeature) return 0;
            if (!window.ol || !ol.geom || !ol.Feature) return 0;

            modeU = String(modeU || '').toUpperCase() || 'BUS';

            function getFromId(seg) {
                return String((seg && (seg.from ?? seg.fromStopId ?? seg.a ?? seg.start ?? seg.u ?? seg.fromId ?? '')) || '').trim();
            }
            function getToId(seg) {
                return String((seg && (seg.to ?? seg.toStopId ?? seg.b ?? seg.end ?? seg.v ?? seg.toId ?? '')) || '').trim();
            }

            // ✅ stopCoord에서 lon/lat 뽑기 (배열/객체 모두)
            function coordOf(id) {
                id = String(id || '').trim();
                if (!id) return null;

                var c = stopCoord && stopCoord[id];
                if (!c) return null;

                var lon, lat;

                // 1) 배열 [lon,lat] or [lat,lon]
                if (Array.isArray(c) && c.length >= 2) {
                    lon = Number(c[0]);
                    lat = Number(c[1]);
                }
                // 2) 객체 {lon,lat} / {lng,lat} / {longitude,latitude}
                else if (typeof c === 'object') {
                    lon = Number(c.lon != null ? c.lon : c.lng != null ? c.lng : c.longitude != null ? c.longitude : c.x != null ? c.x : NaN);
                    lat = Number(c.lat != null ? c.lat : c.latitude != null ? c.latitude : c.y != null ? c.y : NaN);
                } else {
                    return null;
                }

                if (!isFinite(lon) || !isFinite(lat)) return null;

                // ✅ [lat,lon] 스왑 방어
                if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                    var tmp = lon;
                    lon = lat;
                    lat = tmp;
                }

                // ✅ 정상 범위 체크 (대충)
                if (Math.abs(lat) > 90) return null;
                if (Math.abs(lon) > 200) return null;

                return [lon, lat];
            }

            function nameOf(id) {
                id = String(id || '').trim();
                var m = stopMeta && stopMeta[id];
                if (m && m.name) return String(m.name);
                return id || '(정류장)';
            }

            // ✅ EPSG:4326 -> map projection
            function toMapXY(lon, lat) {
                try {
                    if (typeof lonLatToMapXY === 'function') return lonLatToMapXY(lon, lat);
                } catch (e0) {}

                try {
                    var view = map.getView && map.getView();
                    var proj = (view && view.getProjection && view.getProjection()) || null;
                    if (proj && ol.proj && ol.proj.transform) {
                        return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                    }
                } catch (e1) {}

                // fallback(안전)
                return [Number(lon), Number(lat)];
            }

            // ✅ haversine
            function distanceMeters(lon1, lat1, lon2, lat2) {
                lon1 = Number(lon1);
                lat1 = Number(lat1);
                lon2 = Number(lon2);
                lat2 = Number(lat2);
                if (!isFinite(lon1) || !isFinite(lat1) || !isFinite(lon2) || !isFinite(lat2)) return NaN;

                var R = 6371000;
                var toRad = function (d) {
                    return (d * Math.PI) / 180;
                };
                var dLat = toRad(lat2 - lat1);
                var dLon = toRad(lon2 - lon1);
                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                var d = R * c;
                return isFinite(d) && d > 0 ? d : NaN;
            }

            function speedMpsForMode(mu) {
                mu = String(mu || '').toUpperCase();
                if (mu === 'BUS') return 6.0;
                if (mu === 'TRAM') return 7.0;
                return 1.2;
            }

            // ✅ time 단위(초/분) 판별: dist와 속도로 "그럴듯한 초"로 정규화
            function normalizeTimeSeconds(rawTime, distM, mu) {
                var t = Number(rawTime);
                if (!isFinite(t) || t <= 0) return NaN;

                // dist가 없으면 그냥 seconds로 간주
                distM = Number(distM);
                if (!isFinite(distM) || distM <= 0) return t;

                var sp = speedMpsForMode(mu);
                var expectedSec = distM / sp; // 대략 기대 초

                // ✅ t가 기대치보다 20배 이상 작으면 "분"으로 왔을 가능성
                // 예: expected 300s인데 t=5 → 분(300s)일 가능성 큼
                if (expectedSec > 60 && t > 0 && t < expectedSec / 20) {
                    return Math.round(t * 60);
                }

                // ✅ 반대로 t가 기대치보다 10배 이상 크면 (이상치) 그냥 반환
                return t;
            }

            var made = 0;

            for (var i = 0; i < pathArr.length; i++) {
                var seg = pathArr[i];
                if (!seg) continue;

                var fromId = getFromId(seg);
                var toId = getToId(seg);
                if (!fromId || !toId) continue;

                var A = coordOf(fromId);
                var B = coordOf(toId);
                if (!A || !B) continue;

                var aXY = toMapXY(A[0], A[1]);
                var bXY = toMapXY(B[0], B[1]);
                if (!aXY || !bXY) continue;

                var geom = new ol.geom.LineString([aXY, bXY]);

                // ✅ distM: seg에 있으면 우선, 없으면 haversine
                var distRaw = seg.distM != null ? seg.distM : seg.dist != null ? seg.dist : seg.distanceM != null ? seg.distanceM : seg.distance != null ? seg.distance : NaN;

                var distM = Number(distRaw);
                if (!isFinite(distM) || distM <= 0) distM = distanceMeters(A[0], A[1], B[0], B[1]);
                if (!isFinite(distM) || distM <= 0) continue; // ✅ null/0 넣지 말고 skip

                // ✅ timeS: seg에 있으면 정규화, 없으면 dist/속도
                var timeRaw = seg.timeS != null ? seg.timeS : seg.time != null ? seg.time : seg.durationS != null ? seg.durationS : seg.duration != null ? seg.duration : seg.diffSec != null ? seg.diffSec : NaN;

                var timeS = normalizeTimeSeconds(timeRaw, distM, modeU);
                if (!isFinite(timeS) || timeS <= 0) {
                    var sp = speedMpsForMode(modeU);
                    timeS = Math.max(1, Math.round(distM / sp));
                }

                var fromNm = nameOf(fromId);
                var toNm = nameOf(toId);

                var f = new ol.Feature({ geometry: geom });

                // ✅ hover 필드(절대 null 넣지 않기)
                f.set('segTag', 'single-seg');
                f.set('mode', modeU);
                f.set('fromId', fromId);
                f.set('toId', toId);
                f.set('fromName', fromNm);
                f.set('toName', toNm);
                f.set('distM', distM);
                f.set('timeS', timeS);
                f.set('segIndex', i);
                f.set('title', fromNm + ' → ' + toNm);

                // ✅ 디버그용 raw 보존
                f.set('rawDist', distRaw);
                f.set('rawTime', timeRaw);

                targetSource.addFeature(f);
                made++;
            }

            return made;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] ensureMixedSegmentHoverHandler (최종 안정판)
        // - OL wrapper 환경에서도 확실히 unbind 되도록 handler 함수 저장 방식 사용
        // - closest line pick + layerFilter + _raw guard(이중 확인)
        // - mixed/single 레이어만 hit-test (path 등 차단)
        // =========================================================
        var __mixedSegHoverBound = false;
        var __mixedSegHoverBoundMap = null;

        var __mixedSegHoverOverlay = null;
        var __mixedSegHoverEl = null;

        // ✅ key 방식 + fn 방식 둘 다 대비
        var __mixedSegHoverMoveKey = null;
        var __mixedSegHoverMoveFn = null;

        function ensureMixedSegmentHoverHandler($scope, map) {
            if (!map || !window.ol) return false;

            function _fmtSecToText(sec) {
                sec = Number(sec);
                if (!isFinite(sec) || sec <= 0) return '-';
                var m = Math.floor(sec / 60);
                var s = Math.floor(sec % 60);
                if (m <= 0) return s + '초';
                return m + '분 ' + s + '초';
            }
            function _fmtMeter(m) {
                m = Number(m);
                if (!isFinite(m) || m <= 0) return '-';
                if (m >= 1000) return (m / 1000).toFixed(2) + 'km';
                return Math.round(m) + 'm';
            }
            function _modeLabel(modeU) {
                modeU = String(modeU || '').toUpperCase();
                if (modeU === 'BUS') return '🚌 버스';
                if (modeU === 'TRAM') return '🚋 트램';
                if (modeU === 'TRANSFER') return '🔁 환승/연결';
                return '🚶 도보';
            }

            var fmtSec = typeof fmtSecToText === 'function' ? fmtSecToText : _fmtSecToText;
            var fmtM = typeof fmtMeter === 'function' ? fmtMeter : _fmtMeter;
            var modeLb = typeof modeLabel === 'function' ? modeLabel : _modeLabel;

            // ---------------------------------------------------------
            // ✅ map이 바뀌었으면: 이전 리스너/overlay 해제
            // ---------------------------------------------------------
            if (__mixedSegHoverBound && __mixedSegHoverBoundMap && __mixedSegHoverBoundMap !== map) {
                // 1) 이벤트 해제 (key 방식)
                try {
                    if (__mixedSegHoverMoveKey && ol.Observable && ol.Observable.unByKey) {
                        ol.Observable.unByKey(__mixedSegHoverMoveKey);
                    }
                } catch (e1) {}
                __mixedSegHoverMoveKey = null;

                // 2) 이벤트 해제 (fn 방식)
                try {
                    if (__mixedSegHoverMoveFn && __mixedSegHoverBoundMap.un) {
                        __mixedSegHoverBoundMap.un('pointermove', __mixedSegHoverMoveFn);
                    }
                } catch (e1b) {}
                __mixedSegHoverMoveFn = null;

                // 3) overlay detach
                try {
                    if (__mixedSegHoverOverlay && __mixedSegHoverBoundMap.removeOverlay) {
                        __mixedSegHoverBoundMap.removeOverlay(__mixedSegHoverOverlay);
                    }
                } catch (e2) {}

                __mixedSegHoverBound = false;
                __mixedSegHoverBoundMap = null;
            }

            // ---------------------------------------------------------
            // ✅ overlay 생성/부착
            // ---------------------------------------------------------
            if (!__mixedSegHoverEl) {
                __mixedSegHoverEl = document.createElement('div');
                __mixedSegHoverEl.className = 'mixed-seg-hover-popup';
                __mixedSegHoverEl.style.cssText =
                    'background:rgba(17,24,39,.92);color:#fff;padding:10px 12px;border-radius:10px;' + 'font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.18);' + 'min-width:240px;max-width:340px;pointer-events:none;';

                __mixedSegHoverOverlay = new ol.Overlay({
                    element: __mixedSegHoverEl,
                    offset: [12, 12],
                    positioning: 'bottom-left',
                    stopEvent: false,
                });
            }

            try {
                if (map.addOverlay && __mixedSegHoverOverlay) map.addOverlay(__mixedSegHoverOverlay);
            } catch (e3) {}

            // ✅ 이미 이 map에 바인딩 됐으면 끝
            if (__mixedSegHoverBound && __mixedSegHoverBoundMap === map) return true;

            __mixedSegHoverBound = true;
            __mixedSegHoverBoundMap = map;

            function hide() {
                try {
                    if (__mixedSegHoverOverlay) __mixedSegHoverOverlay.setPosition(undefined);
                } catch (e) {}
            }

            // ✅ 레이어 태그 필터: mixed-* / single-*만 허용
            function isAllowedLayer(layer) {
                // layer가 null로 들어오는 환경도 있으니 허용(대신 segTag/_raw로 걸러짐)
                if (!layer || !layer.get) return true;
                var lt = String(layer.get('tag') || '');
                if (!lt) return true;
                if (lt.indexOf('mixed-') === 0) return true;
                if (lt.indexOf('single-') === 0) return true;
                return false;
            }

            // ✅ _raw guard: get('_raw') OR properties._raw 둘 다 허용
            function hasRawSeg(feature) {
                try {
                    var r1 = feature.get && feature.get('_raw');
                    if (r1 !== undefined && r1 !== null) return true;
                } catch (e1) {}
                try {
                    var p = feature.getProperties ? feature.getProperties() : null;
                    if (p && p._raw !== undefined && p._raw !== null) return true;
                } catch (e2) {}
                return false;
            }

            // ✅✅✅ closest line pick (+ layerFilter + _raw guard)
            function pickClosestLineFeature(pixel, coordinate) {
                var best = null;
                var bestD2 = Infinity;

                map.forEachFeatureAtPixel(
                    pixel,
                    function (feature, layer) {
                        try {
                            if (!feature || !feature.getGeometry || !feature.get) return null;

                            // layerFilter 1차
                            if (!isAllowedLayer(layer)) return null;

                            // segTag 필터
                            var tag = String(feature.get('segTag') || '');
                            if (tag !== 'mixed-seg' && tag !== 'single-seg') return null;

                            // ✅ _raw 없는 건 구간 아님(대부분 전체 path) → 제외
                            if (!hasRawSeg(feature)) return null;

                            var g = feature.getGeometry();
                            var t = g && g.getType ? g.getType() : '';
                            if (t !== 'LineString' && t !== 'MultiLineString') return null;

                            // 가까운 점 거리 비교
                            if (!g || typeof g.getClosestPoint !== 'function') return null;
                            var cp = g.getClosestPoint(coordinate);
                            if (!cp || cp.length < 2) return null;

                            var dx = cp[0] - coordinate[0];
                            var dy = cp[1] - coordinate[1];
                            var d2 = dx * dx + dy * dy;

                            if (d2 < bestD2) {
                                bestD2 = d2;
                                best = feature;
                            }
                        } catch (eIn) {}

                        return null; // ✅ 절대 return feature 하지 말 것
                    },
                    {
                        hitTolerance: 8,
                        layerFilter: function (layer) {
                            return isAllowedLayer(layer);
                        },
                    }
                );

                return best;
            }

            // ---------------------------------------------------------
            // ✅ pointermove 바인딩 (fn 저장해서 확실히 unbind 가능)
            // ---------------------------------------------------------
            __mixedSegHoverMoveFn = function (evt) {
                try {
                    if (evt.dragging) {
                        hide();
                        return;
                    }

                    var tgt = map.getTargetElement && map.getTargetElement();
                    var pixel = map.getEventPixel ? map.getEventPixel(evt.originalEvent) : evt.pixel || null;
                    if (!pixel) {
                        hide();
                        return;
                    }

                    var picked = pickClosestLineFeature(pixel, evt.coordinate);

                    if (!picked) {
                        if (tgt && tgt.style) tgt.style.cursor = '';
                        hide();
                        return;
                    }

                    if (tgt && tgt.style) tgt.style.cursor = 'pointer';

                    var fromName = picked.get('fromName') || picked.get('fromId') || '출발';
                    var toName = picked.get('toName') || picked.get('toId') || '도착';
                    var modeU = picked.get('mode') || '';
                    var distM = picked.get('distM');
                    var timeS = picked.get('timeS');

                    // dist fallback
                    if ((!isFinite(Number(distM)) || Number(distM) <= 0) && picked.getGeometry) {
                        try {
                            var gg = picked.getGeometry();
                            if (gg && typeof gg.getLength === 'function') distM = Math.round(gg.getLength());
                        } catch (e4) {}
                    }

                    // time fallback
                    if (!isFinite(Number(timeS)) || Number(timeS) <= 0) {
                        var sp = 1.2;
                        var mu = String(modeU || '').toUpperCase();
                        if (mu === 'BUS') sp = 6.0;
                        else if (mu === 'TRAM') sp = 7.0;
                        else if (mu === 'TRANSFER') sp = 1.2;

                        if (isFinite(Number(distM)) && Number(distM) > 0 && sp > 0) {
                            timeS = Math.max(1, Math.round(Number(distM) / sp));
                        }
                    }

                    var title = picked.get('title') || fromName + ' → ' + toName;

                    __mixedSegHoverEl.innerHTML =
                        '<div style="font-weight:900;font-size:13px;margin-bottom:6px;">' +
                        title +
                        '</div>' +
                        '<div style="opacity:.95;margin-bottom:6px;">' +
                        modeLb(modeU) +
                        '</div>' +
                        '<div>거리: <b>' +
                        fmtM(distM) +
                        '</b></div>' +
                        '<div>시간: <b>' +
                        fmtSec(timeS) +
                        '</b></div>';

                    __mixedSegHoverOverlay.setPosition(evt.coordinate);
                } catch (err) {
                    hide();
                }
            };

            // ✅ key를 주는 환경이면 key로, 아니면 fn으로라도 붙음
            try {
                __mixedSegHoverMoveKey = map.on && map.on('pointermove', __mixedSegHoverMoveFn);
            } catch (eOn) {
                __mixedSegHoverMoveKey = null;
                try {
                    if (map.on) map.on('pointermove', __mixedSegHoverMoveFn);
                } catch (eOn2) {}
            }

            return true;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] drawMixedSegmentsFromResult (이름/거리 문제 해결 포함 최종)
        // - ✅ stopMeta: 좌표 없어도 name 저장
        // - ✅ stopCoord: 좌표 있을 때만 저장
        // - ✅ from/to id 키 mismatch 방지 위해 normalizeKey 도입
        // =========================================================
        function drawMixedSegmentsFromResult(r) {
            var map = getInnerOlMap();
            if (!map) return false;
            if (!ensureMixedLayers()) return false;

            // ✅ hover 핸들러 (map 바뀌어도 재바인딩됨)
            try {
                ensureMixedSegmentHoverHandler($scope, map);
            } catch (e) {}

            // 단일 경로 레이어는 지워서 겹침 방지
            try {
                if (pathVectorSource) pathVectorSource.clear(true);
            } catch (e1) {}

            // MIXED 레이어 초기화
            try {
                if (mixedBusSource) mixedBusSource.clear(true);
            } catch (e2) {}
            try {
                if (mixedTramSource) mixedTramSource.clear(true);
            } catch (e3) {}
            try {
                if (mixedWalkSource) mixedWalkSource.clear(true);
            } catch (e4) {}
            try {
                if (typeof mixedTransferSource !== 'undefined' && mixedTransferSource) mixedTransferSource.clear(true);
            } catch (e5) {}

            // ✅ MIXED 마커 레이어 초기화
            try {
                if (typeof mixedMarkerSource !== 'undefined' && mixedMarkerSource) mixedMarkerSource.clear(true);
            } catch (e0) {}

            // ✅ 하이라이트 초기화
            try {
                clearMixedHighlight();
            } catch (ehh) {}

            // ---------------------------------------------------------
            // 0) 좌표/이름 맵 구성
            // ---------------------------------------------------------
            var stopCoord = (typeof buildStopCoordMapFromResult === 'function' ? buildStopCoordMapFromResult(r) : {}) || {};
            var stopMeta = {}; // key -> {name, lon, lat}

            // ✅ key normalize (서버가 숫자/문자/공백 섞어서 줄 때 대응)
            function normKey(v) {
                return String(v == null ? '' : v).trim();
            }

            // ✅ stopCoord에도 normKey 적용해서 키가 흔들리지 않게
            (function normalizeStopCoordKeys() {
                try {
                    var n = {};
                    Object.keys(stopCoord || {}).forEach(function (k) {
                        var nk = normKey(k);
                        if (!nk) return;
                        n[nk] = stopCoord[k];
                    });
                    stopCoord = n;
                } catch (e) {}
            })();

            // (A) r.stops 보강  ✅✅✅ (중요 수정)
            if (Array.isArray(r && r.stops)) {
                r.stops.forEach(function (s) {
                    var rawId = s && (s.stopId != null ? s.stopId : s.id != null ? s.id : s.nodeId != null ? s.nodeId : s.nodeid != null ? s.nodeid : '');
                    var id = normKey(rawId);
                    if (!id) return;

                    var nm = normKey(s && (s.name || s.stopNm || s.nodeNm || s.nodenm || s.title));

                    // ✅ 이름은 좌표 없어도 저장 (이게 핵심!)
                    if (!stopMeta[id]) stopMeta[id] = { name: nm || id };

                    // ✅ 좌표는 있을 때만 저장
                    var lat = Number(s && (s.lat != null ? s.lat : s.latitude));
                    var lon = Number(s && (s.lon != null ? s.lon : s.lng != null ? s.lng : s.longitude));

                    if (isFinite(lat) && isFinite(lon)) {
                        stopCoord[id] = [lon, lat];
                        stopMeta[id].lon = lon;
                        stopMeta[id].lat = lat;
                    }
                });
            }

            // (B) stopIds + polyline 길이 같으면 보강
            if (Array.isArray(r && r.stopIds) && Array.isArray(r && r.polyline) && r.stopIds.length === r.polyline.length) {
                for (var i = 0; i < r.stopIds.length; i++) {
                    var id2 = normKey(r.stopIds[i]);
                    var p2 = r.polyline[i] || {};
                    var lat2 = Number(p2.lat);
                    var lon2 = Number(p2.lon);
                    if (!id2) continue;

                    // ✅ 이름은 최소 id라도 저장
                    if (!stopMeta[id2]) stopMeta[id2] = { name: id2 };

                    if (!isFinite(lat2) || !isFinite(lon2)) continue;

                    if (!stopCoord[id2]) stopCoord[id2] = [lon2, lat2];
                    stopMeta[id2].lon = lon2;
                    stopMeta[id2].lat = lat2;
                }
            }

            // (C) TRAM_STOPS 보강
            if (window.TRAM_STOPS && Array.isArray(window.TRAM_STOPS)) {
                window.TRAM_STOPS.forEach(function (t) {
                    var id3 = normKey(t && (t.stopId != null ? t.stopId : t.id != null ? t.id : ''));
                    if (!id3) return;

                    var nm3 = normKey(t && (t.name || t.stopNm || t.nodeNm || t.nodenm));

                    // ✅ 이름은 좌표 없어도 저장
                    if (!stopMeta[id3]) stopMeta[id3] = { name: nm3 || id3 };

                    var lat3 = Number(t && t.lat);
                    var lon3 = Number(t && (t.lon != null ? t.lon : t.lng));

                    if (!isFinite(lat3) || !isFinite(lon3)) return;

                    if (!stopCoord[id3]) stopCoord[id3] = [lon3, lat3];
                    stopMeta[id3].lon = lon3;
                    stopMeta[id3].lat = lat3;
                });
            }

            // ---------------------------------------------------------
            // 1) pathArr 확보
            // ---------------------------------------------------------
            var pathArr = Array.isArray(r && r.path) ? r.path : [];
            if (!pathArr.length) {
                console.warn('[MIXED] r.path empty:', r);
                return false;
            }

            // ---------------------------------------------------------
            // 2) 안전 추출 유틸
            // ---------------------------------------------------------
            function getFromId(seg) {
                return normKey(seg && (seg.from != null ? seg.from : seg.fromStopId != null ? seg.fromStopId : seg.a != null ? seg.a : seg.start != null ? seg.start : seg.u != null ? seg.u : seg.fromId != null ? seg.fromId : ''));
            }
            function getToId(seg) {
                return normKey(seg && (seg.to != null ? seg.to : seg.toStopId != null ? seg.toStopId : seg.b != null ? seg.b : seg.end != null ? seg.end : seg.v != null ? seg.v : seg.toId != null ? seg.toId : ''));
            }
            function getAtId(seg) {
                return normKey(seg && (seg.at != null ? seg.at : seg.nodeId != null ? seg.nodeId : seg.stopId != null ? seg.stopId : seg.id != null ? seg.id : ''));
            }

            // ✅ 좌표 꺼내기 + lat/lon 뒤집힘 방어
            function coordOf(id) {
                id = normKey(id);
                if (!id) return null;

                var c = stopCoord[id];
                if (!c && stopCoord[String(id)]) c = stopCoord[String(id)];
                if (!c) return null;

                var lon = Number(c[0]);
                var lat = Number(c[1]);

                // (가끔 [lat,lon])
                if (isFinite(lon) && isFinite(lat)) {
                    if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                        var tmp = lon;
                        lon = lat;
                        lat = tmp;
                    }
                }

                if (!isFinite(lon) || !isFinite(lat)) return null;
                return [lon, lat];
            }

            function nameOf(id) {
                id = normKey(id);
                if (!id) return '(정류장)';
                var m = stopMeta[id];
                if (m && m.name) return String(m.name);
                return id; // ✅ 최소 id는 보여주기
            }

            // EPSG:4326 -> map proj
            function toMapXY4326(lonLat) {
                var view = map.getView && map.getView();
                var proj = (view && view.getProjection && view.getProjection()) || null;
                if (proj && window.ol && ol.proj && ol.proj.transform) {
                    return ol.proj.transform([lonLat[0], lonLat[1]], 'EPSG:4326', proj);
                }
                return [Number(lonLat[0]), Number(lonLat[1])];
            }

            // ---------------------------------------------------------
            // 2.5) fallback 유틸
            // ---------------------------------------------------------
            function distanceMeters(lon1, lat1, lon2, lat2) {
                lon1 = Number(lon1);
                lat1 = Number(lat1);
                lon2 = Number(lon2);
                lat2 = Number(lat2);
                if (!isFinite(lon1) || !isFinite(lat1) || !isFinite(lon2) || !isFinite(lat2)) return null;

                var R = 6371000;
                var toRad = function (d) {
                    return (d * Math.PI) / 180;
                };
                var dLat = toRad(lat2 - lat1);
                var dLon = toRad(lon2 - lon1);

                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                var d = R * c;
                return isFinite(d) && d > 0 ? d : null;
            }

            function speedMpsForMode(modeUpper) {
                modeUpper = String(modeUpper || '').toUpperCase();
                if (modeUpper === 'BUS') return 6.0;
                if (modeUpper === 'TRAM') return 7.0;
                return 1.2; // WALK/TRANSFER
            }

            // ✅ "분"으로 오는 경우 흡수(필요시)
            function normalizeTimeMaybeMinutes(timeVal, distM, modeU) {
                var t = Number(timeVal);
                if (!isFinite(t) || t <= 0) return null;

                if ((modeU === 'BUS' || modeU === 'TRAM') && t > 0 && t <= 30) return Math.round(t * 60);

                var d = Number(distM);
                if (isFinite(d) && d >= 200 && t > 0 && t < 10) return Math.round(t * 60);

                return t;
            }

            function safePickMode(seg) {
                try {
                    if (typeof pickSegMode === 'function') return String(pickSegMode(seg) || '').toUpperCase();
                } catch (e) {}
                var v = seg && (seg.mode != null ? seg.mode : seg.kind != null ? seg.kind : seg.type != null ? seg.type : seg.vehicle != null ? seg.vehicle : '');
                v = String(v || '')
                    .trim()
                    .toUpperCase();
                if (v === 'B') v = 'BUS';
                if (v === 'T') v = 'TRAM';
                if (v === 'W' || v === 'FOOT' || v === 'PED' || v === 'WALKING') v = 'WALK';
                if (v === 'LINK' || v === 'XFER') v = 'TRANSFER';
                return v || 'WALK';
            }

            function safePickDistM(seg) {
                try {
                    if (typeof pickSegDistM === 'function') return Number(pickSegDistM(seg));
                } catch (e) {}
                var v = seg && (seg.distM != null ? seg.distM : seg.dist != null ? seg.dist : seg.distanceM != null ? seg.distanceM : seg.distance != null ? seg.distance : null);
                v = Number(v);
                return isFinite(v) ? v : null;
            }

            function safePickTimeS(seg) {
                try {
                    if (typeof pickSegTimeS === 'function') return Number(pickSegTimeS(seg));
                } catch (e) {}
                var v = seg && (seg.timeS != null ? seg.timeS : seg.time != null ? seg.time : seg.durationS != null ? seg.durationS : seg.duration != null ? seg.duration : seg.diffSec != null ? seg.diffSec : null);
                v = Number(v);
                return isFinite(v) ? v : null;
            }

            // ---------------------------------------------------------
            // 3) MIXED 세그먼트 Feature 생성 (hover 대상)
            // ---------------------------------------------------------
            var made = 0;

            for (var si = 0; si < pathArr.length; si++) {
                var seg = pathArr[si];
                if (!seg) continue;

                var modeU = safePickMode(seg);
                var fromId = getFromId(seg);
                var toId = getToId(seg);

                // 어떤 서버는 at만 주는 구간 -> 스킵
                if (!fromId || !toId) {
                    var at = getAtId(seg);
                    if (at) continue;
                    continue;
                }

                var A = coordOf(fromId);
                var B = coordOf(toId);
                if (!A || !B) continue;

                var aXY = toMapXY4326(A);
                var bXY = toMapXY4326(B);

                var geom = new ol.geom.LineString([aXY, bXY]);
                var f = new ol.Feature({ geometry: geom });

                // ✅✅✅ [ADD] 원본 seg 저장
                f.set('_raw', seg);

                // ✅ 거리: 서버값 우선, 없으면 haversine fallback
                var distM = safePickDistM(seg);
                if (!isFinite(Number(distM)) || Number(distM) <= 0) distM = distanceMeters(A[0], A[1], B[0], B[1]);
                if (!isFinite(Number(distM)) || Number(distM) <= 0) distM = null;

                // ✅ 시간: 서버값 우선, 없으면 dist/속도 fallback
                var timeS = safePickTimeS(seg);
                if (isFinite(Number(timeS)) && Number(timeS) > 0) {
                    timeS = normalizeTimeMaybeMinutes(timeS, distM, modeU);
                } else {
                    var sp = speedMpsForMode(modeU);
                    timeS = isFinite(Number(distM)) && Number(distM) > 0 && isFinite(sp) && sp > 0 ? Math.max(1, Math.round(Number(distM) / sp)) : null;
                }
                if (!isFinite(Number(timeS)) || Number(timeS) <= 0) timeS = null;

                // ✅ hover가 읽을 필드들
                var fromNm = nameOf(fromId);
                var toNm = nameOf(toId);

                f.set('segTag', 'mixed-seg');
                f.set('mode', modeU);
                f.set('fromId', fromId);
                f.set('toId', toId);
                f.set('fromName', fromNm);
                f.set('toName', toNm);
                f.set('distM', distM);
                f.set('timeS', timeS);
                f.set('segIndex', si);
                f.set('title', fromNm + ' → ' + toNm);

                // ✅ 레이어별 분배
                if (modeU === 'BUS') {
                    mixedBusSource.addFeature(f);
                } else if (modeU === 'TRAM') {
                    mixedTramSource.addFeature(f);
                } else if (modeU === 'TRANSFER') {
                    if (typeof mixedTransferSource !== 'undefined' && mixedTransferSource) mixedTransferSource.addFeature(f);
                    else mixedWalkSource.addFeature(f);
                } else {
                    mixedWalkSource.addFeature(f);
                }

                made++;
            }

            try {
                console.log('[SEG][MIXED] segments made=', made, 'pathArr=', pathArr.length);
            } catch (eLog) {}

            if (made <= 0) {
                console.warn('[MIXED] no segment features made. check stopCoord/ids');
                return false;
            }

            if (map.renderSync) map.renderSync();
            return true;
        }

        // =========================================================
        // ✅ STOPS (정류장 마커) 레이어  (기존 + 필터 레이어 추가)
        // =========================================================
        var stopsVectorSource = null; // = 전체 정류장
        var stopsVectorLayer = null;

        var filteredStopsSource = null; // ✅ 선택 노선 정류장만
        var filteredStopsLayer = null;

        // ✅ nodeId -> Feature 인덱스 (필터링 핵심)
        var stopFeatureById = Object.create(null);

        function ensureStopsLayer() {
            var map = getInnerOlMap();
            if (!map || !window.ol) return false;

            if (!stopsVectorSource) stopsVectorSource = new ol.source.Vector();

            if (!stopsVectorLayer) {
                stopsVectorLayer = new ol.layer.Vector({
                    source: stopsVectorSource,
                    zIndex: 15,
                });

                // ✅ 추가: tag
                try {
                    stopsVectorLayer.set('tag', 'stops');
                } catch (e) {}

                map.addLayer(stopsVectorLayer);
            }

            // ✅ 필터 레이어 추가
            if (!filteredStopsSource) filteredStopsSource = new ol.source.Vector();
            if (!filteredStopsLayer) {
                filteredStopsLayer = new ol.layer.Vector({
                    source: filteredStopsSource,
                    zIndex: 16, // 위에 보이게
                });

                // ✅ 추가: tag (필터도 stops로 취급)
                try {
                    filteredStopsLayer.set('tag', 'stops');
                } catch (e2) {}

                filteredStopsLayer.setVisible(false); // 기본 숨김
                map.addLayer(filteredStopsLayer);
            }

            return true;
        }

        function clearStopsOnMap() {
            if (stopsVectorSource) stopsVectorSource.clear(true);
            if (filteredStopsSource) filteredStopsSource.clear(true);
            stopFeatureById = Object.create(null);

            // 기본 상태: 전체 보이기
            if (stopsVectorLayer) stopsVectorLayer.setVisible(true);
            if (filteredStopsLayer) filteredStopsLayer.setVisible(false);
        }

        function drawStopMarker(lon, lat, color, label, kind, stopId) {
            if (!ensureStopsLayer()) return;

            // ✅ 혹시 stopsVectorSource가 아직 없으면 방어
            if (!stopsVectorSource) return;

            const xy = lonLatToMapXY(lon, lat);
            if (!xy) return;

            const f = new ol.Feature({ geometry: new ol.geom.Point(xy) });

            const isEnd = kind === 'FROM' || kind === 'TO';
            const radius = isEnd ? 9 : 6;

            // ✅ nodeId 저장/인덱싱 (필터링할 때 필요)
            let nodeId = '';
            if (stopId !== undefined && stopId !== null) {
                nodeId = String(stopId).trim();
                // 흔한 쓰레기 값 방지
                if (nodeId === 'undefined' || nodeId === 'null') nodeId = '';
            }

            // ✅ 같은 nodeId가 이미 있으면(중복 정류장 그리기), 필요하면 스킵
            // - 중복이 많으면 성능/가독성 모두 나빠져서 보통 스킵이 더 좋아
            if (nodeId && stopFeatureById[nodeId]) {
                // 기존이 있으면 새로 추가하지 않고 종료 (원하면 주석 처리 가능)
                return;
            }

            if (nodeId) {
                f.set('nodeId', nodeId);
                stopFeatureById[nodeId] = f;
            }

            f.setStyle(
                new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: radius,
                        fill: new ol.style.Fill({ color }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                    }),
                    text: label
                        ? new ol.style.Text({
                              text: String(label),
                              offsetY: -18,
                              padding: [2, 4, 2, 4],
                              backgroundFill: new ol.style.Fill({ color: 'rgba(255,255,255,0.9)' }),
                              backgroundStroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.15)', width: 1 }),
                              font: 'bold 12px sans-serif',
                              fill: new ol.style.Fill({ color: '#111827' }),
                              stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.9)', width: 2 }),
                          })
                        : undefined,
                })
            );

            // ✅ 항상 "전체 레이어"에 쌓는다 (필터는 clone으로 따로 띄움)
            stopsVectorSource.addFeature(f);
        }

        function hideAllPointLayersOnMap() {
            const map = getInnerOlMap();
            if (!map) return;

            const layers = map.getLayers().getArray();
            let hidden = 0;

            layers.forEach(function (lyr) {
                if (!lyr || !lyr.getSource) return;

                // ✅✅✅ route-stops 레이어는 숨기지 않는다 (경로 정류장 마킹용)
                try {
                    const tag = typeof lyr.get === 'function' ? lyr.get('tag') : '';
                    if (tag === 'route-stops') return;
                } catch (e) {}

                // ✅✅✅ (옵션) 전역 변수로 routeStopLayer를 쓰는 경우도 방어
                try {
                    if (typeof routeStopLayer !== 'undefined' && routeStopLayer && lyr === routeStopLayer) return;
                } catch (e2) {}

                const src = lyr.getSource();
                if (!src || !src.getFeatures) return;

                const feats = src.getFeatures();
                if (!feats || !feats.length) return;

                // Point가 대량이면 "정류장 점 레이어"로 보고 숨김
                let pointCount = 0;
                for (let i = 0; i < feats.length; i++) {
                    const g = feats[i] && feats[i].getGeometry && feats[i].getGeometry();
                    const t = g && g.getType && g.getType();
                    if (t === 'Point' || t === 'MultiPoint') pointCount++;
                    if (pointCount >= 50) break; // 50개 이상이면 정류장 점 레이어로 간주
                }

                if (pointCount >= 50) {
                    lyr.setVisible(false);
                    hidden++;
                }
            });

            console.log('[hideAllPointLayersOnMap] hidden layers=', hidden);
        }

        // =========================================================
        // ✅ 필터 적용/해제
        // =========================================================
        function extractRoutePathItems(res) {
            const r = res && (res.data || res);
            const body = r && (r.body || r.response || r.result || r);
            const items = (body && body.items) || (body && body.itemList) || (body && body.list) || (body && body.msgBody && body.msgBody.itemList) || [];
            return Array.isArray(items) ? items : [];
        }
        function getNodeIdFromRouteItem(x) {
            return String(x.nodeid || x.nodeId || x.node_id || x.node || '').trim();
        }

        function applyRouteStopFilter(routeId) {
            // ✅ (중요) 기존 빨간 점이 다른 레이어에 찍힌 경우가 많아서,
            // Point 대량 레이어를 싹 숨겨버린 뒤 우리 레이어만 다시 그림
            try {
                if (typeof hideAllPointLayersOnMap === 'function') hideAllPointLayersOnMap();
            } catch (e) {
                console.warn('[filter] hideAllPointLayersOnMap error:', e);
            }

            if (!ensureStopsLayer()) return;

            const rid = String(routeId || '').trim();
            if (!rid) return;

            console.log('[filter] routeId=', rid);

            // ✅ 우리 stops 레이어는 무조건 보이게
            try {
                if (stopsVectorLayer) stopsVectorLayer.setVisible(true);
                if (filteredStopsLayer) filteredStopsLayer.setVisible(false);
            } catch (e) {}

            // ✅ 1) 기존(우리 레이어) 정류장 전부 제거
            clearStopsOnMap();

            $http
                .get('/api/bus/routePath', { params: { cityCode: CITY_CODE, routeId: rid } })
                .then(function (res) {
                    // ✅ items 추출: extractRoutePathItems 실패 대비 fallback
                    let items = [];
                    try {
                        items = (typeof extractRoutePathItems === 'function' && extractRoutePathItems(res)) || [];
                    } catch (e) {
                        items = [];
                    }

                    // fallback: 흔한 응답 구조들
                    if (!items.length) {
                        const d = res && res.data;
                        if (Array.isArray(d)) items = d;
                        else if (d && Array.isArray(d.items)) items = d.items;
                        else if (d && Array.isArray(d.item)) items = d.item;
                        else if (d && d.response && d.response.body && Array.isArray(d.response.body.items)) items = d.response.body.items;
                        else if (d && d.response && d.response.body && d.response.body.items && Array.isArray(d.response.body.items.item)) items = d.response.body.items.item;
                    }

                    console.log('[filter] routePath items =', items.length);

                    if (!items.length) {
                        console.warn('[filter] routePath empty or extract failed', res && res.data);
                        return;
                    }

                    function getLon(it) {
                        return Number(it.gpslong ?? it.gpsLong ?? it.lon ?? it.lng ?? it.gpsX);
                    }
                    function getLat(it) {
                        return Number(it.gpslati ?? it.gpsLati ?? it.lat ?? it.gpsY);
                    }
                    function getId(it) {
                        return String(it.nodeid || it.nodeId || it.node_id || it.node || '').trim();
                    }
                    function getName(it) {
                        return String(it.nodenm || it.nodeNm || it.name || '').trim();
                    }

                    // ✅ 2) routePath 정류장만 지도에 다시 찍기
                    let drawn = 0;

                    for (let i = 0; i < items.length; i++) {
                        const it = items[i] || {};
                        const nid = getId(it);
                        if (!nid) continue;

                        const lon = getLon(it);
                        const lat = getLat(it);

                        // 좌표가 없으면 그릴 수 없음
                        if (!isFinite(lon) || !isFinite(lat)) continue;

                        const nm = getName(it);

                        let kind = 'MID';
                        if (i === 0) kind = 'FROM';
                        else if (i === items.length - 1) kind = 'TO';

                        let color = 'rgba(59,130,246,0.95)'; // 중간: 파랑
                        let label = '';

                        if (kind === 'FROM') {
                            color = 'rgba(239,68,68,0.95)'; // 출발: 빨강
                            label = nm || nid || '출발';
                        } else if (kind === 'TO') {
                            color = 'rgba(34,197,94,0.95)'; // 도착: 초록
                            label = nm || nid || '도착';
                        }

                        // ✅ stopId(nodeId) 전달
                        drawStopMarker(lon, lat, color, label, kind, nid);
                        drawn++;
                    }

                    console.log('[filter] drawn stops =', drawn);

                    if (drawn === 0) {
                        console.warn('[filter] drawn=0 -> routePath에 좌표가 없거나 필드명이 다름');
                        console.log('[filter] sample item:', items[0]);
                        return;
                    }

                    // ✅ 3) 정류장 범위로 자동 확대
                    const map = getInnerOlMap();
                    if (map && stopsVectorSource) {
                        const extent = stopsVectorSource.getExtent();
                        if (extent && isFinite(extent[0])) {
                            map.getView().fit(extent, { padding: [70, 70, 70, 70], duration: 250 });
                        } else {
                            console.warn('[filter] extent invalid', extent);
                        }
                    }

                    console.log('[filter] done: only route stops are shown');
                })
                .catch(function (err) {
                    console.error('[filter] routePath error', err);
                });
        }

        function clearRouteStopFilter() {
            if (!ensureStopsLayer()) return;
            if (filteredStopsSource) filteredStopsSource.clear(true);
            if (filteredStopsLayer) filteredStopsLayer.setVisible(false);
            if (stopsVectorLayer) stopsVectorLayer.setVisible(true);
        }

        function drawStopsFromServer(stops, fromStopId, toStopId) {
            clearStopsOnMap();
            if (!Array.isArray(stops) || stops.length === 0) return;

            const fromId = String(fromStopId || '').trim();
            const toId = String(toStopId || '').trim();

            for (let i = 0; i < stops.length; i++) {
                const s = stops[i] || {};

                // ✅ 핵심: nodeId/stopId 필드명 변형 흡수
                const stopId = String(s.nodeId || s.nodeid || s.node_id || s.stopId || s.stopid || s.id || '').trim();

                const name = String(s.name || s.stopNm || s.nodenm || '').trim();
                const lat = Number(s.lat ?? s.gpslati);
                const lon = Number(s.lon ?? s.gpslong);

                if (!stopId) continue; // ✅ id 없으면 필터 불가
                if (!isFinite(lat) || !isFinite(lon)) continue;

                let kind = 'MID';
                if (fromId && stopId === fromId) kind = 'FROM';
                else if (toId && stopId === toId) kind = 'TO';
                else if (i === 0) kind = 'FROM';
                else if (i === stops.length - 1) kind = 'TO';

                let color = 'rgba(59,130,246,0.95)';
                let label = '';

                if (kind === 'FROM') {
                    color = 'rgba(239,68,68,0.95)';
                    label = name || stopId || '출발';
                } else if (kind === 'TO') {
                    color = 'rgba(34,197,94,0.95)';
                    label = name || stopId || '도착';
                }

                // ✅ 핵심: 마지막 인자로 stopId(nodeId)를 넘겨서 인덱싱되게 해야 함
                drawStopMarker(lon, lat, color, label, kind, stopId);
            }

            const map = getInnerOlMap();
            if (map && map.renderSync) map.renderSync();
        }

        // =========================================================
        // ✅ WALK (도보 점선) 레이어
        // =========================================================
        let walkVectorSource = null;
        let walkVectorLayer = null;

        // ✅ 점선 스타일은 재사용
        const WALK_STYLE = new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(0,0,0,0.95)',
                width: 6,
                lineDash: [10, 10],
                lineCap: 'round',
                lineJoin: 'round',
            }),
        });

        function ensureWalkLayer() {
            const map = getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style || !ol.geom) return false;

            if (!walkVectorSource) walkVectorSource = new ol.source.Vector();

            if (!walkVectorLayer) {
                walkVectorLayer = new ol.layer.Vector({
                    source: walkVectorSource,
                    style: WALK_STYLE,
                    renderBuffer: 256,
                    updateWhileAnimating: true,
                    updateWhileInteracting: true,
                    declutter: false,
                });

                // ✅ 추가: tag
                try {
                    walkVectorLayer.set('tag', 'walk');
                } catch (e) {}

                map.addLayer(walkVectorLayer);
            } else {
                if (walkVectorLayer.getSource && walkVectorLayer.getSource() !== walkVectorSource) {
                    walkVectorLayer.setSource(walkVectorSource);
                }
                walkVectorLayer.setStyle(WALK_STYLE);
            }

            walkVectorLayer.setZIndex(9999);
            return true;
        }

        function clearWalkOnMap() {
            if (walkVectorSource) walkVectorSource.clear(true);
        }

        // ✅ drawWalkDashed: clear는 밖에서, 여기선 feature만 추가
        function drawWalkDashed(lonLatPairs) {
            if (!ensureWalkLayer()) return false;
            if (!Array.isArray(lonLatPairs) || lonLatPairs.length < 2) return false;

            const a = lonLatPairs[0];
            const b = lonLatPairs[lonLatPairs.length - 1];
            if (!a || !b) return false;

            const lon1 = Number(a[0]),
                lat1 = Number(a[1]);
            const lon2 = Number(b[0]),
                lat2 = Number(b[1]);
            if (!isFinite(lon1) || !isFinite(lat1) || !isFinite(lon2) || !isFinite(lat2)) return false;

            // ✅ A안 핵심: 너무 가까우면(거의 0m) 점선은 아예 그리지 않음
            const dMeters = distanceMeters(lon1, lat1, lon2, lat2);
            const MIN_DRAW_M = 20; // ✅ 임계값: 20m 미만은 생략 (원하면 10~30 조절)
            if (dMeters < MIN_DRAW_M) {
                // console.log('[walk] skip (too close):', dMeters);
                return false;
            }

            // ✅ 현재 지도 projection으로 변환
            const p1 = lonLatToMapXY(lon1, lat1);
            const p2 = lonLatToMapXY(lon2, lat2);
            if (!p1 || !p2) return false;

            const line = new ol.geom.LineString([p1, p2]);
            const f = new ol.Feature({ geometry: line });
            walkVectorSource.addFeature(f);

            const map = getInnerOlMap();
            if (map && map.renderSync) map.renderSync();

            return true;
        }

        // =========================================================
        // ✅✅✅ [REAL] 최단경로 API 호출 함수
        //  - 백엔드: GET /api/path/shortest
        //  - params: cityCode, fromStopId, toStopId, mode, weight
        // =========================================================
        // ✅ 최단경로 호출(서버 응답 정규화 + 에러 메시지 정리)
        // =========================================================
        function fetchShortestPathReal(params) {
            const p = angular.copy(params || {});

            // ----------------------------
            // 1) mode / weight 정규화
            // ----------------------------
            const rawMode = String(p.mode || 'MIXED')
                .toUpperCase()
                .trim();
            const rawWeight = String(p.weight || 'DIST')
                .toUpperCase()
                .trim();

            let mode = rawMode;
            if (mode === 'MIXED') mode = 'BUS_TRAM'; // ✅ 가장 안전
            if (mode !== 'BUS' && mode !== 'TRAM' && mode !== 'BUS_TRAM' && mode !== 'MIXED') {
                mode = 'BUS_TRAM';
            }

            let weight = rawWeight;
            if (weight !== 'DIST' && weight !== 'TIME') weight = 'DIST';

            p.mode = mode;
            p.weight = weight;

            // ----------------------------
            // 2) from/to 키 호환 (StopId 우선)
            // ----------------------------
            if (p.fromStopId && !p.fromNodeId) p.fromNodeId = p.fromStopId;
            if (p.toStopId && !p.toNodeId) p.toNodeId = p.toStopId;

            // ----------------------------
            // 3) 타입 힌트(선택)
            // ----------------------------
            function isTramId(id) {
                return /^\d+$/.test(String(id || '').trim());
            }
            if (!p.fromType && p.fromStopId) p.fromType = isTramId(p.fromStopId) ? 'TRAM' : 'BUS';
            if (!p.toType && p.toStopId) p.toType = isTramId(p.toStopId) ? 'TRAM' : 'BUS';

            // ----------------------------
            // 4) 요청
            // ----------------------------
            return $http
                .get('/api/path/shortest', { params: p })
                .then(function (res) {
                    const data = (res && res.data) || {};

                    if (data.found === false) {
                        const msg = data.message || data.error || '경로를 찾지 못했습니다.';
                        return $q.reject(new Error(msg));
                    }

                    const dist = Number(data.totalDistM ?? data.totalDistanceM ?? data.totalDist ?? data.totalDistance ?? 0);

                    const time = Number(data.totalTimeS ?? data.totalTimeSec ?? data.totalTimeSeconds ?? data.totalTime ?? 0);

                    if (!isFinite(dist) && !isFinite(time)) {
                        const msg = data.message || data.error || '최단경로 응답 형식이 올바르지 않습니다.';
                        return $q.reject(new Error(msg));
                    }

                    data.totalDistM = isFinite(dist) ? dist : Number(data.totalDistM || 0);
                    data.totalTimeS = isFinite(time) ? time : Number(data.totalTimeS || 0);

                    data.totalTimeSec = data.totalTimeS;

                    res.data = data;
                    return res;
                })
                .catch(function (err) {
                    const resp = err && err.data ? err.data : null;
                    const msg = (resp && (resp.message || resp.error)) || (err && err.message) || '서버 오류';

                    return $q.reject(new Error(msg));
                });
        }

        // ✅ 거리(m) 계산
        function haversineM(lat1, lon1, lat2, lon2) {
            function toRad(x) {
                return (x * Math.PI) / 180;
            }
            var R = 6371000;
            var dLat = toRad(lat2 - lat1);
            var dLon = toRad(lon2 - lon1);
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // ✅ TRAM 속도(25km/h 정도) - 필요시 조절
        var TRAM_MPS = (25 * 1000) / 3600;

        // ✅ 그래프에 엣지 추가
        function addEdge(graph, fromId, toId, distM, mode) {
            if (!graph[fromId]) graph[fromId] = [];
            graph[fromId].push({
                to: toId,
                distM: distM,
                timeS: mode === 'TRAM' ? Math.round(distM / TRAM_MPS) : null,
                mode: mode,
            });
        }

        // ✅ TRAM 정류장 맵
        function buildTramStopMap() {
            var list = window.TRAM_STOPS || [];
            var m = {};
            list.forEach(function (s) {
                m[String(s.id)] = s;
            });
            return m;
        }

        // ✅ TRAM_SECTIONS(정류장 순서)로 TRAM↔TRAM 엣지 생성
        function addTramEdgesToGraph(graph) {
            var stopMap = buildTramStopMap();
            var sections = window.TRAM_SECTIONS || {};

            Object.keys(sections).forEach(function (k) {
                var seq = sections[k];
                if (!Array.isArray(seq) || seq.length < 2) return;

                for (var i = 0; i < seq.length - 1; i++) {
                    var aId = String(seq[i]);
                    var bId = String(seq[i + 1]);
                    var A = stopMap[aId];
                    var B = stopMap[bId];
                    if (!A || !B) continue;

                    var d = haversineM(A.lat, A.lon, B.lat, B.lon);

                    addEdge(graph, aId, bId, d, 'TRAM');
                    addEdge(graph, bId, aId, d, 'TRAM');
                }
            });
        }

        // =========================================================
        // ✅ 초기값 (컨트롤러 초기화 위치 어딘가에 1번만)
        // =========================================================
        $scope.pathPolylineReady = false;
        $scope.pathPolylineFeature = null;
        $scope.pathPolylineExtent = null;

        // =========================================================
        // ✅✅✅ [ADD] "경로 정류장만" 표시 레이어 (route-stops)
        //  - 출발(FROM)=초록, 도착(TO)=빨강
        //  - 나머지: BUS=파랑, TRAM=보라
        //  - 정류장 이름(label) 표시
        // =========================================================
        var routeStopSource = null;
        var routeStopLayer = null;

        function ensureRouteStopLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style || !ol.geom) return false;

            if (!routeStopSource) routeStopSource = new ol.source.Vector();

            if (!routeStopLayer) {
                routeStopLayer = new ol.layer.Vector({
                    source: routeStopSource,
                    zIndex: 990,
                    style: function (feature) {
                        var mode = String(feature.get('mode') || 'BUS').toUpperCase();
                        var role = String(feature.get('role') || '').toUpperCase(); // FROM / TO / ''

                        // ✅ 기본 색: TRAM=보라, BUS=파랑
                        var color = mode === 'TRAM' ? '#a855f7' : '#2563eb';

                        // ✅ 출발/도착은 role이 우선
                        if (role === 'FROM') color = '#22c55e'; // 초록
                        else if (role === 'TO') color = '#ef4444'; // 빨강

                        var label = String(feature.get('label') || '');

                        return new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: role ? 7 : 6, // 출발/도착은 조금 크게
                                fill: new ol.style.Fill({ color: color }),
                                stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.95)', width: 2 }),
                            }),
                            text: new ol.style.Text({
                                text: label,
                                offsetY: -14,
                                font: '12px sans-serif',
                                fill: new ol.style.Fill({ color: '#111827' }),
                                stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
                            }),
                        });
                    },
                });

                routeStopLayer.set('tag', 'route-stops');
                map.addLayer(routeStopLayer);
            }

            // ✅ 혹시 다른 로직에서 숨겨놨으면 강제로 보이게
            try {
                routeStopLayer.setVisible(true);
            } catch (e) {}

            return true;
        }

        function clearRouteStopsOnly() {
            try {
                if (routeStopSource) routeStopSource.clear(true);
            } catch (e) {}
        }

        // =========================================================
        // ✅✅✅ [ADD] "정류장 사이 구간" 표시 레이어 (route-segs)
        //  - 각 구간을 Feature(LineString)로 따로 만들어서 hover hit-test 용도로 씀
        //  - feature props: fromId, toId, fromName, toName, distM, timeS, mode
        // =========================================================
        var routeSegSource = null;
        var routeSegLayer = null;

        var __routeSegHoverBound = false;
        var __routeSegHoverOverlay = null;
        var __routeSegHoverEl = null;

        function ensureRouteSegLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style || !ol.geom) return false;

            if (!routeSegSource) routeSegSource = new ol.source.Vector();

            if (!routeSegLayer) {
                routeSegLayer = new ol.layer.Vector({
                    source: routeSegSource,
                    zIndex: 1190, // path 위에 (마커보다 아래여도 됨)
                    style: function (f) {
                        // ✅ 눈에 띄는 선을 원하면 색/두께 조절 가능
                        // 지금은 "hover hit"용이라 기본은 거의 안 보이게 + 넓은 stroke로 hit 잘되게
                        var mode = String(f.get('mode') || 'BUS').toUpperCase();
                        var color = mode === 'TRAM' ? 'rgba(168,85,247,0.35)' : 'rgba(37,99,235,0.35)';

                        return new ol.style.Style({
                            stroke: new ol.style.Stroke({
                                color: color,
                                width: 10, // ✅ hit 잘되게 넓게
                                lineCap: 'round',
                                lineJoin: 'round',
                            }),
                        });
                    },
                });
                routeSegLayer.set('tag', 'route-segs');
                map.addLayer(routeSegLayer);
            }

            try {
                routeSegLayer.setVisible(true);
            } catch (e) {}
            ensureRouteSegHover(map);

            return true;
        }

        function clearRouteSegsOnly() {
            try {
                if (routeSegSource) routeSegSource.clear(true);
            } catch (e) {}
        }

        // =========================================================
        // ✅✅✅ [ADD] Hover Overlay (툴팁) - pointermove 1회 바인딩
        // =========================================================
        function ensureRouteSegHover(map) {
            if (__routeSegHoverBound) return true;
            if (!map) return false;

            // overlay DOM
            __routeSegHoverEl = document.createElement('div');
            __routeSegHoverEl.className = 'seg-hover';
            __routeSegHoverEl.style.cssText =
                'position:absolute; background:rgba(17,24,39,0.92); color:#fff; padding:8px 10px; border-radius:10px;' +
                'font-size:12px; line-height:1.25; white-space:nowrap; box-shadow:0 8px 20px rgba(0,0,0,0.25);' +
                'transform:translate(-50%,-110%); pointer-events:none; display:none; z-index:9999;';

            __routeSegHoverOverlay = new ol.Overlay({
                element: __routeSegHoverEl,
                offset: [0, 0],
                positioning: 'bottom-center',
                stopEvent: false,
            });
            map.addOverlay(__routeSegHoverOverlay);

            function fmtM(m) {
                m = Number(m || 0);
                if (!isFinite(m) || m <= 0) return '0m';
                if (m >= 1000) return (m / 1000).toFixed(2) + 'km';
                return Math.round(m) + 'm';
            }
            function fmtT(s) {
                s = Number(s || 0);
                if (!isFinite(s) || s <= 0) return '0초';
                var mm = Math.floor(s / 60);
                var ss = Math.round(s % 60);
                if (mm <= 0) return ss + '초';
                return mm + '분 ' + ss + '초';
            }

            map.on('pointermove', function (evt) {
                if (evt.dragging) return;

                var hit = map.forEachFeatureAtPixel(
                    evt.pixel,
                    function (feature, layer) {
                        // ✅ route-segs 레이어만 반응
                        var tag = layer && layer.get && layer.get('tag');
                        if (tag === 'route-segs') return { f: feature, layer: layer };
                        return null;
                    },
                    {
                        hitTolerance: 6, // 약간 관대하게
                    }
                );

                if (!hit || !hit.f) {
                    __routeSegHoverEl.style.display = 'none';
                    return;
                }

                var f = hit.f;

                var fromName = String(f.get('fromName') || f.get('fromId') || '');
                var toName = String(f.get('toName') || f.get('toId') || '');
                var distM = Number(f.get('distM') || 0);
                var timeS = Number(f.get('timeS') || 0);

                __routeSegHoverEl.innerHTML =
                    '<div style="font-weight:700; margin-bottom:4px;">' + fromName + ' → ' + toName + '</div>' + '<div style="opacity:0.9;">거리: <b>' + fmtM(distM) + '</b></div>' + '<div style="opacity:0.9;">시간: <b>' + fmtT(timeS) + '</b></div>';

                __routeSegHoverOverlay.setPosition(evt.coordinate);
                __routeSegHoverEl.style.display = 'block';
            });

            __routeSegHoverBound = true;
            return true;
        }

        // ✅ r.stops 기반: stopId -> mapXY(지도 좌표) 맵 만들기
        function buildStopCoordMapFromServerStops(stops) {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !window.ol || !ol.proj) return {};

            var view = map.getView && map.getView();
            var proj = (view && view.getProjection && view.getProjection()) || null;
            if (!proj) return {};

            function pickId(s) {
                return String((s && (s.stopId || s.nodeId || s.nodeid || s.id || s.stop_id)) || '').trim();
            }
            function pickLon(s) {
                return Number(s && (s.lon != null ? s.lon : s.gpslong != null ? s.gpslong : s.gpsLong != null ? s.gpsLong : s.lng));
            }
            function pickLat(s) {
                return Number(s && (s.lat != null ? s.lat : s.gpslati != null ? s.gpslati : s.gpsLat != null ? s.gpsLat : s.latitude));
            }

            var out = {};
            var arr = Array.isArray(stops) ? stops : [];
            for (var i = 0; i < arr.length; i++) {
                var s = arr[i] || {};
                var id = pickId(s);
                if (!id) continue;

                var lon = pickLon(s);
                var lat = pickLat(s);
                if (!isFinite(lon) || !isFinite(lat)) continue;

                try {
                    out[id] = ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                } catch (e) {}
            }
            return out;
        }

        function buildStopIdsFromStops(stops) {
            var arr = Array.isArray(stops) ? stops : [];
            var out = [];
            for (var i = 0; i < arr.length; i++) {
                var s = arr[i] || {};
                var id = String(s.stopId || s.nodeId || s.nodeid || s.id || s.stop_id || '').trim();
                if (!id) continue;
                out.push(id);
            }
            return out;
        }

        function buildStopLabelMapFromServerStops(stops) {
            var m = {};
            var arr = Array.isArray(stops) ? stops : [];
            for (var i = 0; i < arr.length; i++) {
                var s = arr[i] || {};
                var id = String(s.stopId != null ? s.stopId : s.stop_id != null ? s.stop_id : s.nodeid != null ? s.nodeid : s.nodeId != null ? s.nodeId : s.id != null ? s.id : '').trim();
                if (!id) continue;

                var name = String(s.nodenm != null ? s.nodenm : s.nodeNm != null ? s.nodeNm : s.name != null ? s.name : '').trim();

                if (name) m[id] = name;
            }
            return m;
        }

        // ✅ stopId -> 표시 라벨(정류장명) 맵
        function buildStopLabelMapFromServerStops(stops) {
            var m = {};
            var arr = Array.isArray(stops) ? stops : [];
            for (var i = 0; i < arr.length; i++) {
                var s = arr[i] || {};
                var id = String(s.stopId ?? s.nodeId ?? s.nodeid ?? s.id ?? '').trim();
                if (!id) continue;
                var name = String(s.name ?? s.nodenm ?? s.nodeNm ?? '').trim();
                if (!name) name = id;
                m[id] = name;
            }
            return m;
        }

        function drawRouteStopsOnly(stopIds, mode, stopCoordMap, labelMap, fromId, toId) {
            if (!ensureRouteStopLayer()) return false;

            clearRouteStopsOnly();

            var ids = Array.isArray(stopIds) ? stopIds : [];
            if (!ids.length) return false;

            var mapXY = stopCoordMap || {};
            var labels = labelMap || {};
            var mm = String(mode || 'BUS').toUpperCase();

            var fromKey = String(fromId || '').trim();
            var toKey = String(toId || '').trim();

            for (var i = 0; i < ids.length; i++) {
                var id = String(ids[i] || '').trim();
                if (!id) continue;

                var xy = mapXY[id];
                if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) continue;

                var f = new ol.Feature({
                    geometry: new ol.geom.Point(xy),
                });

                f.set('stopId', id);
                f.set('mode', mm);

                // ✅ role: 출발/도착 색 우선권
                if (fromKey && id === fromKey) f.set('role', 'FROM');
                else if (toKey && id === toKey) f.set('role', 'TO');
                else f.set('role', '');

                // ✅ label: 정류장 이름 표시
                var lb = String(labels[id] || '').trim();
                if (!lb) lb = id; // 이름 없으면 id 표시(원하면 ''로 바꿔도 됨)
                f.set('label', lb);

                routeStopSource.addFeature(f);
            }

            return true;
        }

        // =========================================================
        // ✅✅✅ [ADD] 정류장 사이 "구간" 생성 (stopIds + stopCoordMap + labelMap)
        // - distM/timeS는 우선 feature에 넣고, 없으면 거리로 time 추정
        // =========================================================
        function drawRouteSegsOnly(stopIds, mode, stopCoordMap, labelMap, pathArr) {
            if (!ensureRouteSegLayer()) return false;
            clearRouteSegsOnly();

            var ids = Array.isArray(stopIds) ? stopIds : [];
            if (ids.length < 2) return false;

            var mapXY = stopCoordMap || {};
            var lm = labelMap || {};
            var mm = String(mode || 'BUS').toUpperCase();

            // ✅ 서버 pathArr에서 구간별 dist/time이 오면 최대한 흡수
            // (필드명 변형 대비)
            function pickSeg(a, b) {
                if (!Array.isArray(pathArr)) return null;
                for (var i = 0; i < pathArr.length; i++) {
                    var s = pathArr[i] || {};
                    var from = String(s.from ?? s.fromStopId ?? s.a ?? s.start ?? '').trim();
                    var to = String(s.to ?? s.toStopId ?? s.b ?? s.end ?? '').trim();
                    if (from === a && to === b) return s;
                }
                return null;
            }
            function pickDistM(s) {
                if (!s) return 0;
                var v = s.distM ?? s.distanceM ?? s.dist ?? s.distance ?? 0;
                v = Number(v);
                return isFinite(v) ? v : 0;
            }
            function pickTimeS(s) {
                if (!s) return 0;
                var v = s.timeS ?? s.timeSec ?? s.sec ?? s.diffSec ?? s.durationSec ?? 0;
                v = Number(v);
                return isFinite(v) ? v : 0;
            }

            // ✅ fallback 속도(서버 time 없을 때)
            var SPEED_MPS = mm === 'TRAM' ? 6.94 : 5.0; // 버스는 대충(서버 데이터 있으면 그걸 씀)

            for (var i = 0; i < ids.length - 1; i++) {
                var aId = String(ids[i] || '').trim();
                var bId = String(ids[i + 1] || '').trim();
                if (!aId || !bId) continue;

                var aXY = mapXY[aId];
                var bXY = mapXY[bId];
                if (!aXY || !bXY || !isFinite(aXY[0]) || !isFinite(aXY[1]) || !isFinite(bXY[0]) || !isFinite(bXY[1])) continue;

                var segObj = pickSeg(aId, bId);
                var distM = pickDistM(segObj);
                var timeS = pickTimeS(segObj);

                // dist/time 없으면 geometry 길이로 대충 계산
                if (!(distM > 0)) {
                    try {
                        var line = new ol.geom.LineString([aXY, bXY]);
                        distM = line.getLength(); // 현재 projection 단위가 meter 계열이면 대략 맞음
                    } catch (e) {
                        distM = 0;
                    }
                }
                if (!(timeS > 0) && distM > 0 && SPEED_MPS > 0) {
                    timeS = Math.max(1, Math.round(distM / SPEED_MPS));
                }

                var f = new ol.Feature({
                    geometry: new ol.geom.LineString([aXY, bXY]),
                });
                f.set('mode', mm);
                f.set('fromId', aId);
                f.set('toId', bId);
                f.set('fromName', String(lm[aId] || aId));
                f.set('toName', String(lm[bId] || bId));
                f.set('distM', distM);
                f.set('timeS', timeS);

                routeSegSource.addFeature(f);
            }

            return true;
        }

        // =========================================================
        // ✅✅✅ [ADD] 자동 수집 보장 (destroy 이후 재진입 시 재시작)
        // - 프로젝트마다 "1회 수집" 함수명이 다르니까 여러 후보를 자동 탐색
        // =========================================================
        function runCollectOnceAutoDetect() {
            try {
                // ✅ 아래 후보 중 프로젝트에 존재하는걸 자동으로 실행
                if (typeof runAutoCollectOnce === 'function') return runAutoCollectOnce();
                if (typeof pollArrivalsAndSave === 'function') return pollArrivalsAndSave();
                if (typeof collectOnce === 'function') return collectOnce();
                if (typeof collectArrivalsOnce === 'function') return collectArrivalsOnce();
                if (typeof collectAndSaveOnce === 'function') return collectAndSaveOnce();

                // 마지막 fallback: 이름 못 찾으면 경고
                console.warn('[collect] no collect-once function found (runAutoCollectOnce / pollArrivalsAndSave / collectOnce ...)');
            } catch (e) {
                console.warn('[collect] runCollectOnceAutoDetect error', e);
            }
        }

        function ensureCollectRunning() {
            try {
                // collecting 기본값 ON
                if ($scope.collecting == null) $scope.collecting = true;

                // 이미 타이머 있으면 OK
                if (collectTimer) return;

                // 폴링/수집 주기
                var ms = typeof POLL_MS !== 'undefined' && POLL_MS ? POLL_MS : 10000;

                // 즉시 1회 실행 + 주기 실행
                runCollectOnceAutoDetect();
                collectTimer = $interval(function () {
                    if ($scope.collecting === false) return;
                    runCollectOnceAutoDetect();
                }, ms);

                console.log('[collect] started', { ms: ms });
            } catch (e2) {
                console.warn('[collect] ensureCollectRunning fail', e2);
            }
        }

        // =========================================================
        // ✅✅✅ [REAL] findShortestPath
        // =========================================================
        $scope.findShortestPath = function () {
            // =========================
            // ✅ 공통 안전 유틸
            // =========================
            function safeSetPathStatus(level, msg) {
                try {
                    if (typeof setPathStatus === 'function') return setPathStatus(level, msg);
                    console.log('[PathStatus][' + level + ']', msg);
                } catch (e) {
                    console.log('[PathStatus][' + level + ']', msg);
                }
            }

            function safeClearAll() {
                try {
                    if (typeof clearPathOnMap === 'function') clearPathOnMap();
                } catch (e) {}
                try {
                    if (typeof clearStopsOnMap === 'function') clearStopsOnMap();
                } catch (e) {}
                try {
                    if (typeof clearWalkOnMap === 'function') clearWalkOnMap();
                } catch (e) {}

                // ✅ 추가: 경로 정류장 레이어도 클리어
                try {
                    clearRouteStopsOnly();
                } catch (e2) {}
            }

            // =========================
            // ✅ 서버 필드명 변형 흡수 + fallback 계산용 헬퍼들
            // =========================
            function pickTransfersCount(r) {
                if (!r) return 0;

                var v =
                    r.transfersCount != null
                        ? r.transfersCount
                        : r.transferCount != null
                        ? r.transferCount
                        : r.transferCnt != null
                        ? r.transferCnt
                        : r.transCnt != null
                        ? r.transCnt
                        : r.transfers != null
                        ? r.transfers
                        : r.transfer != null
                        ? r.transfer
                        : 0;

                var n = Number(v);
                return isFinite(n) ? n : 0;
            }

            function computeTransfersFromPath(pathArr) {
                if (!Array.isArray(pathArr) || pathArr.length < 2) return 0;

                function pickMode(x) {
                    var v = x && (x.mode != null ? x.mode : x.kind != null ? x.kind : x.type != null ? x.type : x.vehicle != null ? x.vehicle : x.edgeType != null ? x.edgeType : x.transitType != null ? x.transitType : '');
                    return String(v || '').toUpperCase();
                }

                var prev = pickMode(pathArr[0]);
                var transfers = 0;

                for (var i = 1; i < pathArr.length; i++) {
                    var cur = pickMode(pathArr[i]);
                    if (cur && prev && cur !== prev) transfers++;
                    if (cur) prev = cur;
                }
                return transfers;
            }

            function distanceMeters(lon1, lat1, lon2, lat2) {
                var R = 6371000;
                function toRad(d) {
                    return (d * Math.PI) / 180;
                }

                var dLat = toRad(lat2 - lat1);
                var dLon = toRad(lon2 - lon1);

                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            var WALK_SPEED_MPS = 1.25;
            var TRAM_SPEED_MPS = 6.94;

            // =========================================================
            // ✅ TRAM 전용 계산부
            // =========================================================
            function pickStopId(s) {
                if (!s) return '';
                var v = s.stopId != null ? s.stopId : s.stop_id != null ? s.stop_id : s.nodeid != null ? s.nodeid : s.nodeId != null ? s.nodeId : s.id != null ? s.id : '';
                return String(v || '').trim();
            }
            function pickStopName(s) {
                if (!s) return '';
                var v = s.name != null ? s.name : s.nodenm != null ? s.nodenm : s.nodeNm != null ? s.nodeNm : '';
                return String(v || '').trim();
            }
            function pickLonLat(s) {
                if (!s) return null;
                var lon = Number(s.lon != null ? s.lon : s.gpslong != null ? s.gpslong : s.gpsLong != null ? s.gpsLong : s.lng != null ? s.lng : undefined);
                var lat = Number(s.lat != null ? s.lat : s.gpslati != null ? s.gpslati : s.gpsLat != null ? s.gpsLat : undefined);
                if (!isFinite(lon) || !isFinite(lat)) return null;
                return [lon, lat];
            }

            function buildTramStopInfoMap() {
                var m = {};

                var arr = window.TRAM_STOPS || window.tramStops || [];
                if (Array.isArray(arr)) {
                    arr.forEach(function (s) {
                        var id = pickStopId(s);
                        var ll = pickLonLat(s);
                        var name = pickStopName(s);
                        if (id && ll) m[id] = { id: id, lon: ll[0], lat: ll[1], name: name || id };
                    });
                }

                var raw = window.TRAM_ROUTE_FULL_HD || [];
                if (Array.isArray(raw)) {
                    raw.forEach(function (p) {
                        if (!p || p.type !== 'station') return;
                        var id = String((p.id != null ? p.id : p.stopId != null ? p.stopId : '') || '').trim();
                        if (!id) return;

                        var lon = Number(p.lon != null ? p.lon : p.lng);
                        var lat = Number(p.lat);
                        var name = String(p.name || '').trim();

                        if ((!m[id] || !isFinite(m[id].lon) || !isFinite(m[id].lat)) && isFinite(lon) && isFinite(lat)) {
                            m[id] = { id: id, lon: lon, lat: lat, name: name || id };
                        }
                    });
                }

                return m;
            }

            function getTramStationSequence() {
                var raw = window.TRAM_ROUTE_FULL_HD || [];
                var seq = [];
                if (!Array.isArray(raw)) return seq;

                for (var i = 0; i < raw.length; i++) {
                    var p = raw[i];
                    if (!p || p.type !== 'station') continue;
                    var id = String((p.id != null ? p.id : p.stopId != null ? p.stopId : '') || '').trim();
                    if (!id) continue;
                    if (seq.length && seq[seq.length - 1] === id) continue;
                    seq.push(id);
                }
                return seq;
            }

            function buildTramGraphFromRoute() {
                var stopMap = buildTramStopInfoMap();
                var seq = getTramStationSequence();
                var graph = {};

                function addEdge2(a, b, distM, timeS) {
                    if (!graph[a]) graph[a] = [];
                    graph[a].push({ to: b, distM: distM, timeS: timeS });
                }

                if (seq.length < 2) return { graph: graph, stopMap: stopMap, seq: seq };

                for (var i = 0; i < seq.length - 1; i++) {
                    var aId = seq[i];
                    var bId = seq[i + 1];
                    var A = stopMap[aId];
                    var B = stopMap[bId];
                    if (!A || !B) continue;

                    var distM = distanceMeters(A.lon, A.lat, B.lon, B.lat);
                    var timeS = Math.max(1, Math.round(distM / TRAM_SPEED_MPS));

                    addEdge2(aId, bId, distM, timeS);
                    addEdge2(bId, aId, distM, timeS);
                }

                return { graph: graph, stopMap: stopMap, seq: seq };
            }

            function dijkstra(graph, startId, endId, weightKey) {
                var dist = {};
                var prev = {};
                var visited = {};
                var pq = [];

                function costOfEdge(e) {
                    return weightKey === 'TIME' ? Number(e.timeS || 0) : Number(e.distM || 0);
                }

                dist[startId] = 0;
                pq.push({ id: startId, d: 0 });

                while (pq.length) {
                    pq.sort(function (a, b) {
                        return a.d - b.d;
                    });
                    var cur = pq.shift();
                    var u = cur.id;
                    if (visited[u]) continue;
                    visited[u] = true;
                    if (u === endId) break;

                    var edges = graph[u] || [];
                    for (var i = 0; i < edges.length; i++) {
                        var e = edges[i];
                        var v = e && e.to;
                        if (!v) continue;

                        var nd = (dist[u] || 0) + costOfEdge(e);
                        if (dist[v] == null || nd < dist[v]) {
                            dist[v] = nd;
                            prev[v] = { from: u, edge: e };
                            pq.push({ id: v, d: nd });
                        }
                    }
                }

                if (dist[endId] == null) return null;

                var nodes = [];
                var curId = endId;
                nodes.push(curId);
                while (curId !== startId) {
                    var p = prev[curId];
                    if (!p) break;
                    curId = p.from;
                    nodes.push(curId);
                }
                nodes.reverse();

                return { nodes: nodes, prev: prev };
            }

            function buildTramResponse(fromId, toId, weightKey) {
                var built = buildTramGraphFromRoute();
                var graph = built.graph || {};
                var stopMap = built.stopMap || {};
                var seq = built.seq || [];

                if (!seq.length) return { found: false, message: 'TRAM_ROUTE_FULL_HD(station 순서) 데이터가 없습니다. tram-data.js 확인 필요' };
                if (!stopMap[fromId] || !stopMap[toId]) return { found: false, message: '트램 출발/도착 stopId가 stopMap에 없습니다. (ID 확인 필요)' };

                var res = dijkstra(graph, fromId, toId, weightKey);
                if (!res || !Array.isArray(res.nodes) || res.nodes.length < 2) return { found: false, message: '경로를 찾지 못했습니다. (트램 엣지 연결 부족)' };

                var totalDistM = 0;
                var totalTimeS = 0;
                var polyline = [];
                var stops = [];
                var path = [];

                for (var i = 0; i < res.nodes.length; i++) {
                    var id = res.nodes[i];
                    var s = stopMap[id];

                    if (s && isFinite(s.lon) && isFinite(s.lat)) polyline.push({ lon: s.lon, lat: s.lat });

                    stops.push({
                        stopId: id,
                        nodeId: id,
                        name: s ? s.name || id : id,
                        nodenm: s ? s.name || id : id,
                        lon: s ? s.lon : undefined,
                        lat: s ? s.lat : undefined,
                    });

                    if (i > 0) {
                        var pp = res.prev[id];
                        if (pp && pp.edge) {
                            totalDistM += Number(pp.edge.distM || 0);
                            totalTimeS += Number(pp.edge.timeS || 0);
                        }
                        path.push({ mode: 'TRAM', from: res.nodes[i - 1], to: id });
                    } else {
                        path.push({ mode: 'TRAM', at: id });
                    }
                }

                return {
                    found: true,
                    mode: 'TRAM',
                    totalDistM: Math.round(totalDistM),
                    totalTimeS: Math.round(totalTimeS),
                    transfersCount: 0,
                    stopIds: res.nodes,
                    path: path,
                    polyline: polyline,
                    stops: stops,
                };
            }

            // =========================
            // ✅ 본 실행부
            // =========================
            try {
                $scope.pathResult = null;

                safeClearAll();

                $scope.pathPolylineReady = false;
                $scope.pathPolylineExtent = null;
                $scope.pathPolylineFeature = null;

                if (!$scope.path) $scope.path = {};

                if ($scope.path.from && !$scope.path.from.stopId && typeof normalizeStop === 'function') {
                    $scope.path.from = normalizeStop($scope.path.from);
                }
                if ($scope.path.to && !$scope.path.to.stopId && typeof normalizeStop === 'function') {
                    $scope.path.to = normalizeStop($scope.path.to);
                }

                if (!$scope.path.fromNodeId) {
                    $scope.path.fromNodeId = String(($scope.path.from && $scope.path.from.stopId) || $scope.path.fromStopId || $scope.path.fromId || '').trim();
                }
                if (!$scope.path.toNodeId) {
                    $scope.path.toNodeId = String(($scope.path.to && $scope.path.to.stopId) || $scope.path.toStopId || $scope.path.toId || '').trim();
                }

                if (!($scope.path.fromNodeId && $scope.path.toNodeId)) {
                    return safeSetPathStatus('error', '출발/도착 nodeId가 비어있습니다. 후보를 다시 선택해 주세요.');
                }

                $scope.pathLoading = true;
                safeSetPathStatus('info', '최단경로 계산 중...(실제 계산)');

                var params = {
                    cityCode: CITY_CODE,
                    fromStopId: $scope.path.fromNodeId,
                    toStopId: $scope.path.toNodeId,
                    mode: $scope.path.mode || 'MIXED',
                    weight: $scope.path.weight || 'DIST',
                };

                var promise;
                if (String(params.mode).toUpperCase() === 'TRAM') {
                    promise = $q.when({ data: buildTramResponse(params.fromStopId, params.toStopId, params.weight) });
                } else {
                    if (typeof fetchShortestPathReal !== 'function') {
                        $scope.pathLoading = false;
                        return safeSetPathStatus('error', 'fetchShortestPathReal 함수가 없습니다. (서버 최단경로 호출 함수 확인 필요)');
                    }
                    promise = fetchShortestPathReal(params);
                }

                function endLoading() {
                    $scope.pathLoading = false;
                }

                return promise.then(
                    function (res) {
                        var r = res && res.data ? res.data : res || {};
                        console.log('[shortestPath raw]', r);

                        var stopIds = Array.isArray(r && r.stopIds) ? r.stopIds : [];
                        var pathArr = Array.isArray(r && r.path) ? r.path : [];

                        // ✅✅✅ 0) "세그먼트 생성에 필요한 전역 맵"을 draw 전에 먼저 세팅 (hover 안 뜨는 문제 해결)
                        try {
                            // edge meta
                            window.__lastEdgeMetaMap = typeof buildEdgeMetaMapFromPath === 'function' ? buildEdgeMetaMapFromPath(pathArr) : {};
                            // route ids
                            window.__lastRouteStopIds = Array.isArray(stopIds)
                                ? stopIds.map(function (x) {
                                      return String(x || '').trim();
                                  })
                                : [];

                            // coord/label map (서버 stops에서 만든다)
                            var stopCoordMap0 = {};
                            if (typeof buildStopCoordMapFromServerStops === 'function') {
                                stopCoordMap0 = buildStopCoordMapFromServerStops(r && r.stops) || {};
                            }
                            if ((!stopCoordMap0 || !Object.keys(stopCoordMap0).length) && typeof buildStopCoordMapFallback === 'function') {
                                stopCoordMap0 = buildStopCoordMapFallback() || {};
                            }
                            // fallback direct
                            if ((!stopCoordMap0 || !Object.keys(stopCoordMap0).length) && Array.isArray(r && r.stops)) {
                                stopCoordMap0 = {};
                                r.stops.forEach(function (s) {
                                    var id = String(s && (s.stopId ?? s.nodeId ?? s.nodeid ?? s.id ?? '')).trim();
                                    var lon = Number(s && (s.lon ?? s.lng ?? s.longitude ?? s.gpslong ?? s.gpsLong));
                                    var lat = Number(s && (s.lat ?? s.latitude ?? s.gpslati ?? s.gpsLat));
                                    if (id && isFinite(lon) && isFinite(lat)) stopCoordMap0[id] = [lon, lat];
                                });
                            }

                            var stopLabelMap0 = {};
                            if (typeof buildStopLabelMapFromServerStops === 'function') {
                                stopLabelMap0 = buildStopLabelMapFromServerStops(r && r.stops) || {};
                            }
                            if ((!stopLabelMap0 || !Object.keys(stopLabelMap0).length) && Array.isArray(r && r.stops)) {
                                stopLabelMap0 = {};
                                r.stops.forEach(function (s) {
                                    var id2 = String(s && (s.stopId ?? s.nodeId ?? s.nodeid ?? s.id ?? '')).trim();
                                    var nm2 = String(s && (s.name ?? s.nodenm ?? s.nodeNm ?? '')).trim();
                                    if (id2) stopLabelMap0[id2] = nm2 || id2;
                                });
                            }

                            window.__lastStopCoordMap = stopCoordMap0;
                            window.__lastStopLabelMap = stopLabelMap0;

                            console.log('[SEG][pre-draw]', {
                                ids: window.__lastRouteStopIds.length,
                                coordKeys: Object.keys(window.__lastStopCoordMap || {}).length,
                                labelKeys: Object.keys(window.__lastStopLabelMap || {}).length,
                                edgeKeys: Object.keys(window.__lastEdgeMetaMap || {}).length,
                            });
                        } catch (ePre) {
                            console.warn('[SEG][pre-draw] failed:', ePre);
                        }

                        var reqModeUpper = String(params.mode || '').toUpperCase();

                        function pickSegMode(seg) {
                            var v =
                                seg &&
                                (seg.mode != null ? seg.mode : seg.kind != null ? seg.kind : seg.type != null ? seg.type : seg.vehicle != null ? seg.vehicle : seg.edgeType != null ? seg.edgeType : seg.transitType != null ? seg.transitType : '');
                            v = String(v || '').toUpperCase();

                            if (v === 'FOOT' || v === 'PED' || v === 'WALKING') v = 'WALK';
                            if (v === 'LINK' || v === 'XFER') v = 'TRANSFER';
                            return v;
                        }

                        var hasBus = false,
                            hasTram = false,
                            hasWalk = false,
                            hasTransfer = false;
                        for (var i = 0; i < pathArr.length; i++) {
                            var mm = pickSegMode(pathArr[i]);
                            if (mm === 'BUS') hasBus = true;
                            else if (mm === 'TRAM') hasTram = true;
                            else if (mm === 'TRANSFER') hasTransfer = true;
                            else if (mm) hasWalk = true;
                        }

                        var isMixed = reqModeUpper === 'MIXED' || (hasBus && hasTram);
                        var modeUpper = isMixed ? 'MIXED' : String(reqModeUpper || 'BUS').toUpperCase();

                        if (r && r.found === false) {
                            safeClearAll();

                            $scope.pathResult = {
                                found: false,
                                totalDistM: 0,
                                totalTimeS: 0,
                                walkTimeS: 0,
                                stopCount: 0,
                                transfersCount: 0,
                                stopIds: [],
                                path: [],
                            };

                            safeSetPathStatus('error', r.message || '경로를 찾지 못했습니다.');
                            endLoading();
                            return;
                        }

                        var serverTransfers = pickTransfersCount(r);
                        var computedTransfers = computeTransfersFromPath(pathArr);
                        var finalTransfers = (serverTransfers > 0 ? serverTransfers : computedTransfers) || 0;

                        var coordsLonLat = [];
                        if (Array.isArray(r.polyline) && r.polyline.length >= 2) {
                            coordsLonLat = r.polyline
                                .map(function (p) {
                                    var lon = Number(p && p.lon);
                                    var lat = Number(p && p.lat);
                                    return [lon, lat];
                                })
                                .filter(function (c) {
                                    return c && isFinite(c[0]) && isFinite(c[1]);
                                });
                        }

                        var walkDistM = 0;
                        var walkTimeS = 0;

                        (function computeWalkFromEnds() {
                            if (!Array.isArray(coordsLonLat) || coordsLonLat.length < 2) {
                                walkDistM = 0;
                                walkTimeS = 0;
                                return;
                            }

                            var first = coordsLonLat[0];
                            var last = coordsLonLat[coordsLonLat.length - 1];

                            var fLon, fLat, tLon, tLat;

                            if (Array.isArray(r.stops) && r.stops.length >= 2) {
                                var s0 = r.stops[0];
                                var sN = r.stops[r.stops.length - 1];

                                fLon = Number(s0 && (s0.lon != null ? s0.lon : s0.gpslong != null ? s0.gpslong : s0.gpsLong));
                                fLat = Number(s0 && (s0.lat != null ? s0.lat : s0.gpslati != null ? s0.gpslati : s0.gpsLat));
                                tLon = Number(sN && (sN.lon != null ? sN.lon : sN.gpslong != null ? sN.gpslong : sN.gpsLong));
                                tLat = Number(sN && (sN.lat != null ? sN.lat : sN.gpslati != null ? sN.gpslati : sN.gpsLat));
                            } else {
                                var fromObj = $scope.path.from || {};
                                var toObj = $scope.path.to || {};
                                fLat = Number(fromObj.gpslati || fromObj.gpsLat || fromObj.lat);
                                fLon = Number(fromObj.gpslong || fromObj.gpsLong || fromObj.lon);
                                tLat = Number(toObj.gpslati || toObj.gpsLat || toObj.lat);
                                tLon = Number(toObj.gpslong || toObj.gpsLong || toObj.lon);
                            }

                            if (isFinite(fLon) && isFinite(fLat) && first && isFinite(first[0]) && isFinite(first[1])) {
                                var d1 = distanceMeters(fLon, fLat, first[0], first[1]);
                                if (d1 >= 5) walkDistM += d1;
                            }

                            if (isFinite(tLon) && isFinite(tLat) && last && isFinite(last[0]) && isFinite(last[1])) {
                                var d2 = distanceMeters(last[0], last[1], tLon, tLat);
                                if (d2 >= 5) walkDistM += d2;
                            }

                            if (walkDistM > 0 && WALK_SPEED_MPS > 0) walkTimeS = Math.round(walkDistM / WALK_SPEED_MPS);
                            else walkTimeS = 0;
                        })();

                        $scope.pathResult = {
                            found: r && r.found !== false,
                            totalDistM: Number(r.totalDistM || 0),
                            totalTimeS: Number(r.totalTimeS || 0),
                            walkTimeS: walkTimeS,
                            stopCount: stopIds.length,
                            transfersCount: finalTransfers,
                            stopIds: stopIds,
                            path: pathArr,
                        };

                        // =========================================================
                        // ✅ 1) 경로 그리기
                        // =========================================================
                        var okDraw = false;

                        if (isMixed) {
                            if (typeof drawMixedSegmentsFromResult === 'function') okDraw = !!drawMixedSegmentsFromResult(r);
                            else {
                                okDraw = false;
                                console.warn('[MIXED] drawMixedSegmentsFromResult 함수가 없습니다.');
                            }
                        } else {
                            if (Array.isArray(coordsLonLat) && coordsLonLat.length >= 2) {
                                okDraw = typeof drawPathPolylineLonLat === 'function' ? !!drawPathPolylineLonLat(coordsLonLat, modeUpper) : false;
                            }
                        }

                        // ✅ 버튼 unlock
                        if (okDraw) {
                            if (isMixed) {
                                var ext = null;
                                try {
                                    if (typeof computeExtentFromSources === 'function') {
                                        ext = computeExtentFromSources([mixedBusSource, mixedTramSource, mixedWalkSource, typeof mixedTransferSource !== 'undefined' ? mixedTransferSource : null]);
                                    } else {
                                        console.warn('[MIXED] computeExtentFromSources is not defined');
                                        ext = null;
                                    }
                                } catch (e) {
                                    console.warn('[MIXED] computeExtentFromSources failed:', e);
                                    ext = null;
                                }

                                function _validExt(x) {
                                    return x && x.length === 4 && isFinite(x[0]) && isFinite(x[1]) && isFinite(x[2]) && isFinite(x[3]) && !(x[0] === x[2] && x[1] === x[3]);
                                }

                                $scope.pathPolylineExtent = ext && _validExt(ext) ? ext : null;
                                $scope.pathPolylineFeature = null;
                                $scope.pathPolylineReady = true;
                            } else {
                                if (!$scope.pathPolylineReady) $scope.pathPolylineReady = true;
                            }
                        } else {
                            $scope.pathPolylineReady = false;
                            $scope.pathPolylineExtent = null;
                            $scope.pathPolylineFeature = null;
                        }

                        if (!okDraw) {
                            safeSetPathStatus('info', '경로 계산은 됐지만 지도에 경로를 그리지 못했습니다. (polyline / MIXED 함수 확인)');
                        }

                        // =========================================================
                        // ✅ 2) 정류장 마커 정책
                        // =========================================================
                        try {
                            // 기본 stops 레이어 숨김(중복 방지)
                            try {
                                var map2 = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                                if (map2 && map2.getLayers) {
                                    var layers2 = map2.getLayers().getArray ? map2.getLayers().getArray() : [];
                                    for (var li = 0; li < layers2.length; li++) {
                                        var ly2 = layers2[li];
                                        if (!ly2 || !ly2.get || !ly2.setVisible) continue;
                                        var tag2 = String(ly2.get('tag') || '').toLowerCase();
                                        if (tag2 === 'stops') ly2.setVisible(false);
                                    }
                                }
                            } catch (eHide) {}

                            var routeStopIds = Array.isArray(stopIds) && stopIds.length ? stopIds.slice() : buildStopIdsFromStops(r && r.stops);

                            // ✅✅✅ 여기서 window.__lastStopCoordMap/__lastStopLabelMap 세팅은
                            // 이미 "pre-draw"에서 해놨으니 그대로 가져다 쓴다.
                            var stopCoordMap2 = window.__lastStopCoordMap || {};
                            var stopLabelMap = window.__lastStopLabelMap || {};

                            var baseMode = modeUpper === 'TRAM' ? 'TRAM' : 'BUS';
                            drawRouteStopsOnly(routeStopIds, baseMode, stopCoordMap2, stopLabelMap, $scope.path.fromNodeId, $scope.path.toNodeId);

                            var cnt = routeStopSource && routeStopSource.getFeatures ? routeStopSource.getFeatures().length : -1;
                            console.log('[route-stops] marked', { ids: routeStopIds.length, features: cnt, mode: baseMode });
                        } catch (e3) {
                            console.warn('[route-stops] failed', e3);

                            // fallback
                            if (typeof drawStopsFromServer === 'function' && Array.isArray(r.stops) && r.stops.length) {
                                drawStopsFromServer(r.stops, $scope.path.fromNodeId, $scope.path.toNodeId);
                            } else if (typeof drawStopMarker === 'function') {
                                var fromObj2 = $scope.path.from || {};
                                var toObj2 = $scope.path.to || {};

                                var fLat3 = Number(fromObj2.gpslati || fromObj2.gpsLat || fromObj2.lat);
                                var fLon3 = Number(fromObj2.gpslong || fromObj2.gpsLong || fromObj2.lon);
                                var tLat3 = Number(toObj2.gpslati || toObj2.gpsLat || toObj2.lat);
                                var tLon3 = Number(toObj2.gpslong || toObj2.gpsLong || toObj2.lon);

                                if (isFinite(fLat3) && isFinite(fLon3)) drawStopMarker(fLon3, fLat3, '#22c55e', '출발', 'FROM');
                                if (isFinite(tLat3) && isFinite(tLon3)) drawStopMarker(tLon3, tLat3, '#ef4444', '도착', 'TO');
                            }
                        }

                        // =========================================================
                        // ✅ 3) 성공 문구
                        // =========================================================
                        safeSetPathStatus('ok', '최단경로 계산완료');

                        $scope.$applyAsync();
                        endLoading();
                    },
                    function (err) {
                        console.error('[findShortestPath] fail:', err);
                        safeClearAll();
                        safeSetPathStatus('error', '최단경로 계산 실패: ' + (err && err.message ? err.message : '서버 오류'));
                        endLoading();
                    }
                );
            } catch (e) {
                console.error(e);
                safeClearAll();
                $scope.pathLoading = false;
                safeSetPathStatus('error', '최단경로 계산 중 오류가 발생했습니다.');
            }
        };

        // =========================================================
        // ✅ "경로만 보기" 모드
        // - stops/walk/버스(포인트 대량 레이어)는 숨기고
        // - path + (mixed line들) + (route-stops)는 남긴다 ✅
        // =========================================================
        $scope.onlyPathMode = false;

        function setOnlyPathVisible(onlyPath) {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !map.getLayers) return;

            var layers = map.getLayers().getArray ? map.getLayers().getArray() : [];
            for (var i = 0; i < layers.length; i++) {
                var ly = layers[i];
                if (!ly || !ly.setVisible) continue;

                var tag = ly.get && ly.get('tag') ? String(ly.get('tag')) : '';
                tag = tag.toLowerCase();

                if (onlyPath) {
                    if (tag === 'stops' || tag === 'walk' || tag === 'bus') ly.setVisible(false);
                    if (tag === 'path') ly.setVisible(true);

                    // ✅✅✅ 추가: 경로 정류장만 마킹 레이어는 보여주기
                    if (tag === 'route-stops') ly.setVisible(true);
                } else {
                    if (tag === 'stops' || tag === 'walk' || tag === 'bus' || tag === 'path' || tag === 'route-stops') ly.setVisible(true);
                }
            }

            if (onlyPath) {
                try {
                    if (typeof hideAllPointLayersOnMap === 'function') hideAllPointLayersOnMap();
                } catch (e) {}
            }
        }

        // =========================================================
        // ✅ "경로로 이동하기" 버튼 동작 (fit + 경로만 보기)
        // =========================================================
        $scope.goToPathOnMap = function () {
            try {
                var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                if (!map) return;

                var view = map.getView && map.getView();
                if (!view || !view.fit) return;

                function isValidExtent(ext) {
                    return ext && ext.length === 4 && isFinite(ext[0]) && isFinite(ext[1]) && isFinite(ext[2]) && isFinite(ext[3]) && !(ext[0] === ext[2] && ext[1] === ext[3]);
                }

                var ext = $scope.pathPolylineExtent;

                if (!isValidExtent(ext) && $scope.pathPolylineFeature) {
                    var geom = $scope.pathPolylineFeature.getGeometry && $scope.pathPolylineFeature.getGeometry();
                    if (geom && geom.getExtent) ext = geom.getExtent();
                }

                if (!isValidExtent(ext) && window.ol && ol.extent) {
                    var sources = [];
                    if (typeof mixedBusSource !== 'undefined' && mixedBusSource) sources.push(mixedBusSource);
                    if (typeof mixedTramSource !== 'undefined' && mixedTramSource) sources.push(mixedTramSource);
                    if (typeof mixedWalkSource !== 'undefined' && mixedWalkSource) sources.push(mixedWalkSource);
                    if (typeof mixedTransferSource !== 'undefined' && mixedTransferSource) sources.push(mixedTransferSource);

                    if (sources.length) {
                        var merged = ol.extent.createEmpty();
                        var any = false;

                        for (var i = 0; i < sources.length; i++) {
                            var src = sources[i];
                            if (!src || !src.getExtent) continue;

                            var e = src.getExtent();
                            if (!isValidExtent(e)) continue;

                            ol.extent.extend(merged, e);
                            any = true;
                        }

                        if (any) ext = merged;
                    }
                }

                if (!isValidExtent(ext)) {
                    if (typeof setPathStatus === 'function') {
                        setPathStatus('error', '이동할 경로 범위를 찾지 못했습니다. (extent 없음/유효하지 않음)');
                    }
                    return;
                }

                view.fit(ext, {
                    padding: [40, 40, 40, 40],
                    duration: 450,
                    maxZoom: 17,
                });

                $scope.onlyPathMode = true;
                try {
                    if (typeof setOnlyPathVisible === 'function') setOnlyPathVisible(true);
                } catch (e2) {
                    console.warn('[goToPathOnMap] setOnlyPathVisible fail:', e2);
                }

                if (typeof setPathStatus === 'function') {
                    setPathStatus('ok', '지도 영역을 경로로 맞췄습니다. (경로만 표시)');
                }
            } catch (e) {
                console.error('[goToPathOnMap] fail:', e);
                if (typeof setPathStatus === 'function') setPathStatus('error', '경로로 이동 중 오류가 발생했습니다.');
            }
        };

        // =========================================================
        // ✅ clearPath에 "지도 경로 제거" + polyline 캐시 제거까지 포함 (ES5)
        //  - 기존 clearPathOnMap/routeStopsOnly만 지우던 것 → 완전 초기화 호출로 변경
        // =========================================================
        $scope.clearPath = function () {
            // 0) 상태 초기화
            if (!$scope.path) $scope.path = {};

            $scope.path.fromCandidates = [];
            $scope.path.toCandidates = [];
            $scope.path.from = null;
            $scope.path.to = null;
            $scope.path.fromNodeId = null;
            $scope.path.toNodeId = null;
            $scope.pathResult = null;

            $scope.pathPolylineReady = false;
            $scope.pathPolylineFeature = null;
            $scope.pathPolylineExtent = null;

            // ✅✅✅ (핵심) 경로 관련 레이어/오버레이/캐시까지 완전 초기화
            try {
                clearAllRouteLayersOnMap();
            } catch (e0) {
                // fallback (혹시 함수 없을 때)
                try {
                    if (typeof clearPathOnMap === 'function') clearPathOnMap();
                } catch (e1) {}
                try {
                    if (typeof clearRouteStopsOnly === 'function') clearRouteStopsOnly();
                } catch (e2) {}
            }

            if (typeof setPathStatus === 'function') setPathStatus('', '경로를 지웠습니다.');
        };

        // =========================================================
        // ✅✅✅ [ADD] 지도 경로 관련 "완전 초기화" (모드 전환/초기화 버튼용)
        // - 단일 path + 단일 seg + MIXED 4종 + mixed marker + route stops + highlight + hover overlay
        // - ✅ window.__last* 캐시까지 초기화 (hover/seg 매칭 잔상 방지)
        // =========================================================
        function clearAllRouteLayersOnMap() {
            // 1) 단일 경로/마커
            try {
                if (pathVectorSource) pathVectorSource.clear(true);
            } catch (e) {}
            // 1-1) 단일 hover hit 세그먼트
            try {
                if (pathSegSource) pathSegSource.clear(true);
            } catch (e) {}

            // 2) MIXED
            try {
                if (mixedBusSource) mixedBusSource.clear(true);
            } catch (e) {}
            try {
                if (mixedTramSource) mixedTramSource.clear(true);
            } catch (e) {}
            try {
                if (mixedWalkSource) mixedWalkSource.clear(true);
            } catch (e) {}
            try {
                if (typeof mixedTransferSource !== 'undefined' && mixedTransferSource) mixedTransferSource.clear(true);
            } catch (e) {}
            try {
                if (typeof mixedMarkerSource !== 'undefined' && mixedMarkerSource) mixedMarkerSource.clear(true);
            } catch (e) {}

            // 3) route stops (정류장 강조 레이어)
            try {
                if (typeof clearRouteStopsOnly === 'function') clearRouteStopsOnly();
            } catch (e) {}

            // 4) 하이라이트(있으면)
            try {
                if (typeof clearMixedHighlight === 'function') clearMixedHighlight();
            } catch (e) {}

            // 5) hover overlay 숨김 (mixed)
            try {
                if (typeof __mixedOverlay !== 'undefined' && __mixedOverlay) __mixedOverlay.setPosition(undefined);
            } catch (e) {}
            try {
                if (typeof __mixedHoverLastFeatureUid !== 'undefined') __mixedHoverLastFeatureUid = null;
            } catch (e) {}

            // 6) hover overlay 숨김 (single)
            try {
                if (typeof __segHoverOverlay !== 'undefined' && __segHoverOverlay) __segHoverOverlay.setPosition(undefined);
            } catch (e) {}

            // 7) ✅✅✅ window 캐시 초기화 (이전 경로 정보/좌표/라벨/메타 잔상 제거)
            try {
                window.__lastRouteStopIds = [];
            } catch (e) {}
            try {
                window.__lastStopCoordMap = {};
            } catch (e) {}
            try {
                window.__lastStopLabelMap = {};
            } catch (e) {}
            try {
                window.__lastEdgeMetaMap = {};
            } catch (e) {}

            // 8) scope 상태
            try {
                $scope.pathPolylineFeature = null;
                $scope.pathPolylineExtent = null;
                $scope.pathPolylineReady = false;
            } catch (e) {}

            // 9) 렌더
            try {
                var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                if (map && map.renderSync) map.renderSync();
            } catch (e) {}
        }

        // =========================================================
        // ✅ (선택) HTML에서 버튼으로 바로 호출하기 쉽게 scope에도 노출
        //  - ng-click="clearAllRouteLayersOnMap()"
        // =========================================================
        $scope.clearAllRouteLayersOnMap = function () {
            try {
                clearAllRouteLayersOnMap();
            } catch (e) {}
        };

        // =========================================================
        // ✅ 사용자 미니 관리 (ES5 안전버전)
        // =========================================================
        function buildKeyList(obj) {
            if (!obj) return [];

            var cand = [obj.user_id, obj.userId, obj.id, obj.email, obj.username, obj.name];

            var out = [];
            for (var i = 0; i < cand.length; i++) {
                if (!cand[i]) continue;
                var k = String(cand[i]).trim().toLowerCase();
                if (!k) continue;
                out.push(k);
            }
            return out;
        }

        function makeRoleIndex(roleRows) {
            var idx = {};
            var rows = roleRows || [];
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                var keys = buildKeyList(r);
                for (var j = 0; j < keys.length; j++) {
                    idx[keys[j]] = { role: r && r.role };
                }
            }
            return idx;
        }

        function attachRolesToUsers(users, roleIndex) {
            var list = users || [];
            for (var i = 0; i < list.length; i++) {
                var u = list[i];
                var matched = null;

                var keys = buildKeyList(u);
                for (var j = 0; j < keys.length; j++) {
                    var k = keys[j];
                    if (!matched && roleIndex && roleIndex[k]) matched = roleIndex[k];
                }

                var role = matched ? matched.role : null;
                u._role = role;
                u._isAdmin = !!(role && String(role).toUpperCase().indexOf('ADMIN') >= 0);

                u.roleLabel = typeof roleToLabel === 'function' ? roleToLabel(role) : role || '사용자';
                u.roleClass = typeof roleToClass === 'function' ? roleToClass(role) : 'badge-user';
            }
        }

        $scope.loadUsers = function () {
            if (typeof setUserStatus === 'function') setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');

            var usersP = $http.get('/user').then(function (res) {
                return typeof normalizeList === 'function' ? normalizeList(res.data) : Array.isArray(res.data) ? res.data : [];
            });

            var rolesP = $http
                .get('/api/roles')
                .then(function (res) {
                    return Array.isArray(res.data) ? res.data : [];
                })
                .catch(function () {
                    return [];
                });

            $q.all([usersP, rolesP])
                .then(function (arr) {
                    var users = arr[0] || [];
                    var roles = arr[1] || [];
                    attachRolesToUsers(users, makeRoleIndex(roles));
                    $scope.users = users;

                    if (typeof setUserStatus === 'function') {
                        setUserStatus('success', '👤 사용자 ' + ($scope.users.length || 0) + '명 불러왔습니다.', 1500);
                    }
                })
                .catch(function () {
                    if (typeof setUserStatus === 'function') setUserStatus('error', '❌ 사용자 목록을 불러오지 못했습니다.', 2500);
                });
        };

        $scope.createUser = function () {
            var name = ($scope.newUser && $scope.newUser.name ? $scope.newUser.name : '').trim();
            var email = ($scope.newUser && $scope.newUser.email ? $scope.newUser.email : '').trim();

            if (!name || !email) return typeof setUserStatus === 'function' ? setUserStatus('error', '이름과 이메일을 모두 입력하세요.', 2000) : null;
            if (!/^[^@\s]+@[^\s@]+\.[^\s@]+$/.test(email)) return typeof setUserStatus === 'function' ? setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000) : null;

            if (typeof setUserStatus === 'function') setUserStatus('info', '⏳ 사용자 추가 중...');

            $http
                .post('/user', { name: name, email: email })
                .then(function (res) {
                    var created = res.data || {};
                    created.roleLabel = '사용자';
                    created.roleClass = 'badge-user';
                    created._isAdmin = false;

                    if (!$scope.users) $scope.users = [];
                    $scope.users.unshift(created);

                    $scope.newUser = { name: '', email: '' };

                    var id = created.user_id || created.userId || created.id || '알 수 없음';
                    if (typeof setUserStatus === 'function') setUserStatus('success', '✅ 추가 완료 (ID: ' + id + ')', 1500);
                })
                .catch(function () {
                    if (typeof setUserStatus === 'function') setUserStatus('error', '❌ 사용자 추가에 실패했습니다.', 2500);
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
            var idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return typeof setUserStatus === 'function' ? setUserStatus('error', 'ID를 찾을 수 없어 수정할 수 없습니다.', 2000) : null;

            var payload = {};
            var name = (u._editName || '').trim();
            var phone = (u._editPhone || '').trim();
            var email = (u._editEmail || '').trim();

            if (name && name !== u.name) payload.name = name;
            if (phone && phone !== (u.phone || u.tel || u.phoneNumber)) payload.phone = phone;
            if (email && email !== u.email) {
                if (!/^[^@\s]+@[^\s@]+\.[^\s@]+$/.test(email)) return typeof setUserStatus === 'function' ? setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000) : null;
                payload.email = email;
            }

            if (!Object.keys(payload).length) return $scope.cancelEdit(u);

            if (typeof setUserStatus === 'function') setUserStatus('info', '⏳ 수정 중... (ID: ' + idKey + ')', 0);

            $http
                .put('/user/' + encodeURIComponent(idKey), payload)
                .then(function (res) {
                    var updated = res.data || {};

                    u.name = updated.name != null ? updated.name : name ? name : u.name;
                    u.phone = updated.phone != null ? updated.phone : phone ? phone : u.phone;
                    u.email = updated.email != null ? updated.email : email ? email : u.email;

                    $scope.cancelEdit(u);
                    if (typeof setUserStatus === 'function') setUserStatus('success', '✅ 수정 완료 (ID: ' + idKey + ')', 1500);
                })
                .catch(function () {
                    if (typeof setUserStatus === 'function') setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };

        $scope.deleteUser = function (u) {
            var idKey = u && (u.user_id || u.userId || u.id);
            if (!idKey) return typeof setUserStatus === 'function' ? setUserStatus('error', 'ID를 찾을 수 없어 삭제할 수 없습니다.', 2000) : null;

            if (!confirm('정말로 삭제할까요? (ID: ' + idKey + ')')) return;

            $http
                .delete('/user/' + encodeURIComponent(idKey))
                .then(function () {
                    var next = [];
                    var list = $scope.users || [];
                    for (var i = 0; i < list.length; i++) {
                        var row = list[i];
                        var rid = row && (row.user_id || row.userId || row.id);
                        if (rid !== idKey) next.push(row);
                    }
                    $scope.users = next;

                    if (typeof setUserStatus === 'function') setUserStatus('success', '🗑️ 삭제 완료 (ID: ' + idKey + ')', 1500);
                })
                .catch(function () {
                    if (typeof setUserStatus === 'function') setUserStatus('error', '❌ 삭제에 실패했습니다.', 2500);
                });
        };

        $scope.goToNew = function () {
            $location.path('/users/new');
        };

        // =========================================================
        // ✅✅✅ [ADD] 컨트롤러 진입 시 수집 타이머 보장 재시작
        // - destroy로 꺼졌어도 다시 들어오면 켜짐
        // =========================================================
        $timeout(function () {
            ensureCollectRunning();
        }, 400);

        // =========================================================
        // ✅✅✅ $destroy 단 한 번만: 폴링 + 수집 타이머 정리 (ES5)
        // =========================================================
        $scope.$on('$destroy', function () {
            try {
                if (typeof stopPolling === 'function') stopPolling();
            } catch (e) {}

            if (collectTimer) {
                $interval.cancel(collectTimer);
                collectTimer = null;
            }

            collectToken++;
            $scope.collecting = false;
        });
    });

    // ────────────────────────────────────────────────────────────────
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
            $scope.q = { type: 'author', keyword: '', from: null, to: null };
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
    // src/main/resources/static/app.js 안의 BoardViewCtrl (전체 교체)
    app.controller('BoardViewCtrl', function ($scope, $http, $routeParams, $location, AuthService, $sce) {
        $scope.loading = true;
        $scope.post = null;
        $scope.renderedContent = null;
        $scope.files = []; // ⬅ 첨부 목록(하단 리스트용)
        $scope.me = null;

        // ✅ code / type / key 읽기 (라우트 + 쿼리 둘 다 지원)
        const rawCode = String($routeParams.code || '').toLowerCase(); // 'bus' | 'norm' | 'normal' | 'big'
        const key = $routeParams.key;

        // ⚠️ 기존 코드는 type을 쿼리스트링에서만 읽어서
        // /view/num/:key 형태(라우트 param)일 때 type이 'str'로 떨어질 수 있었음.
        const routeType = String($routeParams.type || '').toLowerCase(); // 'num' | 'str' (라우트)
        const queryType = String($location.search().type || '').toLowerCase(); // 'num' | 'str' (쿼리)
        const type = (routeType || queryType || 'str').toLowerCase();

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
                    url = m.fileUrl || m.url || null;
                    fileName = m.fileName || '첨부 파일';
                }

                if (!url) return '';

                const styleParts = [];

                if (widthRaw) {
                    if (/^\d+$/.test(widthRaw)) {
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

            // ✅ BIG 상세는 목록과 맞춰서 /api/big-board/posts/{id} 로 통일
            if (rawCode === 'big' && type === 'num') {
                url = '/api/big-board/posts/' + encodeURIComponent(key);
            } else if (type === 'num') {
                // (BUS/NORM) 숫자 PK로 조회
                url = '/api/posts/' + encodeURIComponent(key);
            } else {
                // (BUS/NORM) 문자열 key(uuid 등)로 조회
                url = '/api/posts/key/' + encodeURIComponent(key);
            }

            console.log('[VIEW] loadOne url=', url, 'code=', rawCode, 'type=', type, 'key=', key);

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

                    // 토큰 변환에 쓸 meta 구조
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
                .catch(function (err) {
                    console.error('[VIEW] loadOne fail', err);
                    $scope.post = null;
                    $scope.renderedContent = $sce.trustAsHtml('<div style="opacity:.7">게시글을 불러오지 못했습니다.</div>');
                    $scope.files = [];
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
        'use strict';

        console.log('[BIG] BoardBigCtrl 초기화');

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
        var CHUNKS_PER_DB_PAGE = MAX_PER_PAGE / CHUNK_SIZE;

        // ─────────────────────────────────────
        // ✅ BIG 데이터 호환 유틸 (중요!)
        // ─────────────────────────────────────
        function getPostId(p) {
            if (!p) return null;
            // BIG는 post_id로 내려올 가능성이 큼
            return p.post_id || p.id || p.postId || p.postID || p.postIdStr || null;
        }

        function getWriterId(p) {
            if (!p) return '';
            // BIG는 user_id / writer_id로 내려올 수 있음
            return (p.writerId || p.writer_id || p.writer || p.user_id || p.userId || p.username || p.writerName || '').toString();
        }

        // ─────────────────────────────────────
        // 페이지 / 카운트 상태
        // ─────────────────────────────────────
        $scope.pageSize = PAGE_SIZE;
        $scope.pageSizes = [PAGE_SIZE];
        $scope.page = 0;

        $scope.pages = Math.ceil(APPROX_TOTAL / PAGE_SIZE);
        $scope.total = APPROX_TOTAL;
        $scope.totalCount = APPROX_TOTAL;
        $scope.totalPages = Math.ceil(APPROX_TOTAL / CHUNK_SIZE);
        $scope.logicalPage = 1;

        $scope.posts = [];
        $scope._pagePosts = [];
        $scope.displayCount = 0;
        $scope.loading = false;
        $scope.loadingMore = false;

        // ★ 렌더링(브라우저가 DOM 그리는 중) 로딩 표시용 플래그
        $scope.rendering = false;

        // ★ 렌더링 로딩 오버레이 헬퍼
        function withRenderLoading(fn) {
            $scope.rendering = true;

            $timeout(function () {
                try {
                    fn();
                } finally {
                    $timeout(function () {
                        $scope.rendering = false;
                    }, 0);
                }
            }, 0);
        }

        // 글쓰기 폼 & composer 표시 상태
        $scope.showComposer = false;
        $scope.form = { title: '', content: '' };
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
        // ✅ BIG 전용 canEdit : 무조건 '내 글만' 수정/삭제
        //    (작성자 필드가 writerId가 아닐 수도 있어서 getWriterId 사용)
        // ─────────────────────────────────────
        $scope.canEdit = function (p) {
            var me = $scope.me;
            if (!me || !p) return false;

            var myId = (me.username || me.userId || me.id || '').toString();
            var writer = getWriterId(p);

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

            withRenderLoading(function () {
                try {
                    $scope.displayCount = next;
                    $scope.posts = $scope._pagePosts.slice(0, $scope.displayCount);
                    updateLogicalPage();
                } finally {
                    $scope.loadingMore = false;
                }
            });
        };

        // ─────────────────────────────────────
        // 스크롤 이벤트
        // ─────────────────────────────────────
        var lastLoadScrollY = 0;
        var ticking = false;

        function onScroll() {
            if ($scope.loading || $scope.loadingMore) return;
            if (ticking) return;
            ticking = true;

            $window.requestAnimationFrame(function () {
                try {
                    var docHeight = document.documentElement.scrollHeight || document.body.scrollHeight || document.body.offsetHeight;
                    var scrollBottom = window.innerHeight + window.scrollY;

                    var nearBottom = docHeight - scrollBottom <= 80;
                    if (!nearBottom) return;

                    if ($scope.displayCount > 0 && window.scrollY <= lastLoadScrollY + 40) return;

                    $scope.$applyAsync(function () {
                        var before = $scope.displayCount;
                        $scope.loadMoreInPage();
                        if ($scope.displayCount !== before) lastLoadScrollY = window.scrollY;
                    });
                } finally {
                    ticking = false;
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

            // "다음 페이지"는 현재 페이지에서 1000개까지 다 본 다음에만 허용
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
        // ✅ 상세 보기 / 수정 / 삭제 (id 필드 호환 처리)
        // ─────────────────────────────────────
        $scope.goView = function (p) {
            var id = getPostId(p);
            if (!id) return;

            // ✅ 라우트: /board/:code/view/:type/:key
            $location.path('/board/big/view/num/' + encodeURIComponent(id));
        };

        $scope.goEdit = function (p) {
            var id = getPostId(p);
            if (!id) return;

            // ✅ 라우트: /board/:code/edit/:type/:key
            $location.path('/board/big/edit/num/' + encodeURIComponent(id));
        };

        $scope.remove = function (p) {
            var id = getPostId(p);
            if (!id) return;

            if (!confirm('정말 삭제하시겠습니까?')) return;

            // ✅ 백엔드가 이 URL을 쓰는지 확인 필요
            // - 현재 코드 유지: DELETE /api/big-board/{id}
            // - 만약 404면 아래처럼 바꾸면 됨:
            //   .delete('/api/big-board/posts/' + encodeURIComponent(id))
            $http
                .delete('/api/big-board/' + encodeURIComponent(id))
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

    // 게시판 통계 컨트롤러 (DB 연동)                           // ✅ "통계 화면"에서 API 호출 + Chart.js로 그래프 그리는 AngularJS 컨트롤러
    app.controller('BoardStatsCtrl', function ($scope, $http, $timeout) {
        // ✅ 컨트롤러 등록(스코프/HTTP/타이머 서비스 주입)

        // ✅ posts용 4개 + views용 4개 차트 인스턴스
        let postsBar = null;
        let postsPie = null;
        let postsRadar = null; // ✅ (변경) '레이더' 자리 canvas에 "라인 차트"를 그릴 거라 변수명은 유지
        let postsBubble = null;

        let viewsBar = null;
        let viewsPie = null;
        let viewsRadar = null; // ✅ (변경) 동일
        let viewsBubble = null;

        $scope.boardType = 'NORM'; // 'NORM' | 'BIG'
        $scope.metric = 'posts'; // 'posts' | 'views'

        $scope.rowsPosts = []; // ✅ 사용자 게시물 수 Top10
        $scope.rowsViews = []; // ✅ 게시물 조회수 순위 Top10

        $scope.loading = false;

        // ✅ 최초 진입
        $scope.init = function () {
            $scope.reload();
        };

        // ✅ boardType / metric 변경 시 reload
        $scope.$watchGroup(['boardType', 'metric'], function () {
            if (typeof $scope.reload === 'function') $scope.reload();
        });

        // ✅ API 호출 (선택된 metric만 호출해서 "따로따로" 나오게)
        $scope.reload = function () {
            $scope.loading = true;

            const board = String($scope.boardType || 'NORM');
            const metric = String($scope.metric || 'posts');

            $http
                .get('/api/stats/top10', {
                    params: { board: board, metric: metric },
                })
                .then(function (res) {
                    const list = Array.isArray(res.data) ? res.data : [];
                    const normalized = normalizeRows(list);

                    // ✅ metric별로 저장 (분리)
                    if (metric === 'posts') $scope.rowsPosts = normalized;
                    else $scope.rowsViews = normalized;

                    $timeout(drawCharts, 0);
                })
                .catch(function (err) {
                    console.error('[STATS] top10 API 실패:', err);

                    if (metric === 'posts') $scope.rowsPosts = [];
                    else $scope.rowsViews = [];

                    $timeout(drawCharts, 0);
                })
                .finally(function () {
                    $scope.loading = false;
                });
        };

        function normalizeRows(list) {
            return (list || [])
                .filter((r) => r && r.name != null)
                .map((r) => ({
                    name: String(r.name),
                    value: Number(r.value || 0),
                }));
        }

        function destroyChart(ch) {
            if (ch) {
                try {
                    ch.destroy();
                } catch (e) {}
            }
            return null;
        }

        function drawCharts() {
            // ✅ metric에 따라 "해당 4개만" 그리고, 반대쪽은 완전히 제거
            if ($scope.metric === 'posts') {
                drawGroup('posts', $scope.rowsPosts || []);

                // 반대쪽(views) 차트는 제거
                viewsBar = destroyChart(viewsBar);
                viewsPie = destroyChart(viewsPie);
                viewsRadar = destroyChart(viewsRadar);
                viewsBubble = destroyChart(viewsBubble);
            } else {
                drawGroup('views', $scope.rowsViews || []);

                // 반대쪽(posts) 차트는 제거
                postsBar = destroyChart(postsBar);
                postsPie = destroyChart(postsPie);
                postsRadar = destroyChart(postsRadar);
                postsBubble = destroyChart(postsBubble);
            }
        }

        function drawGroup(prefix, rows) {
            const labels = (rows || []).map((r) => r.name);
            const values = (rows || []).map((r) => Number(r.value || 0));

            if (!window.Chart) {
                console.warn('[STATS] Chart.js 로드 실패');
                return;
            }
            if (!labels.length) return;

            // ✅ stats.html 캔버스 id 매칭
            const barEl = document.getElementById(prefix === 'posts' ? 'postsBarChart' : 'viewsBarChart');
            const pieEl = document.getElementById(prefix === 'posts' ? 'postsPieChart' : 'viewsPieChart');

            // ✅ (변경) 레이더 캔버스 id 그대로 사용하지만, "라인 차트"를 그릴 예정
            const radarEl = document.getElementById(prefix === 'posts' ? 'postsRadarChart' : 'viewsRadarChart');

            const bubbleEl = document.getElementById(prefix === 'posts' ? 'postsBubbleChart' : 'viewsBubbleChart');

            // ✅ 해당 그룹의 기존 차트만 제거
            if (prefix === 'posts') {
                postsBar = destroyChart(postsBar);
                postsPie = destroyChart(postsPie);
                postsRadar = destroyChart(postsRadar); // ✅ (변경) 라인 차트도 이 변수로 관리
                postsBubble = destroyChart(postsBubble);
            } else {
                viewsBar = destroyChart(viewsBar);
                viewsPie = destroyChart(viewsPie);
                viewsRadar = destroyChart(viewsRadar); // ✅ (변경)
                viewsBubble = destroyChart(viewsBubble);
            }

            const yLabel = prefix === 'posts' ? '게시물 수' : '조회수';
            const titleBar = prefix === 'posts' ? '사용자별 게시물 수 Top 10' : '게시물 조회수 순위 Top 10';
            const titlePie = prefix === 'posts' ? '게시물 수 비중(Top 10) · 사용자 점유율' : '조회수 비중(Top 10) · 점유율';

            // ✅ (변경) 레이더 대신 라인 차트 제목
            const titleLine = prefix === 'posts' ? '순위별 게시물 수 변화(Top 10)' : '순위별 조회수 변화(Top 10)';

            const titleBubble = prefix === 'posts' ? '게시물 수 vs 순위(규모 + 분포)' : '조회수 vs 순위(규모 + 분포)';

            // ===== 1) 막대 =====
            if (barEl) {
                const ch = new Chart(barEl.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{ label: yLabel, data: values }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: { display: true, text: titleBar, font: { size: 14 } },
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function (ctx) {
                                        const v = ctx.parsed?.y ?? ctx.parsed ?? 0;
                                        return ' ' + Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: yLabel },
                                ticks: {
                                    callback: function (v) {
                                        return Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                    },
                });

                if (prefix === 'posts') postsBar = ch;
                else viewsBar = ch;
            }

            // ===== 2) 원형 =====
            if (pieEl) {
                const ch = new Chart(pieEl.getContext('2d'), {
                    type: 'pie',
                    data: {
                        labels: labels,
                        datasets: [{ data: values }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: { display: true, text: titlePie, font: { size: 14 } },
                            legend: { position: 'bottom', labels: { boxWidth: 12 } },
                            tooltip: {
                                callbacks: {
                                    label: function (ctx) {
                                        const label = ctx.label || '';
                                        const v = ctx.parsed || 0;
                                        return label + ': ' + Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                    },
                });

                if (prefix === 'posts') postsPie = ch;
                else viewsPie = ch;
            }

            // ===== 3) ✅ (변경) 라인 차트 (레이더 자리 대체) =====
            // - x축: 순위(1~N)
            // - y축: 값(게시물 수/조회수)
            // - tooltip title에서 해당 순위의 "이름"을 보여줘서 비교가 더 직관적
            if (radarEl) {
                const rankLabels = values.map(function (_, i) {
                    return String(i + 1);
                }); // '1','2',...,'10'

                const ch = new Chart(radarEl.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: rankLabels,
                        datasets: [
                            {
                                label: yLabel,
                                data: values,
                                tension: 0.25,
                                fill: false,
                                pointRadius: 3,
                                pointHoverRadius: 5,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: { display: true, text: titleLine, font: { size: 14 } },
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    title: function (items) {
                                        const it = items && items[0];
                                        if (!it) return '';
                                        const idx = Number(it.label || '1') - 1; // 순위 -> index
                                        const name = labels[idx] || 'rank ' + (idx + 1);
                                        return idx + 1 + '위 · ' + name;
                                    },
                                    label: function (ctx) {
                                        const v = ctx.parsed?.y ?? ctx.parsed ?? 0;
                                        return yLabel + ': ' + Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                        scales: {
                            x: {
                                title: { display: true, text: '순위' },
                            },
                            y: {
                                beginAtZero: true,
                                title: { display: true, text: yLabel },
                                ticks: {
                                    callback: function (v) {
                                        return Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                    },
                });

                if (prefix === 'posts') postsRadar = ch; // ✅ 변수명 유지
                else viewsRadar = ch;
            }

            // ===== 4) 버블 =====
            if (bubbleEl) {
                const points = values.map(function (v, i) {
                    const r = 6 + Math.sqrt(Math.max(0, v)) * 0.6;
                    return { x: i + 1, y: v, r: Math.max(6, Math.min(30, r)) };
                });

                const ch = new Chart(bubbleEl.getContext('2d'), {
                    type: 'bubble',
                    data: {
                        datasets: [
                            {
                                label: titleBubble,
                                data: points,
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            title: { display: true, text: titleBubble, font: { size: 14 } },
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    title: function (items) {
                                        const it = items && items[0];
                                        if (!it) return '';
                                        const idx = (it.raw && it.raw.x ? it.raw.x : 1) - 1;
                                        const name = labels[idx] || 'rank ' + (idx + 1);
                                        return idx + 1 + '위 · ' + name;
                                    },
                                    label: function (ctx) {
                                        const y = ctx.raw?.y ?? 0;
                                        return yLabel + ': ' + Number(y).toLocaleString();
                                    },
                                },
                            },
                        },
                        scales: {
                            x: {
                                title: { display: true, text: '순위' },
                                ticks: {
                                    callback: function (v) {
                                        return v;
                                    },
                                },
                                min: 0,
                                max: labels.length + 1,
                            },
                            y: {
                                title: { display: true, text: yLabel },
                                beginAtZero: true,
                                ticks: {
                                    callback: function (v) {
                                        return Number(v).toLocaleString();
                                    },
                                },
                            },
                        },
                    },
                });

                if (prefix === 'posts') postsBubble = ch;
                else viewsBubble = ch;
            }
        }
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
