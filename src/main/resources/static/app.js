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
                () => (me = null),
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
<div style="opacity:.8">좌표: ${lat}, ${lon}</div>`,
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
<div style="opacity:.8">좌표: ${lat}, ${lon}</div>`,
            );
        }

        // =========================================================
        // ✅ 내부 OpenLayers map 찾기 (GLOBAL EXPOSE + SAFE)
        // - BusController 안에 있어도, window.getInnerOlMap 로 접근 가능하게 전역 노출
        // - window.__olMap / window.__ngiiMap / window.__mapProjection 도 함께 유지
        // - map을 못 찾으면 null 반환
        // =========================================================
        function getInnerOlMap() {
            // 0) 이미 잡아둔 olMap 재사용
            try {
                if (typeof olMap !== 'undefined' && olMap && typeof olMap.getView === 'function') {
                    // 전역 동기화(혹시 누락됐을 때)
                    try {
                        window.__olMap = olMap;
                    } catch (e0) {}
                    return olMap;
                }
            } catch (e00) {}

            // 1) ngiiMap이 준비 안 됐으면 전역 캐시라도 먼저 확인
            try {
                if ((!ngiiMap || typeof ngiiMap === 'undefined') && window.__olMap && typeof window.__olMap.getView === 'function') {
                    try {
                        olMap = window.__olMap;
                    } catch (e1) {}
                    return window.__olMap;
                }
            } catch (e11) {}

            // ngiiMap 자체가 없으면 종료
            try {
                if (typeof ngiiMap === 'undefined' || !ngiiMap) return null;
            } catch (e2) {
                return null;
            }

            let candidate = null;

            // 2) 후보 탐색: ngiiMap.map
            try {
                if (!candidate && ngiiMap.map && typeof ngiiMap.map.getView === 'function') candidate = ngiiMap.map;
            } catch (e3) {}

            // 3) 후보 탐색: ngiiMap.getMap()
            if (!candidate && typeof ngiiMap.getMap === 'function') {
                try {
                    const m = ngiiMap.getMap();
                    if (m && typeof m.getView === 'function') candidate = m;
                } catch (e) {
                    console.warn('[BusController] ngiiMap.getMap() 호출 실패:', e);
                }
            }

            // 4) 후보 탐색: ngiiMap._getMap()
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

            // 5) 후보 탐색: ngiiMap._map
            try {
                if (!candidate && ngiiMap._map && typeof ngiiMap._map.getView === 'function') candidate = ngiiMap._map;
            } catch (e4) {}

            // 6) 후보가 잡히면 캐시 + 전역 노출
            if (candidate) {
                try {
                    olMap = candidate;
                } catch (e5) {}

                // ✅ 콘솔/다른 유틸에서 사용 가능하게 전역 노출
                try {
                    window.__olMap = candidate;
                } catch (e6) {}
                try {
                    window.__ngiiMap = ngiiMap;
                } catch (e7) {}

                // projection도 전역으로 동기화
                try {
                    const view = candidate.getView && candidate.getView();
                    const proj = view && view.getProjection ? view.getProjection() : null;
                    if (proj) {
                        try {
                            mapProjection = proj;
                        } catch (e8) {}
                        try {
                            window.__mapProjection = proj;
                        } catch (e9) {}
                        try {
                            window.__mapProjectionCode = proj.getCode ? proj.getCode() : '';
                        } catch (e10) {}
                    }
                } catch (e) {}

                return candidate;
            }

            return null;
        }

        // =========================================================
        // ✅ (중요) 전역 함수로 노출
        // - 콘솔에서 getInnerOlMap() 바로 호출 가능
        // - ensureRouteLayer/drawBusRouteFromIndex 같은 "컨트롤러 밖 함수"도 동일 map을 잡음
        // =========================================================
        try {
            window.getInnerOlMap = getInnerOlMap;
        } catch (e0) {}
        try {
            window.__getInnerOlMap = getInnerOlMap;
        } catch (e1) {}

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
        // ✅ 버스 스타일(캐시) - 단일 정의로 통일 (REPLACE ALL)
        // - busArrowStyle(네 기존 화살표 스타일) "위에" 번호(Text)만 얹음
        // - normal/selected 둘 다 함수로 통일해서 feature별 routeNo/heading 반영
        // ---------------------------------------------------------
        function __ensureBusStyles() {
            if (!window.ol || !ol.style) return;

            // ✅ 캐시는 window로 1개만
            if (window.__BUS_STYLES__ && window.__BUS_STYLES__.__ready) return;

            // routeNo 안전 추출 (feature 우선)
            function pickRouteNo(feature) {
                const bus = feature && feature.get ? feature.get('bus') || feature.get('data') || feature.get('item') : null;

                const raw =
                    (feature && feature.get && (feature.get('routeNo') || feature.get('routeno') || feature.get('route_no'))) ||
                    (bus && (bus.routeno || bus.routeNo || bus.route_no || bus.routenm || bus.routeNm || bus.lineNo || bus.busRouteNm)) ||
                    '';

                const v = typeof __normalizeRouteNo === 'function' ? __normalizeRouteNo(raw) : String(raw || '').trim();
                return String(v || '').trim();
            }

            function pickHeadingRad(feature) {
                try {
                    const bus = feature && feature.get ? feature.get('bus') || feature.get('data') || feature.get('item') : null;

                    // headingRad 우선
                    let r = Number(feature && feature.get && feature.get('headingRad'));
                    if (isFinite(r)) return r;

                    // heading(도) -> rad
                    let hd = Number((feature && feature.get && (feature.get('heading') || feature.get('angle') || feature.get('hd'))) || (bus && (bus.heading || bus.angle || bus.hd)));

                    if (isFinite(hd)) return (hd * Math.PI) / 180;
                } catch (e) {}
                return 0;
            }

            // ✅ busArrowStyle을 "Style 또는 함수" 모두 지원
            function baseStyle(feature) {
                try {
                    if (typeof busArrowStyle === 'function') return busArrowStyle(feature);
                    return busArrowStyle; // Style 객체
                } catch (e) {
                    return null;
                }
            }

            // ✅ baseStyle + 번호(Text) 오버레이 (Style 1개 또는 배열 모두 처리)
            function withLabel(feature, isSelected) {
                const label = pickRouteNo(feature); // ''면 안 보이게 처리
                const rot = pickHeadingRad(feature);

                const txt = new ol.style.Style({
                    text: new ol.style.Text({
                        text: label ? String(label) : '',
                        offsetY: -18,
                        font: isSelected ? 'bold 13px Segoe UI' : 'bold 12px Segoe UI',
                        fill: new ol.style.Fill({ color: '#111827' }),
                        stroke: new ol.style.Stroke({ color: '#ffffff', width: 4 }),
                    }),
                });

                // ✅ base arrow rotation이 busArrowStyle에 반영 안 되는 케이스 대비:
                //    feature에 'headingRad'를 이미 넣고 있으니, busArrowStyle이 그걸 쓰게 두고
                //    여기서는 label만 얹는다.
                //    (만약 네 busArrowStyle이 rotation을 직접 계산하면 이 rot는 참고용)
                void rot;

                const base = baseStyle(feature);

                // base가 배열(Style[])이면 뒤에 txt 추가
                if (Array.isArray(base)) return base.concat([txt]);

                // base가 Style이면 [base, txt]
                if (base) return [base, txt];

                // base가 없으면 fallback: 삼각형 + 텍스트
                return [
                    new ol.style.Style({
                        image: new ol.style.RegularShape({
                            points: 3,
                            radius: isSelected ? 12 : 10,
                            rotation: rot,
                            fill: new ol.style.Fill({ color: isSelected ? 'rgba(239,68,68,0.95)' : 'rgba(37,99,235,0.95)' }),
                            stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                        }),
                    }),
                    txt,
                ];
            }

            window.__BUS_STYLES__ = {
                __ready: true,

                // ✅ normal/selected 둘 다 "함수"로 통일
                normal: function (feature) {
                    return withLabel(feature, false);
                },

                selected: function (feature) {
                    return withLabel(feature, true);
                },
            };
        }

        // ---------------------------------------------------------
        // ✅✅✅ (REPLACE) Bus Layer 생성
        // - 소스(busVectorSource)는 유지(= nearest pick용 데이터 유지)
        // - 레이어(busVectorLayer)는 "항상 숨김"으로 고정 => 얇은 화살표 제거
        // ---------------------------------------------------------
        function ensureBusVectorLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map) return;

            if (!window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return;

            if (!window.busVectorSource) window.busVectorSource = null;
            if (!window.busVectorLayer) window.busVectorLayer = null;

            // 소스는 유지(데이터는 계속 들어와야 nearest pick 가능)
            if (!window.busVectorSource) window.busVectorSource = new ol.source.Vector();

            // 레이어는 만들되 "무조건 숨김"
            if (!window.busVectorLayer) {
                window.busVectorLayer = new ol.layer.Vector({
                    source: window.busVectorSource,
                    // 화면에 안 보일거라 style은 의미없지만 안전하게 null
                    style: function () {
                        return null;
                    },
                    zIndex: 30,
                });
                try {
                    window.busVectorLayer.set('tag', 'bus');
                } catch (eT) {}
                map.addLayer(window.busVectorLayer);
            } else {
                // map에 빠졌으면 재-add
                try {
                    var arr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    if (arr && arr.indexOf(window.busVectorLayer) === -1) map.addLayer(window.busVectorLayer);
                } catch (eA) {}
            }

            // ✅ 핵심: 얇은 화살표 레이어 영구 숨김
            try {
                window.busVectorLayer.setVisible(false);
            } catch (eV) {}

            // 디버그
            window.__busVectorLayer = window.busVectorLayer;
            window.__busVectorSource = window.busVectorSource;

            // 강제 리렌더
            try {
                if (map.renderSync) map.renderSync();
                else if (map.render) map.render();
            } catch (eR) {}
        }

        // ---------------------------------------------------------
        // ✅✅✅ busVectorLayer(얇은 화살표) 강제 숨김
        // - 어디서 setVisible(true) 해도 다시 꺼지게 잠금
        // ---------------------------------------------------------
        function __forceHideBusArrowLayer() {
            try {
                if (typeof busVectorLayer !== 'undefined' && busVectorLayer && busVectorLayer.setVisible) {
                    busVectorLayer.setVisible(false);
                    // 스타일도 아예 제거(그림 자체 차단)
                    try {
                        busVectorLayer.setStyle(null);
                    } catch (e0) {}
                    try {
                        busVectorLayer.changed && busVectorLayer.changed();
                    } catch (e1) {}
                }
            } catch (e) {}

            // map에 붙어있으면 아예 remove (가장 확실)
            try {
                var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                if (map && busVectorLayer) {
                    var arr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    if (arr && arr.indexOf(busVectorLayer) !== -1 && map.removeLayer) {
                        map.removeLayer(busVectorLayer);
                    }
                }
            } catch (e2) {}
        }

        // ---------------------------------------------------------
        // ✅✅✅ 얇은 화살표(busVectorLayer) "강제 숨김 1회 + 유지" 유틸
        // - map init 끝나고 1번 호출하면 됨
        // ---------------------------------------------------------
        function __hideRealtimeBusLayerOnce() {
            try {
                var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                if (!map) return;

                // ensureBusVectorLayer가 아직 안 돌았으면 한 번 돌려서 layer 확보
                try {
                    if (typeof ensureBusVectorLayer === 'function') ensureBusVectorLayer();
                } catch (e0) {}

                if (window.busVectorLayer && window.busVectorLayer.setVisible) {
                    window.busVectorLayer.setVisible(false);
                }

                if (map.renderSync) map.renderSync();
                else if (map.render) map.render();
            } catch (e) {}
        }

        // =========================================================
        // ✅ Route Layer (ES5 안정 버전)
        // =========================================================
        var __ROUTE_STYLES__ = null;

        function normRouteKind(k) {
            var s = String(k || '').toUpperCase();
            if (s === 'TRAM_TOOL' || s === 'TRAMTOOL' || s === 'TOOL' || s === 'TRAM_TOOL_ROUTE') return 'TRAM_TOOL';
            if (s === 'WALK' || s === 'WALKING' || s === 'FOOT' || s === 'PED' || s === 'PEDESTRIAN') return 'WALK';
            if (s === 'TRAM' || s === 'RAIL' || s === 'TRAIN') return 'TRAM';
            return 'BUS';
        }

        // =========================================================
        // ✅✅✅ [REPLACE] safeLoadRoutePath (초안정 + 실제 지연 재시도 동작 개선판)
        // - loadRoutePath 없거나 캐시 안차는 프로젝트에서도 동작
        // - 1) loadRoutePath 있으면 warm(draw:false) 시도
        // - 2) 실패/없음이면 API 후보를 "순차" 탐색해서 routePathIndex 채움
        // - 3) 어떤 응답이든 coords/dirs/geometry/lines/points 폭넓게 흡수
        // - ✅ 핵심 개선:
        //    (a) "유효좌표(>=2)" 생길 때만 성공 처리 (빈응답 성공 금지)
        //    (b) 0개 coords 응답이 와도 "기존 유효 캐시를 덮어쓰지 않음"
        //    (c) rid별 in-flight 중복 호출 방지 (연타/동시호출 지연 제거)
        //    (d) Promise/$q 둘 다 호환
        // =========================================================
        function safeLoadRoutePath(rid, opts) {
            opts = opts || {};
            rid = String(rid || '').trim();
            if (!rid) return $q && $q.resolve ? $q.resolve(null) : Promise.resolve(null);

            var maxTry = opts.maxTry != null ? opts.maxTry : 6; // ✅ 기본 8 -> 6
            var delayMs = opts.delayMs != null ? opts.delayMs : 120; // ✅ 기본 180 -> 120
            var debug = !!opts.debug;

            var cc = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;

            function _resolve(v) {
                return $q && $q.resolve ? $q.resolve(v) : Promise.resolve(v);
            }
            function _reject(e) {
                return $q && $q.reject ? $q.reject(e) : Promise.reject(e);
            }
            function _delay(ms) {
                if (typeof $timeout === 'function') return $timeout(function () {}, ms);
                return new Promise(function (res) {
                    setTimeout(res, ms);
                });
            }
            function _asPromiseLike(p) {
                if (p && typeof p.then === 'function') return p;
                return _resolve(p);
            }

            // ✅ window 캐시 준비
            try {
                if (!window.routePathIndex) window.routePathIndex = {};
            } catch (e0) {}

            // ✅ rid별 in-flight 방지
            window.__safeLoadRoutePathInFlight = window.__safeLoadRoutePathInFlight || {};
            if (window.__safeLoadRoutePathInFlight[rid]) return window.__safeLoadRoutePathInFlight[rid];

            // ---------------------------------------------------------
            // ✅ 공통: "응답에서 유효 데이터"만 꺼내기 (wrapper 흡수)
            // - 주의: cand를 단일 객체로 줄이지 말고,
            //         배열(itemList/items/item)은 배열로 유지해야 coords 추출 가능
            // ---------------------------------------------------------
            function _unwrap(any) {
                if (!any) return null;

                // string JSON parse
                if (typeof any === 'string') {
                    try {
                        any = JSON.parse(any);
                    } catch (e0) {}
                }

                // axios/$http 응답
                if (any && typeof any === 'object' && any.data !== undefined) any = any.data;

                // 공공API wrapper
                try {
                    if (any && any.response && any.response.body && any.response.body.items) {
                        var it = any.response.body.items.item;
                        if (Array.isArray(it)) return it;
                        if (it) return [it];
                    }
                } catch (e1) {}

                // 흔한 구조
                if (Array.isArray(any)) return any;
                if (any && Array.isArray(any.itemList)) return any.itemList;
                if (any && Array.isArray(any.items)) return any.items;

                // items.item 같은 경우
                try {
                    if (any && any.items && Array.isArray(any.items.item)) return any.items.item;
                    if (any && any.items && any.items.item) return [any.items.item];
                } catch (e2) {}

                return any;
            }

            // ---------------------------------------------------------
            // ✅ 현재 캐시 가져오기
            // ---------------------------------------------------------
            function _getCached() {
                try {
                    return window.routePathIndex && window.routePathIndex[rid] ? window.routePathIndex[rid] : null;
                } catch (e0) {
                    return null;
                }
            }

            // ---------------------------------------------------------
            // ✅ 좌표 유무 폭넓게 체크
            // ---------------------------------------------------------
            function _hasCoordsLike(obj) {
                if (!obj || typeof obj !== 'object') return false;

                var dirs = obj.dirs || obj.dir || obj.paths || null;
                if (dirs) {
                    if (Array.isArray(dirs.ALL) && dirs.ALL.length >= 2) return true;
                    if (Array.isArray(dirs.all) && dirs.all.length >= 2) return true;
                    if (Array.isArray(dirs.UP) && dirs.UP.length >= 2) return true;
                    if (Array.isArray(dirs.up) && dirs.up.length >= 2) return true;
                    if (Array.isArray(dirs.DOWN) && dirs.DOWN.length >= 2) return true;
                    if (Array.isArray(dirs.down) && dirs.down.length >= 2) return true;
                    if (Array.isArray(dirs) && dirs.length >= 2) return true;
                }

                if (Array.isArray(obj.coords) && obj.coords.length >= 2) return true;
                if (Array.isArray(obj.line) && obj.line.length >= 2) return true;
                if (Array.isArray(obj.lines) && obj.lines.length >= 1 && Array.isArray(obj.lines[0]) && obj.lines[0].length >= 2) return true;
                if (Array.isArray(obj.geometry) && obj.geometry.length >= 2) return true;
                if (Array.isArray(obj.points) && obj.points.length >= 2) return true;

                return false;
            }

            // ---------------------------------------------------------
            // ✅ item 배열/객체에서 coords만 빠르게 추출 (유효길이 체크용)
            // ---------------------------------------------------------
            function _extractCoordsFromItems(items) {
                if (!items) return [];
                var arr = Array.isArray(items) ? items : [items];
                var coords = [];

                for (var i = 0; i < arr.length; i++) {
                    var it = arr[i] || {};
                    var lon = it.gpslong || it.gpsLong || it.gpsx || it.gpsX || it.lon || it.lng || it.x;
                    var lat = it.gpslati || it.gpsLati || it.gpsy || it.gpsY || it.lat || it.y;

                    lon = Number(lon);
                    lat = Number(lat);

                    if (isFinite(lon) && isFinite(lat)) coords.push([lon, lat]);
                }
                return coords;
            }

            // ---------------------------------------------------------
            // ✅ payload를 drawBusRouteFromIndex가 읽기 쉬운 형태로 정규화해서 저장
            // - 최종 저장 형태: routePathIndex[rid] = { proj:'EPSG:4326', routeId, dirs:{ALL:[...]}, coords:[...], raw }
            // - ✅ coords가 2개 미만이면 저장 금지 (0캐시 덮기 방지)
            // - ✅ 이미 유효 캐시가 있으면, 빈 payload로 덮어쓰기 금지
            // ---------------------------------------------------------
            function _normalizeAndStore(payload) {
                var prev = _getCached();
                var prevOk = _hasCoordsLike(prev);

                payload = _unwrap(payload);
                if (!payload) return prevOk ? prev : null;

                var info = {};

                // (1) payload가 "items 배열" 형태면 coords를 직접 만들고 ALL에 넣기
                if (Array.isArray(payload)) {
                    var coordsFromItems = _extractCoordsFromItems(payload);
                    if (!coordsFromItems || coordsFromItems.length < 2) {
                        if (prevOk) {
                            if (debug) console.warn('[safeLoadRoutePath] skip store (items coords too short, keep prev)', rid, coordsFromItems.length);
                            return prev;
                        }
                        if (debug) console.warn('[safeLoadRoutePath] skip store (items coords too short)', rid, coordsFromItems.length);
                        return null;
                    }

                    info.proj = 'EPSG:4326';
                    info.routeId = rid;
                    info.dirs = { ALL: coordsFromItems };
                    info.coords = coordsFromItems;
                    info.raw = payload;
                } else if (typeof payload === 'object') {
                    info.proj = String(payload.proj || payload.projection || payload.crs || 'EPSG:4326').trim();
                    info.routeId = String(payload.routeId || payload.routeid || payload.rid || rid).trim();

                    var dirs = payload.dirs || payload.dir || payload.paths || null;

                    if (dirs && typeof dirs === 'object' && !Array.isArray(dirs)) {
                        info.dirs = dirs;
                    } else {
                        var coordsAny = payload.coords || payload.line || payload.geometry || payload.points || (Array.isArray(payload.lines) ? payload.lines[0] : null) || (Array.isArray(dirs) ? dirs : null);

                        if (Array.isArray(coordsAny) && coordsAny.length >= 2) info.dirs = { ALL: coordsAny };
                        else info.dirs = {};
                    }

                    // 호환용 coords도 함께
                    try {
                        var d = info.dirs || {};
                        var arr0 = d.ALL || d.all || d.UP || d.up || d.DOWN || d.down || payload.coords || null;

                        // lines[0]인 경우도 coords로
                        if (!arr0 && Array.isArray(payload.lines) && Array.isArray(payload.lines[0]) && payload.lines[0].length >= 2) arr0 = payload.lines[0];

                        if (Array.isArray(arr0) && arr0.length >= 2) info.coords = arr0;
                    } catch (e1) {}

                    info.raw = payload;
                } else {
                    return prevOk ? prev : null;
                }

                // ✅ 최종 유효성
                if (!_hasCoordsLike(info)) {
                    // 빈 payload로 덮어쓰기 금지
                    if (prevOk) {
                        if (debug) console.warn('[safeLoadRoutePath] skip store (no coordsLike, keep prev)', rid);
                        return prev;
                    }
                    if (debug) console.warn('[safeLoadRoutePath] skip store (no coordsLike)', rid);
                    return null;
                }

                try {
                    window.routePathIndex = window.routePathIndex || {};
                    window.routePathIndex[rid] = info;
                } catch (e2) {}

                return info;
            }

            function _log(prefix) {
                if (!debug) return;
                try {
                    var info = _getCached();
                    var d = info && (info.dirs || {});
                    var arr = d.ALL || d.all || d.UP || d.up || d.DOWN || d.down || info.coords || null;
                    var len = arr && arr.length ? arr.length : -1;
                    console.log(prefix, 'rid=', rid, 'cached=', !!info, 'coordsLen=', len);
                } catch (e) {}
            }

            // ---------------------------------------------------------
            // ✅ (A) 기존 loadRoutePath 있으면 warm 시도
            // ---------------------------------------------------------
            function _tryWarmByExistingLoader() {
                var fn = null;

                try {
                    if (typeof loadRoutePath === 'function') fn = loadRoutePath;
                } catch (e0) {}
                if (!fn) {
                    try {
                        if (window && typeof window.loadRoutePath === 'function') fn = window.loadRoutePath;
                    } catch (e1) {}
                }
                if (!fn) return _resolve(null);

                var p = null;
                try {
                    // 프로젝트별 시그니처 차이 흡수: opts를 넘겨도 무해한 형태로
                    p = fn(rid, { draw: false, fit: false });
                } catch (e2) {
                    p = null;
                }

                return _asPromiseLike(p)
                    .then(function (warmRes) {
                        return _normalizeAndStore(warmRes);
                    })
                    .catch(function () {
                        return null;
                    });
            }

            // ---------------------------------------------------------
            // ✅ (B) fallback: API 탐색 호출
            // - 후보 마구 던지면 400 폭탄 -> ✅ 순차 시도 + 성공 조합 캐시
            // ---------------------------------------------------------
            window.__routePathUrlMaker = window.__routePathUrlMaker || null;

            var apiCandidateMakers = [
                function (cc, rid) {
                    return '/api/bus/routePath?cityCode=' + cc + '&routeId=' + encodeURIComponent(rid);
                },
                function (cc, rid) {
                    return '/api/bus/routePath?citycode=' + cc + '&routeId=' + encodeURIComponent(rid);
                },
                function (cc, rid) {
                    return '/api/bus/routePath?city_code=' + cc + '&routeId=' + encodeURIComponent(rid);
                },

                function (cc, rid) {
                    return '/api/bus/routePath?cityCode=' + cc + '&routeid=' + encodeURIComponent(rid);
                },
                function (cc, rid) {
                    return '/api/bus/routePath?cityCode=' + cc + '&busRouteId=' + encodeURIComponent(rid);
                },
                function (cc, rid) {
                    return '/api/bus/routePath?cityCode=' + cc + '&busrouteid=' + encodeURIComponent(rid);
                },
                function (cc, rid) {
                    return '/api/bus/routePath?cityCode=' + cc + '&route_id=' + encodeURIComponent(rid);
                },
            ];

            function fetchRoutePathFallback(rid) {
                if (typeof $http !== 'function') return _reject('no $http');

                // 0) 이미 성공한 템플릿 있으면 -> 그거만 호출
                if (window.__routePathUrlMaker) {
                    var url0 = window.__routePathUrlMaker(cc, rid);
                    return $http.get(url0);
                }

                // 1) 아직 템플릿 모르면 -> 후보 순차 시도
                var i = 0;

                function tryNext() {
                    if (i >= apiCandidateMakers.length) return _reject(new Error('routePath fallback: all candidates failed'));
                    var maker = apiCandidateMakers[i++];
                    var url = maker(cc, rid);

                    return $http
                        .get(url)
                        .then(function (res) {
                            // ✅ 여기서 "빈응답"이면 성공템플릿 캐시하지 말고 다음 후보
                            var info = _normalizeAndStore(res);
                            if (!info) {
                                if (debug) console.warn('[safeLoadRoutePath] api ok but empty coords -> try next', url);
                                return tryNext();
                            }

                            // ✅ 성공한 템플릿 캐시
                            window.__routePathUrlMaker = maker;
                            return res;
                        })
                        .catch(function () {
                            return tryNext();
                        });
                }

                return tryNext();
            }

            function _tryFetchByApi() {
                return fetchRoutePathFallback(rid)
                    .then(function (res) {
                        return _normalizeAndStore(res);
                    })
                    .catch(function () {
                        return null;
                    });
            }

            // ---------------------------------------------------------
            // ✅ 재시도 루프 (유효 캐시 생길 때만 종료)
            // ---------------------------------------------------------
            function _loop(tryNo) {
                _log('[safeLoadRoutePath] loop #' + tryNo);

                var cached0 = _getCached();
                if (_hasCoordsLike(cached0)) return _resolve(cached0);

                return _tryWarmByExistingLoader()
                    .then(function () {
                        var cached1 = _getCached();
                        if (_hasCoordsLike(cached1)) return cached1;

                        return _tryFetchByApi();
                    })
                    .then(function () {
                        var cached2 = _getCached();
                        if (_hasCoordsLike(cached2)) return cached2;

                        if (tryNo >= maxTry) {
                            _log('[safeLoadRoutePath] give up');
                            return null;
                        }

                        return _delay(delayMs).then(function () {
                            return _loop(tryNo + 1);
                        });
                    })
                    .catch(function () {
                        if (tryNo >= maxTry) return null;
                        return _delay(delayMs).then(function () {
                            return _loop(tryNo + 1);
                        });
                    });
            }

            // ✅ in-flight 등록
            var task = _loop(0).finally(function () {
                try {
                    delete window.__safeLoadRoutePathInFlight[rid];
                } catch (e) {}
            });

            window.__safeLoadRoutePathInFlight[rid] = task;

            return task;
        }

        // 콘솔에서도 확인 가능하게 노출
        try {
            window.safeLoadRoutePath = safeLoadRoutePath;
        } catch (eW) {}

        // =========================================================
        // ✅ (ADD/REPLACE) hydrateRouteStopIds (더 강하게 stopId 추출)
        // - loadResult가 routePath payload일 수도 있고, 별도 구조일 수도 있어서
        //   stopIds/nodeIds/stops/nodes 등 폭넓게 흡수
        // =========================================================
        function hydrateRouteStopIds(routeId, loadResult) {
            try {
                routeId = String(routeId || '').trim();
                if (!routeId) return;

                if (!window.routePathIndex) window.routePathIndex = {};
                var info = window.routePathIndex[routeId] || (window.routePathIndex[routeId] = {});

                var any = loadResult;
                if (any && any.data) any = any.data;
                any = (function unwrap(x) {
                    if (!x) return null;
                    if (typeof x === 'string') {
                        try {
                            x = JSON.parse(x);
                        } catch (e) {}
                    }
                    return (x.response && x.response.body && x.response.body.items && x.response.body.items.item) || (x.body && x.body.items && x.body.items.item) || (x.items && x.items.item) || x.item || x.result || x.data || x;
                })(any);

                if (!any) return;

                var raw = any.stopIds || any.stop_ids || any.nodeIds || any.node_ids || any.stops || any.stopList || any.nodes || any.nodeList || null;

                // payload 자체에 stops가 없을 때, dirs/coords에서 stopId를 뽑는 케이스도 방어
                // (예: coords가 [{lon,lat,nodeId}, ...] 구조)
                if (!raw && Array.isArray(any.coords)) raw = any.coords;
                if (!raw && any.dirs && any.dirs.ALL && Array.isArray(any.dirs.ALL)) raw = any.dirs.ALL;

                if (!raw) return;

                var ids = [];
                if (Array.isArray(raw)) {
                    for (var i = 0; i < raw.length; i++) {
                        var x = raw[i];
                        var sid = null;

                        if (x && typeof x === 'object') {
                            sid = x.nodeid || x.nodeId || x.nodeID || x.stopId || x.stopid || x.id || x.ID || x.node_id || x.stop_id || null;
                        } else {
                            sid = x;
                        }

                        sid = String(sid != null ? sid : '').trim();
                        if (sid) ids.push(sid);
                    }
                } else {
                    var one = String(raw).trim();
                    if (one) ids = [one];
                }

                if (!ids.length) return;

                // uniq
                var seen = {};
                var uniq = [];
                for (var j = 0; j < ids.length; j++) {
                    var k = ids[j];
                    if (!seen[k]) {
                        seen[k] = 1;
                        uniq.push(k);
                    }
                }

                info.stopIds = uniq;
            } catch (e) {}
        }

        // =========================================================
        // ✅✅✅ [REPLACE] ensureRouteLayer (SAFE + GLOBAL EXPOSE) - FINAL
        // - map에서 route 레이어를 "tag/path" 뿐 아니라 layerTag/name도 함께 탐색
        // - map layer source와 window source가 어긋난 케이스를 강제로 동기화
        // - visible/zIndex 강제 (가려져서 안 보이는 문제 방지)
        // - source 깨짐 자동 복구
        // =========================================================
        function ensureRouteLayer() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map) {
                console.warn('[ensureRouteLayer] map not ready');
                return false;
            }

            var OL = typeof ol !== 'undefined' ? ol : window && window.ol ? window.ol : null;
            if (!OL || !OL.layer || !OL.source || !OL.geom || !OL.style) {
                console.warn('[ensureRouteLayer] OL not ready');
                return false;
            }

            // ---------------------------------------------------------
            // 0) 스타일 캐시(1회)
            // ---------------------------------------------------------
            if (!window.__ROUTE_STYLES__) {
                window.__ROUTE_STYLES__ = {
                    BUS: new OL.style.Style({
                        stroke: new OL.style.Stroke({
                            color: '#2563eb',
                            width: 5,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                    WALK: new OL.style.Style({
                        stroke: new OL.style.Stroke({
                            color: '#111827',
                            width: 3,
                            lineCap: 'round',
                            lineJoin: 'round',
                            lineDash: [8, 8],
                        }),
                    }),
                    TRAM: new OL.style.Style({
                        stroke: new OL.style.Stroke({
                            color: '#ec4899',
                            width: 6,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                    TRAM_TOOL: new OL.style.Style({
                        stroke: new OL.style.Stroke({
                            color: '#111827',
                            width: 6,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                };
            }

            function __isVectorSourceOk(src) {
                return !!(src && src.getFeatures && src.clear && src.addFeature);
            }

            function __render() {
                try {
                    map.renderSync ? map.renderSync() : map.render && map.render();
                } catch (e) {}
            }

            // route 스타일 함수(레이어에 넣을 공통)
            function __routeStyleFn(feature) {
                var kind = '';
                try {
                    kind = feature && feature.get ? feature.get('pathKind') : '';
                } catch (e0) {}

                try {
                    if (typeof normRouteKind === 'function') kind = normRouteKind(kind);
                } catch (e1) {}

                kind = String(kind || '').toUpperCase();

                if (kind === 'TRAM_TOOL') return window.__ROUTE_STYLES__.TRAM_TOOL;
                if (kind === 'WALK') return window.__ROUTE_STYLES__.WALK;
                if (kind === 'TRAM') return window.__ROUTE_STYLES__.TRAM;
                return window.__ROUTE_STYLES__.BUS;
            }

            // window에 노출
            function __expose(layer, source) {
                try {
                    window.routeVectorLayer = layer;
                    window.routeVectorSource = source;
                    window.__routeVectorLayer = layer;
                    window.__routeVectorSource = source;
                } catch (e0) {}
                try {
                    window.ensureRouteLayer = ensureRouteLayer;
                } catch (e1) {}
            }

            // 레이어를 "route 레이어"로 판정하는 헬퍼
            function __isRouteLayer(ly) {
                try {
                    if (!ly || !ly.get) return false;
                    var t = String(ly.get('tag') || '').toLowerCase();
                    var lt = String(ly.get('layerTag') || '').toLowerCase();
                    var nm = String(ly.get('name') || '').toLowerCase();
                    return t === 'path' || lt === 'path' || nm === 'path' || t === 'route' || lt === 'route' || nm === 'route';
                } catch (e) {
                    return false;
                }
            }

            // 레이어에 route 표식 강제
            function __markAsRouteLayer(ly) {
                try {
                    if (ly && ly.set) ly.set('tag', 'path');
                } catch (e0) {}
                try {
                    if (ly && ly.set) ly.set('layerTag', 'path');
                } catch (e1) {}
                try {
                    if (ly && ly.set) ly.set('name', 'path');
                } catch (e2) {}
                try {
                    if (ly && ly.setVisible) ly.setVisible(true);
                } catch (e3) {}
                try {
                    if (ly && ly.setZIndex)
                        ly.setZIndex(80); // ✅ 위로 올림(가려짐 방지)
                    else if (ly && ly.set) ly.set('zIndex', 80);
                } catch (e4) {}
            }

            // ---------------------------------------------------------
            // 1) map 내부에서 route 레이어 먼저 찾기 (tag/layerTag/name 모두 허용)
            // ---------------------------------------------------------
            try {
                var layersArr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                for (var i = 0; i < layersArr.length; i++) {
                    var ly = layersArr[i];
                    if (!__isRouteLayer(ly)) continue;

                    var src = null;
                    try {
                        src = ly.getSource && ly.getSource() ? ly.getSource() : null;
                    } catch (eS0) {
                        src = null;
                    }

                    // 소스 깨졌으면 복구
                    if (!__isVectorSourceOk(src)) {
                        try {
                            var newSrc = new OL.source.Vector();
                            if (ly.setSource) ly.setSource(newSrc);
                            src = newSrc;
                            console.warn('[ensureRouteLayer] route layer source broken -> recreated');
                        } catch (eFix) {
                            console.warn('[ensureRouteLayer] cannot fix source:', eFix);
                            break;
                        }
                    }

                    // ✅ 레이어 스타일이 없으면 넣어줌(혹시 null이면)
                    try {
                        if (typeof ly.setStyle === 'function') ly.setStyle(__routeStyleFn);
                    } catch (eSty) {}

                    // ✅ 표식/가시성/zIndex 강제
                    __markAsRouteLayer(ly);

                    // ✅ window 글로벌 동기화
                    __expose(ly, src);
                    __render();
                    return true;
                }
            } catch (eFind) {}

            // ---------------------------------------------------------
            // 2) window alias가 있으면 map에 붙이고, source mismatch면 setSource로 통일
            // ---------------------------------------------------------
            var wLayer = null,
                wSource = null;

            try {
                wLayer = window.routeVectorLayer || window.__routeVectorLayer || null;
            } catch (e0) {}
            try {
                wSource = window.routeVectorSource || window.__routeVectorSource || null;
            } catch (e1) {}

            if (wLayer) {
                // source가 없거나 깨졌으면 새로 만들기
                if (!__isVectorSourceOk(wSource)) {
                    try {
                        wSource = new OL.source.Vector();
                    } catch (eMk) {
                        wSource = null;
                    }
                }

                // map에 없으면 추가
                try {
                    var layers2 = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    var exists = false;
                    for (var j = 0; j < layers2.length; j++) {
                        if (layers2[j] === wLayer) {
                            exists = true;
                            break;
                        }
                    }
                    if (!exists && map.addLayer) map.addLayer(wLayer);
                } catch (eAttach) {}

                // tag/zIndex/visible 강제
                __markAsRouteLayer(wLayer);

                // ✅ source mismatch면 강제로 window source를 layer에 세팅
                try {
                    var curSrc = wLayer.getSource && wLayer.getSource() ? wLayer.getSource() : null;
                    if (!__isVectorSourceOk(curSrc) || curSrc !== wSource) {
                        if (wLayer.setSource && wSource) wLayer.setSource(wSource);
                    }
                } catch (eSet) {}

                // 스타일 강제
                try {
                    if (typeof wLayer.setStyle === 'function') wLayer.setStyle(__routeStyleFn);
                } catch (eSty2) {}

                if (wSource) {
                    __expose(wLayer, wSource);
                    __render();
                    return true;
                }
            }

            // ---------------------------------------------------------
            // 3) 새로 생성 (정상 루트)
            // ---------------------------------------------------------
            var rvSource = new OL.source.Vector();

            var rvLayer = new OL.layer.Vector({
                source: rvSource,
                style: __routeStyleFn,
            });

            __markAsRouteLayer(rvLayer);

            try {
                if (map.addLayer) map.addLayer(rvLayer);
            } catch (eAdd) {}

            __expose(rvLayer, rvSource);
            __render();
            return true;
        }

        // ---------------------------------------------------------
        // ✅ [ADD ONCE] safe getters (window only)
        // ---------------------------------------------------------
        function __getRouteSourceSafe() {
            try {
                if (window.routeVectorSource && window.routeVectorSource.getFeatures) return window.routeVectorSource;
            } catch (e0) {}
            try {
                if (window.__routeVectorSource && window.__routeVectorSource.getFeatures) return window.__routeVectorSource;
            } catch (e1) {}
            return null;
        }

        function __getRouteLayerSafe() {
            try {
                return window.routeVectorLayer || window.__routeVectorLayer || null;
            } catch (e0) {}
            return null;
        }

        // =========================================================
        // ✅ [REPLACE] clearRouteLayer (ReferenceError 방지 + window only)
        // =========================================================
        function clearRouteLayer() {
            if (!ensureRouteLayer()) return;

            var src = __getRouteSourceSafe();
            if (!src || !src.clear) {
                console.warn('[clearRouteLayer] no route source');
                return;
            }

            try {
                src.clear(true);
            } catch (e0) {}

            try {
                var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                if (map) map.renderSync ? map.renderSync() : map.render && map.render();
            } catch (e1) {}
        }

        // =========================================================
        // ✅✅✅ [REPLACE] drawBusRouteFromIndex (FAST + EPSG:5179 + source오염 교정 + transform fail 로그)
        // - 핵심 성능:
        //   1) routeId|mapProj 투영변환 결과 캐시
        //   2) LineString feature 1개 재사용(geometry만 교체)
        //   3) clear는 기본 false (opts.clear=true일 때만 "다른 feature 제거" 방식)
        // =========================================================
        (function () {
            // ====== PERF caches (전역) ======
            // routeId|mapProj -> { ts, coords }
            var __routeProjCache = window.__routeProjCache || (window.__routeProjCache = {});
            var __routeFeature = window.__routeFeature || null;
            var __ROUTE_PROJ_TTL_MS = 1000 * 60 * 60; // 1시간
            var __routePerfDebug = false; // 필요하면 true

            function __isFresh(ts) {
                return ts && Date.now() - ts < __ROUTE_PROJ_TTL_MS;
            }

            // =========================================================
            // ✅ route source 안전 getter (tram tool에서도 동일 소스 사용)
            // =========================================================
            function __getRouteSourceSafe() {
                try {
                    if (window.routeVectorSource && window.routeVectorSource.getFeatures) return window.routeVectorSource;
                } catch (e0) {}
                try {
                    if (window.__routeVectorSource && window.__routeVectorSource.getFeatures) return window.__routeVectorSource;
                } catch (e1) {}
                return null;
            }

            // =========================================================
            // ✅ routeSrc를 "진짜 VectorSource"로 확보 (layer 오염 자동 교정)
            // =========================================================
            function __getRouteSourceFixed(map) {
                var src = null;

                try {
                    src = window.__routeVectorSource || window.routeVectorSource || null;
                } catch (e0) {}

                // ✅ src가 레이어면 source로 교정
                if (src && !src.getFeatures && src.getSource) {
                    try {
                        src = src.getSource();
                    } catch (e1) {}
                }

                // ✅ 그래도 안되면 layer에서 끌어오기
                if (!src || !src.getFeatures) {
                    var ly = null;
                    try {
                        ly = window.__routeVectorLayer || window.routeVectorLayer || null;
                    } catch (e2) {}
                    if (ly && ly.getSource) {
                        try {
                            src = ly.getSource();
                        } catch (e3) {}
                    }
                }

                // ✅ 마지막: map에서 tag='path' 레이어 탐색
                if ((!src || !src.getFeatures) && map && map.getLayers) {
                    try {
                        var arr = map.getLayers().getArray ? map.getLayers().getArray() : [];
                        for (var i = 0; i < arr.length; i++) {
                            var ly2 = arr[i];
                            if (!ly2 || !ly2.get) continue;
                            if (ly2.get('tag') === 'path') {
                                var s2 = ly2.getSource && ly2.getSource();
                                if (s2 && s2.getFeatures) {
                                    src = s2;
                                    window.__routeVectorSource = s2;
                                    window.routeVectorSource = s2;
                                    break;
                                }
                            }
                        }
                    } catch (e4) {}
                }

                // ✅ 최종 검사
                if (!src || !src.getFeatures || !src.addFeature) return null;
                return src;
            }

            // =========================================================
            // ✅ coords 추출 유틸 (다양한 키 흡수 + TAGO 응답도 흡수)
            // =========================================================
            function pickCoordsLike(info) {
                if (!info) return null;

                // 1) 기존 구조(dirs/coords/line 등)
                var dirs = info.dirs || info.dir || info.paths || info.path || {};
                var cand =
                    (dirs.ALL && dirs.ALL.length >= 2 && dirs.ALL) ||
                    (dirs.all && dirs.all.length >= 2 && dirs.all) ||
                    (dirs.UP && dirs.UP.length >= 2 && dirs.UP) ||
                    (dirs.up && dirs.up.length >= 2 && dirs.up) ||
                    (dirs.DOWN && dirs.DOWN.length >= 2 && dirs.DOWN) ||
                    (dirs.down && dirs.down.length >= 2 && dirs.down) ||
                    null;

                if (!cand && Array.isArray(dirs) && dirs.length >= 2) cand = dirs;

                if (!cand && Array.isArray(info.coords) && info.coords.length >= 2) cand = info.coords;
                if (!cand && Array.isArray(info.line) && info.line.length >= 2) cand = info.line;

                if (!cand && Array.isArray(info.lines) && info.lines.length) {
                    if (Array.isArray(info.lines[0]) && info.lines[0].length >= 2) cand = info.lines[0];
                }

                if (!cand && Array.isArray(info.geometry) && info.geometry.length >= 2) cand = info.geometry;
                if (!cand && Array.isArray(info.points) && info.points.length >= 2) cand = info.points;

                // 2) TAGO 응답 통째로 들어온 경우
                var d = info.raw || info.data || info.res || info;
                var items = null;

                try {
                    if (!cand) {
                        if (d && Array.isArray(d.itemList)) items = d.itemList;
                        else if (d && Array.isArray(d.items)) items = d.items;
                        else if (d && d.response && d.response.body && d.response.body.items) {
                            var it = d.response.body.items.item;
                            if (Array.isArray(it)) items = it;
                            else if (it) items = [it];
                        }
                    }
                } catch (eI2) {}

                if (!cand && items && items.length >= 2) cand = items;

                return cand || null;
            }

            // =========================================================
            // ✅ 한 점 파싱
            // =========================================================
            function parsePoint(p) {
                if (!p) return null;

                if (Array.isArray(p) && p.length >= 2) {
                    var a = Number(p[0]),
                        b = Number(p[1]);
                    if (isFinite(a) && isFinite(b)) return [a, b];
                    return null;
                }

                if (typeof p === 'object') {
                    var x = null,
                        y = null;

                    if (p.lon != null && p.lat != null) {
                        x = Number(p.lon);
                        y = Number(p.lat);
                    } else if (p.lng != null && p.lat != null) {
                        x = Number(p.lng);
                        y = Number(p.lat);
                    } else if (p.long != null && p.lati != null) {
                        x = Number(p.long);
                        y = Number(p.lati);
                    } else if (p.gpsLong != null && p.gpsLati != null) {
                        x = Number(p.gpsLong);
                        y = Number(p.gpsLati);
                    } else if (p.gpslong != null && p.gpslati != null) {
                        x = Number(p.gpslong);
                        y = Number(p.gpslati);
                    } else if (p.gpsx != null && p.gpsy != null) {
                        x = Number(p.gpsx);
                        y = Number(p.gpsy);
                    } else if (p.gpsX != null && p.gpsY != null) {
                        x = Number(p.gpsX);
                        y = Number(p.gpsY);
                    } else if (p.x != null && p.y != null) {
                        x = Number(p.x);
                        y = Number(p.y);
                    } else if (p.X != null && p.Y != null) {
                        x = Number(p.X);
                        y = Number(p.Y);
                    }

                    if (isFinite(x) && isFinite(y)) return [x, y];
                }

                return null;
            }

            function looksLikeLonLat(xy) {
                if (!xy || xy.length < 2) return false;
                var x = xy[0],
                    y = xy[1];
                return isFinite(x) && isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90;
            }

            function normProj(v) {
                v = String(v || '')
                    .trim()
                    .toUpperCase()
                    .replace(/\s+/g, '');
                if (!v) return '';
                if (v === '4326' || v === 'EPSG4326' || v === 'WGS84' || v === 'EPSG:4326') return 'EPSG:4326';
                return v;
            }

            // =========================================================
            // ✅ map projection
            // =========================================================
            function getMapProjCode(map) {
                var view = null,
                    mapProj = null,
                    mapProjCode = '';
                try {
                    view = map.getView && map.getView();
                } catch (eV) {}
                try {
                    mapProj = view && view.getProjection && view.getProjection();
                } catch (eP) {}
                try {
                    mapProjCode = (mapProj && mapProj.getCode ? mapProj.getCode() : '') || '';
                } catch (ePC) {}
                if (!mapProjCode) mapProjCode = 'EPSG:3857';
                return mapProjCode;
            }

            // =========================================================
            // ✅ EPSG:5179 변환 가능 상태인지 체크(핵심)
            // =========================================================
            function ensureProj5179IfNeeded(OL, toCode) {
                try {
                    if (String(toCode || '').toUpperCase() !== 'EPSG:5179') return true;

                    var has5179 = false;
                    try {
                        has5179 = !!(OL.proj && OL.proj.get && OL.proj.get('EPSG:5179'));
                    } catch (e0) {
                        has5179 = false;
                    }
                    if (has5179) return true;

                    if (!window.proj4 || !OL.proj || !OL.proj.proj4 || !OL.proj.proj4.register) {
                        console.warn('[drawBusRouteFromIndex] mapProj=EPSG:5179인데 proj4 등록이 안됨 → transform 불가');
                        return false;
                    }

                    // ✅ 5179 정의
                    window.proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
                    OL.proj.proj4.register(window.proj4);

                    try {
                        has5179 = !!(OL.proj.get && OL.proj.get('EPSG:5179'));
                    } catch (e1) {
                        has5179 = false;
                    }
                    if (!has5179) {
                        console.warn('[drawBusRouteFromIndex] EPSG:5179 register 시도했지만 여전히 미등록');
                        return false;
                    }

                    console.log('[proj] EPSG:5179 registered (inside drawBusRouteFromIndex)');
                    return true;
                } catch (e) {
                    console.warn('[drawBusRouteFromIndex] ensureProj5179 fail', e);
                    return false;
                }
            }

            // =========================================================
            // ✅ coords 변환 캐시 (routeId|mapProj)
            // =========================================================
            function getProjectedCoordsCached(OL, routeId, coordsAny, needTransform, mapProjCode) {
                var key = routeId + '|' + mapProjCode;

                var hit = __routeProjCache[key];
                if (hit && __isFresh(hit.ts) && hit.coords && hit.coords.length >= 2) return hit.coords;

                var coordsProj = [];
                var transformFailLogged = false;

                for (var i = 0; i < coordsAny.length; i++) {
                    var xy = parsePoint(coordsAny[i]);
                    if (!xy) continue;

                    if (needTransform && OL.proj && typeof OL.proj.transform === 'function' && looksLikeLonLat(xy)) {
                        try {
                            coordsProj.push(OL.proj.transform([xy[0], xy[1]], 'EPSG:4326', mapProjCode));
                        } catch (eT) {
                            if (!transformFailLogged) {
                                transformFailLogged = true;
                                console.warn('[drawBusRouteFromIndex] transform failed:', 'EPSG:4326 ->', mapProjCode, eT);
                            }
                        }
                    } else {
                        coordsProj.push([xy[0], xy[1]]);
                    }
                }

                __routeProjCache[key] = { ts: Date.now(), coords: coordsProj };
                return coordsProj;
            }

            // =========================================================
            // ✅ feature 1개 재사용 (geometry만 교체)
            // =========================================================
            function ensureRouteFeature(routeSrc, OL) {
                if (__routeFeature && __routeFeature.getGeometry) {
                    // source에 빠졌으면 재삽입
                    try {
                        var fs = routeSrc.getFeatures ? routeSrc.getFeatures() || [] : [];
                        if (fs.indexOf(__routeFeature) < 0) routeSrc.addFeature(__routeFeature);
                    } catch (e0) {}
                    return __routeFeature;
                }

                __routeFeature = new OL.Feature();
                try {
                    __routeFeature.set('layerTag', 'path');
                } catch (e1) {}
                try {
                    __routeFeature.set('segTag', 'single-seg');
                } catch (e2) {}
                try {
                    __routeFeature.set('kind', 'routeLine');
                } catch (e3) {}
                routeSrc.addFeature(__routeFeature);

                // window에도 저장(다른 함수에서도 재사용 가능)
                try {
                    window.__routeFeature = __routeFeature;
                } catch (e4) {}
                return __routeFeature;
            }

            // =========================================================
            // ✅✅✅ [REPLACE] drawBusRouteFromIndex
            // - 무조건 "한 줄"만 유지: routeSrc에 routeLine feature 1개만 남김
            // - 연속 클릭 시 이전 rAF 취소
            // - setGeometry 대신 setCoordinates 우선(빠름)
            // =========================================================
            function drawBusRouteFromIndex(routeId, opts) {
                opts = opts || {};
                routeId = String(routeId || '').trim();
                if (!routeId) return false;

                // ✅ clear 기본은 false 권장 (성능)
                var shouldClear = opts.clear === true;

                // map
                var map = (typeof getInnerOlMap === 'function' ? getInnerOlMap() : null) || window.__olMap || null;
                if (!map) {
                    console.warn('[drawBusRouteFromIndex] map not ready');
                    return false;
                }

                // OL
                var OL = typeof ol !== 'undefined' ? ol : window && window.ol ? window.ol : null;
                if (!OL || !OL.Feature || !OL.geom) {
                    console.warn('[drawBusRouteFromIndex] OL not ready');
                    return false;
                }

                // route layer/source 보장
                try {
                    if (typeof ensureRouteLayer === 'function') ensureRouteLayer();
                    if (typeof __syncRouteGlobals === 'function') __syncRouteGlobals();
                } catch (e0) {}

                // source 확보
                var routeSrc = null;
                try {
                    if (typeof __getRouteSourceFixed === 'function') routeSrc = __getRouteSourceFixed(map);
                } catch (e1) {}
                if (!routeSrc) {
                    try {
                        if (typeof __getRouteSourceSafe === 'function') routeSrc = __getRouteSourceSafe();
                    } catch (e2) {}
                }
                if (!routeSrc || !routeSrc.getFeatures) {
                    console.warn('[drawBusRouteFromIndex] routeSrc not ready');
                    return false;
                }

                // info 찾기
                var info = null;
                try {
                    info = (window.routePathIndex && window.routePathIndex[routeId]) || null;
                } catch (eI) {}
                if (!info) {
                    console.warn('[drawBusRouteFromIndex] routePathIndex missing:', routeId);
                    return false;
                }

                // coords 추출
                var coordsAny = null;
                try {
                    coordsAny = typeof pickCoordsLike === 'function' ? pickCoordsLike(info) : info.coords || null;
                } catch (eC) {
                    coordsAny = info.coords || null;
                }
                if (!coordsAny || coordsAny.length < 2) {
                    console.warn('[drawBusRouteFromIndex] coords missing', routeId);
                    return false;
                }

                // map projection
                var mapProjCode = 'EPSG:3857';
                try {
                    if (typeof getMapProjCode === 'function') mapProjCode = getMapProjCode(map);
                } catch (eP) {}

                // needTransform 판단
                var infoProj = '';
                try {
                    infoProj = typeof normProj === 'function' ? normProj(info.proj || info.projection || info.crs || '') : info.proj || '';
                } catch (eNP) {
                    infoProj = info.proj || '';
                }

                var needTransform = false;
                if (String(infoProj).toUpperCase() === 'EPSG:4326') needTransform = true;

                if (!infoProj) {
                    try {
                        var sample = typeof parsePoint === 'function' ? parsePoint(coordsAny[0]) || parsePoint(coordsAny[1]) : null;
                        if (sample && typeof looksLikeLonLat === 'function' && looksLikeLonLat(sample)) needTransform = true;
                    } catch (eS) {}
                }

                if (needTransform) {
                    try {
                        var sm = typeof parsePoint === 'function' ? parsePoint(coordsAny[0]) || null : null;
                        if (sm && typeof looksLikeLonLat === 'function' && !looksLikeLonLat(sm)) needTransform = false;
                    } catch (eSM) {}
                }

                // EPSG:5179 체크
                if (needTransform) {
                    try {
                        if (typeof ensureProj5179IfNeeded === 'function') {
                            if (!ensureProj5179IfNeeded(OL, mapProjCode) && String(mapProjCode).toUpperCase() === 'EPSG:5179') {
                                return false;
                            }
                        }
                    } catch (e5179) {}
                }

                // ✅ 투영변환 캐시 가져오기
                var coordsProj = null;
                try {
                    if (typeof getProjectedCoordsCached === 'function') {
                        coordsProj = getProjectedCoordsCached(OL, routeId, coordsAny, needTransform, mapProjCode);
                    } else {
                        coordsProj = coordsAny;
                    }
                } catch (ePC) {
                    coordsProj = coordsAny;
                }

                if (!coordsProj || coordsProj.length < 2) {
                    console.warn('[drawBusRouteFromIndex] coordsProj too short', routeId);
                    return false;
                }

                // =========================================================
                // ✅✅✅ 여기부터가 "두 줄 방지" 핵심
                // 1) routeLine feature 1개만 확보
                // 2) routeSrc에는 그 1개만 남김
                // =========================================================

                // 전역 재사용 feature 저장(없으면 생성)
                if (!window.__routeLineFeature) {
                    window.__routeLineFeature = new OL.Feature({ geometry: new OL.geom.LineString([]) });
                    try {
                        window.__routeLineFeature.set('kind', 'routeLine');
                        window.__routeLineFeature.set('layerTag', 'path');
                        window.__routeLineFeature.set('segTag', 'single-seg');
                    } catch (eF0) {}

                    try {
                        routeSrc.addFeature(window.__routeLineFeature);
                    } catch (eAdd0) {}
                }

                var f = window.__routeLineFeature;

                // clear 요청이면 geometry만 비움
                if (shouldClear) {
                    try {
                        var g0 = f.getGeometry && f.getGeometry();
                        if (g0 && g0.setCoordinates) g0.setCoordinates([]);
                    } catch (eClr0) {}
                }

                // ✅ routeSrc에 있는 다른 feature 전부 제거 → 무조건 1줄 유지
                try {
                    var all = routeSrc.getFeatures() || [];
                    for (var i = all.length - 1; i >= 0; i--) {
                        if (all[i] !== f) routeSrc.removeFeature(all[i]);
                    }
                    // 혹시 f가 source에 빠져있으면 다시 추가
                    if (routeSrc.getFeatures().indexOf(f) < 0) routeSrc.addFeature(f);
                } catch (ePurge) {}

                // 메타 업데이트
                try {
                    f.set('pathKind', 'BUS');
                } catch (eS0) {}
                try {
                    f.set('routeId', routeId);
                } catch (eS1) {}
                try {
                    f.set('coordsLen', coordsProj.length);
                } catch (eS3) {}

                // ✅ 연속 클릭 시 이전 rAF 취소
                try {
                    if (window.__routeLineRafId) cancelAnimationFrame(window.__routeLineRafId);
                } catch (eCan) {}

                window.__routeLineRafId = requestAnimationFrame(function () {
                    try {
                        var g = f.getGeometry && f.getGeometry();
                        if (g && g.setCoordinates) g.setCoordinates(coordsProj);
                        else f.setGeometry(new OL.geom.LineString(coordsProj));
                    } catch (eG) {
                        console.warn('[drawBusRouteFromIndex] setGeometry/coords fail', eG);
                    }

                    // fit
                    if (opts.fit) {
                        try {
                            var ext = f.getGeometry().getExtent();
                            if (ext && map.getView && map.getView()) {
                                map.getView().fit(ext, { padding: [40, 40, 40, 40], duration: 180, maxZoom: 17 });
                            }
                        } catch (eFit) {}
                    }

                    // render
                    try {
                        if (map.renderSync) map.renderSync();
                        else if (map.render) map.render();
                    } catch (eR) {}
                });

                // 로그
                try {
                    console.log(
                        '[drawBusRouteFromIndex] ok',
                        routeId,
                        'len=',
                        coordsProj.length,
                        'needTransform=',
                        needTransform,
                        'infoProj=',
                        infoProj,
                        'mapProj=',
                        mapProjCode,
                        'routeFeatures(after)=',
                        routeSrc.getFeatures ? routeSrc.getFeatures().length : '?',
                    );
                } catch (eDbg) {}

                return true;
            }

            // ✅ 전역 노출
            try {
                window.drawBusRouteFromIndex = drawBusRouteFromIndex;
            } catch (e0) {}
        })();

        // =========================================================
        // ✅🚋 트램 공구를 routeLayer에 그리기 (tramVectorLayer 없이)
        // - TRAM_ROUTES[n].coords 또는 .lines 지원
        // - 토글 가능 (같은 공구 다시 누르면 제거)
        // =========================================================
        function toggleTramToolOnRouteLayer(toolNo) {
            if (typeof ensureRouteLayer === 'function') ensureRouteLayer();

            var src = __getRouteSourceSafe();
            if (!src) return;

            var no = parseInt(toolNo, 10);
            if (!isFinite(no)) return;

            var tool = TRAM_ROUTES && TRAM_ROUTES[no];
            if (!tool) return;

            var feats = src.getFeatures ? src.getFeatures() : [];

            function isThisToolFeature(f) {
                if (!f || !f.get) return false;
                var pk = String(f.get('pathKind') || '').toUpperCase();
                var tno = f.get('tramToolNo');

                if (pk === 'TRAM_TOOL' && String(tno) === String(no)) return true;
                if (pk === 'TRAM' && String(tno) === String(no) && String(f.get('kind') || '') === 'tramTool') return true;
                return false;
            }

            var hasAny = feats.some(isThisToolFeature);
            if (hasAny) {
                feats.slice().forEach(function (f) {
                    if (isThisToolFeature(f)) src.removeFeature(f);
                });
                return;
            }

            // ✅ 토글 ON
            var metaBase = { tramToolNo: no, kind: 'tramTool' };

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
        // ✅🚋 트램 공구 전체 지우기 (옵션) - TRAM_TOOL 기준으로 정리
        // =========================================================
        function clearAllTramToolsOnRouteLayer() {
            if (typeof ensureRouteLayer === 'function') ensureRouteLayer();

            var src = __getRouteSourceSafe();
            if (!src) return;

            var feats = src.getFeatures ? src.getFeatures() : [];
            feats.slice().forEach(function (f) {
                if (!f || !f.get) return;
                var pk = String(f.get('pathKind') || '').toUpperCase();
                if (pk === 'TRAM_TOOL') src.removeFeature(f);
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
        // ✅ 지도 클릭 이벤트 바인딩(한 번만) - STABLE FIX
        // - stop/bus 우선 픽킹 (path 같은 라인에 가려지는 문제 방지)
        // - loadRoutePath 직접 호출 대신 safeLoadRoutePath 사용 (캐시 미러링 보장)
        // - drawBusRouteFromIndex 실패 시 routeId/routeNo fallback 가능
        // =========================================================
        function bindMapClickOnce() {
            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || clickBound) return;

            clickBound = true;

            // ✅ 안전 스케줄러
            function __sched(ms, fn) {
                try {
                    if (typeof __schedule === 'function') return __schedule(ms, fn);
                } catch (e0) {}
                return setTimeout(fn, ms || 0);
            }

            // ✅ feature kind 안전 추출
            function __getKind(ft) {
                if (!ft || !ft.get) return '';
                try {
                    var k = ft.get('kind');
                    return String(k || '').toLowerCase();
                } catch (e) {
                    return '';
                }
            }

            // ✅ stop/bus 우선으로 잡기 (path/기타 레이어가 먼저 잡히는 문제 해결)
            function __pickFeaturePreferStopBus(evt) {
                var pickedStop = null;
                var pickedBus = null;
                var pickedAny = null;

                try {
                    map.forEachFeatureAtPixel(
                        evt.pixel,
                        function (f, layer) {
                            if (!pickedAny) pickedAny = f;

                            var k = __getKind(f);
                            if (k === 'stop' && !pickedStop) pickedStop = f;
                            else if (k === 'bus' && !pickedBus) pickedBus = f;

                            // stop 우선, 없으면 bus, 없으면 계속 탐색
                            if (pickedStop) return pickedStop;
                            return undefined;
                        },
                        {
                            // ✅ 히트 톨러런스 조금 주면 클릭이 잘 잡힘
                            hitTolerance: 4,
                        },
                    );
                } catch (e) {}

                return pickedStop || pickedBus || pickedAny || null;
            }

            // ✅ routeLayer clear 안전
            function __clearRouteLayerSafe() {
                try {
                    if (typeof clearRouteLayer === 'function') return clearRouteLayer();
                } catch (e0) {}
                try {
                    var src = (window && window.__routeVectorSource && window.__routeVectorSource.clear ? window.__routeVectorSource : null) || (window && window.routeVectorSource && window.routeVectorSource.clear ? window.routeVectorSource : null);
                    if (src) src.clear(true);
                } catch (e1) {}
            }

            // ✅ drawBusRouteFromIndex 안전 호출
            function __drawFromIndexSafe(routeId) {
                try {
                    if (typeof window.drawBusRouteFromIndex === 'function') {
                        return !!window.drawBusRouteFromIndex(routeId, { clear: true, fit: false, rightPanelPadding: true });
                    }
                } catch (e0) {}
                return false;
            }

            map.on('singleclick', function (evt) {
                var ft = __pickFeaturePreferStopBus(evt);

                if (!ft) {
                    $scope.$applyAsync(function () {
                        $scope.selectedStop = null;
                        $scope.selectedBus = null;
                    });
                    lastPickedKey = null;
                    lastPickedKind = null;
                    try {
                        hideMapPopup();
                    } catch (eHide) {}
                    return;
                }

                var kind = __getKind(ft);

                // ---------------------------------------------------------
                // ✅ STOP 클릭
                // ---------------------------------------------------------
                if (kind === 'stop') {
                    var stop = null;
                    try {
                        stop = ft.get('stop') || null;
                    } catch (e0) {
                        stop = null;
                    }
                    if (!stop) return;

                    var nodeId = stop.nodeid || stop.nodeId || stop.nodeno || stop.nodeNo || '';
                    var pickKey = 'stop:' + String(nodeId || stop.nodenm || stop.nodeNm || '');

                    if (lastPickedKind === 'stop' && lastPickedKey === pickKey) {
                        $scope.$applyAsync(function () {
                            $scope.selectedStop = null;
                            $scope.selectedBus = null;
                        });
                        lastPickedKey = null;
                        lastPickedKind = null;
                        try {
                            hideMapPopup();
                        } catch (eHide2) {}
                        return;
                    }

                    lastPickedKey = pickKey;
                    lastPickedKind = 'stop';

                    $scope.$applyAsync(function () {
                        $scope.selectedBus = null;
                        $scope.selectedStop = stop;
                    });

                    // ✅ focusStop은 $applyAsync 한 번만으로도 충분
                    try {
                        $scope.$applyAsync(function () {
                            if (typeof $scope.focusStop === 'function') $scope.focusStop(stop);
                        });
                    } catch (eFS) {
                        try {
                            if (typeof $scope.focusStop === 'function') $scope.focusStop(stop);
                        } catch (eFS2) {}
                    }

                    try {
                        showStopPopup(evt.pixel, stop);
                    } catch (ePop1) {}
                    return;
                }

                // ---------------------------------------------------------
                // ✅ BUS 클릭
                // ---------------------------------------------------------
                if (kind === 'bus') {
                    var bus = null;
                    try {
                        bus = ft.get('bus') || null;
                    } catch (e0) {
                        bus = null;
                    }

                    var routeId = null;
                    var routeNo = null;
                    try {
                        routeId = ft.get('routeId') || ft.get('routeid') || null;
                    } catch (e1) {}
                    try {
                        routeNo = ft.get('routeNo') || ft.get('routeno') || null;
                    } catch (e2) {}

                    var plate = bus && (bus.vehicleno || bus.vehicleNo || bus.plainNo || bus.carNo || bus.busId || '');
                    var coord = null;
                    try {
                        coord = ft.getGeometry && ft.getGeometry().getCoordinates ? ft.getGeometry().getCoordinates() : null;
                    } catch (e3) {
                        coord = null;
                    }

                    var coordKey = coord ? Math.round(coord[0]) + ',' + Math.round(coord[1]) : '';
                    var pickKey = 'bus:' + String(plate || routeId + ':' + routeNo + ':' + coordKey);

                    if (lastPickedKind === 'bus' && lastPickedKey === pickKey) {
                        $scope.$applyAsync(function () {
                            $scope.selectedStop = null;
                            $scope.selectedBus = null;
                        });
                        lastPickedKey = null;
                        lastPickedKind = null;
                        try {
                            hideMapPopup();
                        } catch (eHide3) {}
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

                    try {
                        showBusPopup(evt.pixel, bus, routeNo);
                    } catch (ePop2) {}

                    // ✅ routeId 없으면 그릴 수 없음
                    routeId = String(routeId || '').trim();
                    if (!routeId) return;

                    // ✅ routeLayer(파란/분홍/점선) 먼저 비우기
                    __clearRouteLayerSafe();

                    // ✅ 핵심: safeLoadRoutePath로 "전역 캐시"까지 보장해놓고 index draw
                    var p = null;
                    try {
                        if (typeof safeLoadRoutePath === 'function') p = safeLoadRoutePath(routeId);
                        else if (window && typeof window.safeLoadRoutePath === 'function') p = window.safeLoadRoutePath(routeId);
                        else if (window && typeof window.loadRoutePath === 'function') {
                            // fallback: safeLoadRoutePath가 없으면 draw:false로만
                            p = window.loadRoutePath(routeId, { draw: false, fit: false });
                        }
                    } catch (eLR) {
                        p = null;
                    }

                    function drawNow() {
                        // 혹시 다른 레거시가 그렸으면 한번 더 정리
                        __clearRouteLayerSafe();

                        var ok = __drawFromIndexSafe(routeId);
                        if (!ok) {
                            // draw가 실패하면 1~2번 더 재시도(캐시 늦게 채워지는 경우)
                            __sched(120, function () {
                                __drawFromIndexSafe(routeId);
                            });
                        }
                    }

                    if (p && typeof p.then === 'function') {
                        p.then(drawNow).catch(function (e) {
                            console.warn('[safeLoadRoutePath/loadRoutePath] failed:', e);
                            drawNow();
                        });
                    } else {
                        __sched(180, drawNow);
                    }

                    return;
                }

                // ---------------------------------------------------------
                // ✅ kind가 없는 feature(예: path 라인) 클릭한 경우
                // ---------------------------------------------------------
                lastPickedKey = null;
                lastPickedKind = null;
                try {
                    hideMapPopup();
                } catch (eHide4) {}
            });
        }

        // =========================================================
        // ✅ NGII 지도 초기화 (안정/락 강화 버전)
        // =========================================================
        function initMap() {
            if (ngiiMap) {
                $timeout(function () {
                    var m0 = getInnerOlMap();
                    if (m0 && m0.updateSize) m0.updateSize();
                }, 0);
                return;
            }

            var div = document.getElementById('busMap');
            if (!div) return;
            if (!window.ngii_wmts) {
                console.error('[BusController] ngii_wmts 없음(스크립트 로드 확인)');
                return;
            }

            ensureMapSize();

            try {
                ngiiMap = new ngii_wmts.map('busMap', { zoom: 7 });
                window.busNgiiMap = ngiiMap;

                // ✅✅✅ map/layer 준비가 끝난 다음에 해야 하므로 200ms 콜백 안에서 처리
                $timeout(function () {
                    var m = getInnerOlMap();
                    if (!m) return;

                    // 1) 초기 center/zoom 저장
                    var view = m.getView && m.getView();
                    if (view) {
                        try {
                            var c = view.getCenter && view.getCenter();
                            var z = view.getZoom && view.getZoom();
                            initialCenter = c && c.slice ? c.slice() : c;
                            initialZoom = z;
                        } catch (e1) {}
                    }

                    // 2) 사이즈 갱신
                    try {
                        if (typeof m.updateSize === 'function') m.updateSize();
                    } catch (e2) {}

                    // 3) 레이어들 생성/부착
                    try {
                        ensureVectorLayer();
                    } catch (e3) {}
                    try {
                        ensureBusVectorLayer();
                    } catch (e4) {}
                    try {
                        ensureRouteLayer();
                    } catch (e5) {}
                    try {
                        bindMapClickOnce();
                    } catch (e6) {}

                    // =========================================================
                    // ✅✅✅ (추가) 전체정류장(빨간점) "초기 1회" 숨김 락
                    // =========================================================
                    try {
                        window.__forceHideAllStops = true;
                    } catch (e7) {}

                    // ✅ fallback: __hideAllStopsLayerOnly / __lockHideAllStops 없으면 직접 layer 찾아 숨김
                    function __fallbackHideAllStops() {
                        try {
                            if (typeof __hideAllStopsLayerOnly === 'function') {
                                __hideAllStopsLayerOnly();
                                return;
                            }

                            // fallback: tag나 source로 추정해서 숨김 (프로젝트마다 다름)
                            var layers = m.getLayers && m.getLayers().getArray ? m.getLayers().getArray() : [];
                            for (var i = 0; i < layers.length; i++) {
                                var lyr = layers[i];
                                if (!lyr || !lyr.get || !lyr.setVisible) continue;

                                var tag = String(lyr.get('tag') || '').toLowerCase();
                                // 너 프로젝트에서 all-stops / stops / stop 등으로 태그 달아둔 케이스 방어
                                if (tag.indexOf('all') >= 0 && tag.indexOf('stop') >= 0) lyr.setVisible(false);
                                else if (tag === 'stops' || tag === 'stop' || tag === 'allstops') lyr.setVisible(false);
                            }
                        } catch (e) {}
                    }

                    function __fallbackLockHideAllStops() {
                        try {
                            if (typeof __lockHideAllStops === 'function') {
                                __lockHideAllStops();
                                return;
                            }
                            // lock 함수가 없으면 최소한 지금 당장은 숨김 유지
                            __fallbackHideAllStops();
                        } catch (e) {}
                    }

                    try {
                        __fallbackHideAllStops();
                    } catch (e8) {}
                    try {
                        __fallbackLockHideAllStops();
                    } catch (e9) {}

                    // =========================================================
                    // ✅✅✅ (추가) 얇은 버스 화살표(busVectorLayer)도 "초기 1회" 강제 숨김
                    // - 두꺼운(nearest)만 남기려면 필수
                    // =========================================================
                    function __hideThinBusArrowLayer() {
                        try {
                            // 네가 이전에 붙여둔 유틸이 있으면 그거 우선
                            if (typeof __hideRealtimeBusLayerOnce === 'function') {
                                __hideRealtimeBusLayerOnce();
                                return;
                            }

                            // fallback: busVectorLayer 전역이 있으면 숨김
                            if (window.busVectorLayer && window.busVectorLayer.setVisible) {
                                window.busVectorLayer.setVisible(false);
                            }
                        } catch (e) {}
                    }

                    try {
                        __hideThinBusArrowLayer();
                    } catch (e10) {}

                    // ✅ 레이어가 더 늦게 붙는 경우 대비: 여러 타이밍으로 재숨김
                    function __rehideAll() {
                        try {
                            __fallbackHideAllStops();
                        } catch (e1) {}
                        try {
                            __hideThinBusArrowLayer();
                        } catch (e2) {}
                        try {
                            if (m) {
                                if (m.renderSync) m.renderSync();
                                else if (m.render) m.render();
                            }
                        } catch (e3) {}
                    }

                    $timeout(__rehideAll, 60);
                    $timeout(__rehideAll, 200);
                    $timeout(__rehideAll, 700);
                    $timeout(__rehideAll, 1200);
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
        // ✅✅✅ 버스 feature 재사용 (ULTRA STABLE v2)
        // - window.busVectorSource 동기화
        // - routeId / routeNo 키 통일
        // - lon/lat 좌표 들어와도 map projection 변환
        // - changed() + source.changed() + map.render 보강
        // =========================================================
        function upsertBusFeature(vehicleKey, coord, b, rid, routeNo, headingRad) {
            try {
                // ✅ busVectorSource 전역 동기화
                if (window && window.busVectorSource) {
                    busVectorSource = window.busVectorSource;
                } else {
                    window.busVectorSource = busVectorSource;
                }

                if (!busVectorSource || !window.ol || !ol.Feature || !ol.geom) return;

                // ✅ 좌표 안전 처리 (lon/lat → map projection 변환)
                function toMapXY(coord) {
                    if (!coord || coord.length < 2) return null;

                    var x = Number(coord[0]);
                    var y = Number(coord[1]);
                    if (!isFinite(x) || !isFinite(y)) return null;

                    // lon/lat처럼 보이면 transform
                    var looksLonLat = Math.abs(x) <= 180 && Math.abs(y) <= 90;

                    if (looksLonLat && window.ol && ol.proj && ol.proj.transform) {
                        try {
                            var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                            var view = map && map.getView && map.getView();
                            var proj = view && view.getProjection && view.getProjection();
                            var code = proj && proj.getCode ? proj.getCode() : 'EPSG:3857';
                            return ol.proj.transform([x, y], 'EPSG:4326', code);
                        } catch (e) {}
                    }
                    return [x, y];
                }

                var mapXY = toMapXY(coord);
                if (!mapXY) return;

                // ✅ routeNo 복구
                var rn = String(routeNo || '').trim();
                if (!rn && b) {
                    rn = String(b.routeno || b.routeNo || b.routenm || b.routeNm || b.lineNo || b.busRouteNm || '').trim();
                }

                // ✅ routeId 복구
                var rId = String(rid || (b && (b.routeid || b.routeId || b.busRouteId || b.route_id)) || '').trim();

                let f = busFeatureMap.get(vehicleKey);

                if (!f) {
                    f = new ol.Feature({ geometry: new ol.geom.Point(mapXY) });
                    f.set('kind', 'bus');
                    busFeatureMap.set(vehicleKey, f);
                    busVectorSource.addFeature(f);
                } else {
                    const g = f.getGeometry && f.getGeometry();
                    if (g && g.setCoordinates) g.setCoordinates(mapXY);
                }

                // ✅ 표준 키로 통일
                f.set('bus', b || null);
                f.set('routeId', rId);
                f.set('routeNo', rn);
                f.set('headingRad', headingRad);

                // 🔥 nearest 함수가 보는 키들도 같이 세팅
                f.set('routeid', rId);
                f.set('routeno', rn);

                // ✅ 스타일/렌더 강제 갱신
                try {
                    f.changed && f.changed();
                } catch (e0) {}
                try {
                    busVectorSource.changed && busVectorSource.changed();
                } catch (e1) {}

                // map render 보강
                try {
                    var map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                    if (map) {
                        if (map.renderSync) map.renderSync();
                        else if (map.render) map.render();
                    }
                } catch (e2) {}

                busLastSeen.set(vehicleKey, Date.now());
            } catch (e) {
                console.warn('[upsertBusFeature] error', e);
            }
        }

        // =========================================================
        // ✅ 오래된 버스 제거 (ULTRA STABLE v2)
        // - window.busVectorSource 동기화
        // =========================================================
        function cleanupStaleBuses() {
            try {
                if (window && window.busVectorSource) {
                    busVectorSource = window.busVectorSource;
                }

                if (!busVectorSource) return;

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
            } catch (e) {
                console.warn('[cleanupStaleBuses] error', e);
            }
        }

        // =========================================================
        // ✅ 버스 위치 조회 + 마커 갱신 (loadRoutePath 없어도 안 죽게 안전화 + stopIds 캐시)
        // - 핵심 수정:
        //   1) rid / rid2 혼용 제거 (항상 rid2를 기준으로 upsert)
        //   2) computeHeadingRad에 넘기는 routeId도 rid2로 통일
        //   3) loadRoutePath 결과에 stops/stopIds가 있으면 routePathIndex[routeId].stopIds에 저장
        // =========================================================
        function fetchAndDrawBusLocations(arrivalList) {
            ensureBusVectorLayer();

            const map = getInnerOlMap();
            if (!map || !busVectorSource || !window.ol || !ol.Feature || !ol.geom) return;

            if (!arrivalList || !arrivalList.length) {
                cleanupStaleBuses();
                return;
            }

            // ------------------------------
            // routeId -> routeNo 인덱스
            // ------------------------------
            const routeNoIndex = {};
            arrivalList.forEach(function (x) {
                const rid = String(x.routeid || x.routeId || x.busRouteId || x.route_id || '').trim();
                if (!rid) return;
                const routeNoRaw = x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '';
                routeNoIndex[rid] = routeNoRaw != null ? String(routeNoRaw) : '';
            });

            // ------------------------------
            // routeId set
            // ------------------------------
            const routeIdSet = new Set();
            arrivalList.forEach(function (x) {
                const rid = String(x.routeid || x.routeId || x.busRouteId || x.route_id || '').trim();
                if (rid) routeIdSet.add(rid);
            });

            if (!routeIdSet.size) {
                cleanupStaleBuses();
                return;
            }

            // =========================================================
            // ✅ bus 위치 갱신 루프 (네 코드 그대로 유지 + warmRes/캐시로그 강화)
            // =========================================================
            var promises = [];

            routeIdSet.forEach(function (rid) {
                promises.push(
                    safeLoadRoutePath(rid, { debug: false }) // 필요하면 debug:true
                        .then(function (warmRes) {
                            // ✅ stopIds 캐시(가능하면)
                            hydrateRouteStopIds(rid, warmRes);

                            // ✅ 전역 캐시 확인 로그
                            try {
                                console.log('[warmup] rid=', rid, 'hasIndex=', !!(window.routePathIndex && window.routePathIndex[rid]));
                            } catch (e0) {}
                            return null;
                        })
                        .catch(function (eWarm) {
                            console.warn('[fetchAndDrawBusLocations] routePath warmup fail (ignored):', rid, eWarm);
                            return null;
                        })
                        .then(function () {
                            return $http.get('/api/bus/pos', {
                                params: {
                                    cityCode: typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25,
                                    routeId: rid,
                                    numOfRows: 100,
                                },
                            });
                        })
                        .then(function (res) {
                            var data = res && res.data;

                            // ✅ JSON parse 안전화
                            if (typeof data === 'string') {
                                try {
                                    data = JSON.parse(data);
                                } catch (eJson) {
                                    console.warn('[fetchAndDrawBusLocations] JSON.parse fail:', rid, eJson);
                                    return;
                                }
                            }

                            var body = ((data || {}).response || {}).body || {};
                            var list = (body.items && body.items.item) || [];
                            if (!Array.isArray(list)) list = list ? [list] : [];

                            var mapObj = getInnerOlMap();
                            var view = mapObj && mapObj.getView && mapObj.getView();
                            var proj = view && view.getProjection ? view.getProjection() : mapProjection;

                            for (var ii = 0; ii < list.length; ii++) {
                                var b = list[ii];

                                var rawLat = b.gpslati || b.gpsLati || b.gpsY || b.lat || b.latitude;
                                var rawLon = b.gpslong || b.gpsLong || b.gpsX || b.lon || b.longitude;

                                var lat = parseFloat(rawLat);
                                var lon = parseFloat(rawLon);
                                if (!isFinite(lat) || !isFinite(lon)) continue;

                                var coord = [lon, lat];
                                if (ol.proj && ol.proj.transform && proj) {
                                    coord = ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                                }

                                // ✅ routeId는 b에서 추출 우선
                                var rid2 = String(b.routeid || b.routeId || b.busRouteId || b.route_id || rid || '').trim();
                                if (!rid2) continue;

                                var routeNoRaw = (routeNoIndex && routeNoIndex[rid2]) || b.routeno || b.routeNo || b.routenm || b.routeNm || b.lineNo || b.busRouteNm || '';
                                var routeNo = routeNoRaw != null ? String(routeNoRaw) : '';

                                var vehicleKey = b.vehicleno || b.vehicleNo || b.carNo || b.busId || b.plainNo || b.vehId || b.veh_id;
                                if (!vehicleKey) vehicleKey = rid2 + ':' + routeNo + ':' + ii;
                                vehicleKey = String(vehicleKey);

                                var headingRad = computeHeadingRad(b, lon, lat, vehicleKey, coord, rid2);

                                upsertBusFeature(vehicleKey, coord, b, rid2, routeNo, headingRad);

                                busLastPos.set(vehicleKey, { lon: lon, lat: lat });
                                busLastProjPos.set(vehicleKey, coord);
                            }
                        }),
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
        // ✅ 폴링 (안정화 버전 - FINAL)
        // - 요청 겹침 방지(inflight)
        // - nodeId 변경/폴링 세션 변경 시 이전 결과 무시(token)
        // - loadArrivalAndBus 옵션(keepIfEmpty/keepOnFail) 적용
        // - 탭/화면 비활성화 시 자동 pause(선택)
        // - 컨트롤러 종료 시 자동 cancel
        // =========================================================
        var __pollInflight = false;
        var __pollToken = 0;
        var __pollLastTickAt = 0;

        function stopPolling() {
            try {
                if (pollPromise) {
                    $interval.cancel(pollPromise);
                    pollPromise = null;
                }
            } catch (e) {}
            __pollInflight = false;
        }

        // (선택) 탭 비활성화면 폴링 스킵하고 싶으면 true
        var __pollSkipWhenHidden = true;
        function __isPageHidden() {
            try {
                return !!(document && typeof document.hidden === 'boolean' && document.hidden);
            } catch (e) {
                return false;
            }
        }

        function startPolling() {
            // 기존 폴링 정리
            stopPolling();

            // nodeId 없으면 시작 안 함
            if (!currentNodeId) return;

            // 이번 폴링 세션 토큰
            var myToken = ++__pollToken;

            pollPromise = $interval(function () {
                // 폴링 도중 nodeId 없어졌거나 세션이 바뀌면 stop
                if (!currentNodeId || myToken !== __pollToken) {
                    stopPolling();
                    return;
                }

                // (선택) 탭 숨김이면 스킵 (CPU/네트워크 절약)
                if (__pollSkipWhenHidden && __isPageHidden()) return;

                // 너무 촘촘한 중복 실행 방지(예: POLL_MS 변경/드리프트)
                var now = Date.now();
                if (__pollLastTickAt && now - __pollLastTickAt < Math.max(250, Math.floor(POLL_MS * 0.5))) {
                    return;
                }
                __pollLastTickAt = now;

                // 요청 겹침 방지
                if (__pollInflight) return;
                __pollInflight = true;

                // ✅ "잠깐 보여주기용" 로컬 업데이트 (있으면)
                try {
                    if (typeof applyPollStepToArrivals === 'function') applyPollStepToArrivals();
                } catch (e0) {}

                var ret = null;

                try {
                    // ✅ 폴링에서는 "목록 사라짐" 방지 옵션을 기본으로
                    // - keepIfEmpty: 빈 배열이면 기존 유지
                    // - keepOnFail : 실패하면 기존 유지
                    ret = loadArrivalAndBus(currentNodeId, {
                        keepIfEmpty: true,
                        keepOnFail: true,
                    });
                } catch (e1) {
                    ret = null;
                }

                // inflight 해제 (promise / non-promise 모두)
                function done() {
                    __pollInflight = false;
                }

                // $q promise는 finally가 있음(대부분)
                if (ret && typeof ret.finally === 'function') {
                    ret.finally(done);
                    return;
                }

                // then만 있는 promise도 처리
                if (ret && typeof ret.then === 'function') {
                    ret.then(
                        function () {},
                        function () {},
                    );
                    // finally가 없는 경우 대비
                    $timeout(done, Math.max(200, Math.floor(POLL_MS * 0.6)));
                    return;
                }

                // promise를 안 주는 함수면, 짧게 타임아웃으로 해제(겹침 방지 최소)
                $timeout(done, Math.max(200, Math.floor(POLL_MS * 0.6)));
            }, POLL_MS);
        }

        // ✅ 정류장 바뀔 때 이전 폴링 응답 무시/리셋하고 싶으면 이 헬퍼 사용(선택)
        function restartPollingForNode(newNodeId) {
            try {
                currentNodeId = String(newNodeId || '').trim();
            } catch (e) {}
            // 세션 갱신(기존 in-flight 결과 무시)
            __pollToken++;
            startPolling();
        }

        // ✅ 컨트롤러/스코프 종료 시 자동 정리 (중복 폴링 방지)
        try {
            $scope.$on('$destroy', function () {
                stopPolling();
                __pollToken++;
            });
        } catch (e) {}

        // =========================================================
        // ✅ 수동 새로고침
        // =========================================================
        $scope.refreshNow = function () {
            if (!currentNodeId) {
                try {
                    return setStatus('error', '먼저 정류장을 선택/검색하세요.', 1500);
                } catch (e) {
                    return;
                }
            }

            try {
                setStatus('info', '⟳ 수동 새로고침...', 800);
            } catch (e2) {}

            // 수동은 "빈배열이어도 반영"하고 싶으면 keepIfEmpty=false
            // (원하면 keepIfEmpty:true로 바꿔도 됨)
            loadArrivalAndBus(currentNodeId, {
                keepIfEmpty: false,
                keepOnFail: true,
            });
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
        // ✅ [ADD ONCE] loadArrivalAndBus alias (STABLE - FINAL)
        // - 실체 함수: fetchArrivalForStop(cityCode, nodeId)
        // - ✅ 응답 형태(JSON/response/body/items/item 등) 전부 흡수
        // - ✅ nodeId 변경 레이스 방지(token + currentNodeId match)
        // - ✅ 실패/빈배열로 "목록 사라짐" 방지 옵션 제공
        // - ✅ arrivals 받은 뒤 버스 위치 갱신(fetchAndDrawBusLocations)까지 같이 호출(화살표/nearest용)
        // =========================================================
        var __arrivalReqToken = 0;

        function loadArrivalAndBus(nodeId, opts) {
            opts = opts || {};
            nodeId = String(nodeId || '').trim();
            if (!nodeId) return;

            // ✅ cityCode 안전 확보
            var cityCode = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;
            cityCode = parseInt(cityCode, 10);
            if (!isFinite(cityCode)) cityCode = 25;

            // ✅ 이번 요청 토큰(늦게 온 응답 무시)
            var myToken = ++__arrivalReqToken;
            var myNode = nodeId;

            // ---------------------------------------------------------
            // ✅ 어떤 응답이든 "도착 리스트(item[])"로 뽑아내기
            // ---------------------------------------------------------
            function extractList(any) {
                if (!any) return [];

                // 문자열 JSON이면 파싱 시도
                if (typeof any === 'string') {
                    try {
                        any = JSON.parse(any);
                    } catch (e0) {}
                }

                // $http response면 data 우선
                if (any && any.data != null) any = any.data;

                // 이미 배열
                if (Array.isArray(any)) return any;

                // 흔한 케이스들: { response:{ body:{ items:{ item:[...] } } } }
                var candidate =
                    (any.response && any.response.body && any.response.body.items && any.response.body.items.item) || (any.body && any.body.items && any.body.items.item) || (any.items && any.items.item) || any.item || any.list || any.data || null;

                if (Array.isArray(candidate)) return candidate;
                if (candidate) return [candidate];

                // 어떤 프로젝트는 {arrivals:[...]} 같은 형태
                if (Array.isArray(any.arrivals)) return any.arrivals;

                // 마지막 fallback: 객체면 1개
                if (typeof any === 'object') return [any];

                return [];
            }

            // ---------------------------------------------------------
            // ✅ list -> 화면 모델로 매핑
            // - 리턴: { mapped, rawList }
            // - rawList는 fetchAndDrawBusLocations에 넘겨서 "화살표/버스위치"도 갱신되게 함
            // ---------------------------------------------------------
            function mapArrivals(any) {
                var rawList = extractList(any);

                var mapped = rawList
                    .map(function (x) {
                        x = x || {};

                        var routeNo = String(x.routeno || x.routeNo || x.route_no || x.routeNoNm || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '').trim();

                        var routeId = String(x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid || '').trim();

                        var secRaw = x.arrtime || x.arrTime || x.remaintime || x.remainTime || x.arrsec || x.arrSec || x.arrivalSec || x.arrmsgSec || x.traTime || x.timeSec || x.time || null;

                        var etaSec = Number(secRaw);
                        if (!isFinite(etaSec) || etaSec < 0) etaSec = null;

                        var msg = String(x.arrmsg1 || x.arrmsg2 || x.arrMsg1 || x.arrMsg2 || x.message || '').trim();

                        return { routeNo: routeNo, routeId: routeId, etaSec: etaSec, msg: msg, _raw: x };
                    })
                    .filter(function (a) {
                        return !!(a.routeNo || a.routeId);
                    });

                // ✅ 정렬: etaSec 있는 것 먼저
                mapped.sort(function (a, b) {
                    var aa = a.etaSec == null ? 1e18 : a.etaSec;
                    var bb = b.etaSec == null ? 1e18 : b.etaSec;
                    if (aa !== bb) return aa - bb;
                    return String(a.routeNo || '').localeCompare(String(b.routeNo || ''));
                });

                return { mapped: mapped, rawList: rawList };
            }

            // ---------------------------------------------------------
            // ✅ $scope 반영 (레이스/사라짐 방지 옵션 포함)
            // ---------------------------------------------------------
            function applyToScope(mapped) {
                // ✅ 레이스 방지: 요청 토큰/노드가 아직 유효할 때만 반영
                if (myToken !== __arrivalReqToken) return false;

                // currentNodeId를 쓰는 프로젝트면 이것도 체크
                try {
                    if (typeof currentNodeId !== 'undefined' && currentNodeId) {
                        if (String(currentNodeId) !== String(myNode)) {
                            // currentNodeId가 이미 다른 정류장으로 바뀐 상태면 무시
                            return false;
                        }
                    }
                } catch (eCur) {}

                // ✅ 빈 배열이면 덮어써서 "사라짐" 방지 옵션
                // - opts.keepIfEmpty=true면 빈 배열일 때 기존 $scope.arrivals 유지
                if ((!mapped || !mapped.length) && opts.keepIfEmpty) return true;

                try {
                    if (typeof $scope !== 'undefined' && $scope) {
                        $scope.$evalAsync(function () {
                            if (myToken !== __arrivalReqToken) return;

                            // 여기서도 currentNodeId 체크(있으면)
                            try {
                                if (typeof currentNodeId !== 'undefined' && currentNodeId) {
                                    if (String(currentNodeId) !== String(myNode)) return;
                                }
                            } catch (eCur2) {}

                            $scope.arrivals = mapped || [];
                            $scope.currentNodeId = myNode;
                        });
                    }
                } catch (e0) {}

                return true;
            }

            // ---------------------------------------------------------
            // ✅ fetchArrivalForStop 함수 찾기
            // ---------------------------------------------------------
            var fn = null;
            try {
                if (window && typeof window.fetchArrivalForStop === 'function') fn = window.fetchArrivalForStop;
            } catch (e1) {}
            try {
                if (!fn && typeof fetchArrivalForStop === 'function') fn = fetchArrivalForStop;
            } catch (e2) {}
            try {
                if (!fn && $scope && typeof $scope.fetchArrivalForStop === 'function') fn = $scope.fetchArrivalForStop;
            } catch (e3) {}
            try {
                if (!fn && $rootScope && typeof $rootScope.fetchArrivalForStop === 'function') fn = $rootScope.fetchArrivalForStop;
            } catch (e4) {}

            if (!fn) {
                console.warn('[loadArrivalAndBus] fetchArrivalForStop not found. nodeId=', nodeId);
                return;
            }

            // ---------------------------------------------------------
            // ✅ 호출 + 결과 반영 (promise/non-promise 둘 다)
            // - ✅ arrivals 받은 뒤 버스 위치도 갱신해서 "화살표/nearest"가 뜨게 함
            // ---------------------------------------------------------
            try {
                // currentNodeId를 쓰는 프로젝트면 여기서 세팅해두는게 안정적
                try {
                    if (typeof currentNodeId !== 'undefined') currentNodeId = myNode;
                } catch (eSet) {}

                var ret = fn(cityCode, nodeId);

                if (ret && typeof ret.then === 'function') {
                    return ret
                        .then(function (v) {
                            var out = mapArrivals(v);
                            applyToScope(out.mapped);

                            // ✅ 버스 위치 갱신 (있을 때만)
                            try {
                                if (typeof fetchAndDrawBusLocations === 'function') {
                                    fetchAndDrawBusLocations(out.rawList);
                                }
                            } catch (eBus) {}

                            return out.mapped;
                        })
                        .catch(function (err) {
                            console.warn('[loadArrivalAndBus] fetch fail:', err);

                            // ✅ 실패 시 목록 유지 옵션: keepOnFail=true면 기존 arrivals 유지
                            if (opts.keepOnFail) return null;

                            // 기본은 "사라짐 방지"를 위해 빈배열 덮지 않음(=그냥 종료)
                            return null;
                        });
                }

                // 동기 반환
                var out2 = mapArrivals(ret);
                applyToScope(out2.mapped);

                try {
                    if (typeof fetchAndDrawBusLocations === 'function') {
                        fetchAndDrawBusLocations(out2.rawList);
                    }
                } catch (eBus2) {}

                return out2.mapped;
            } catch (e5) {
                console.warn('[loadArrivalAndBus] call fail:', e5);
            }
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

            // ✅ cityCode 안전 확보
            function __getCityCode() {
                var c = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;
                var n = parseInt(c, 10);
                return isFinite(n) ? n : 25;
            }

            // ---------------------------------------------------------
            // ✅✅✅ [ADD] 도착정보 로더 "안전 호출" 래퍼 (ReferenceError 방지)
            // - 핵심: fetchArrivalForStop(cityCode, nodeId)로 정확히 호출 + $scope.arrivals 채움
            // ---------------------------------------------------------
            function __callLoadArrivalAndBus(nodeId) {
                nodeId = String(nodeId || '').trim();
                if (!nodeId) return;

                var cityCode = __getCityCode();

                // ✅ fetchArrivalForStop(도착목록)를 "실제 데이터로 UI에 채우는" 공통 처리
                function __applyArrivalListToScope(list) {
                    try {
                        list = Array.isArray(list) ? list : list ? [list] : [];
                        var mapped = list
                            .map(function (x) {
                                x = x || {};
                                var routeNo = String(x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '').trim();
                                var routeId = String(x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid || '').trim();

                                // 남은시간(sec) 후보들
                                var secRaw = x.arrtime || x.arrTime || x.remaintime || x.remainTime || x.arrsec || x.arrSec || x.arrivalSec || x.arrmsgSec || x.traTime;
                                var etaSec = Number(secRaw);
                                if (!isFinite(etaSec) || etaSec < 0) etaSec = null;

                                return {
                                    routeNo: routeNo,
                                    routeId: routeId,
                                    etaSec: etaSec,
                                    raw: x,
                                };
                            })
                            .filter(function (a) {
                                return a.routeNo || a.routeId;
                            });

                        // ✅ UI 반영
                        $scope.$evalAsync(function () {
                            $scope.arrivals = mapped;
                        });

                        return mapped;
                    } catch (e) {
                        console.warn('[BusController] apply arrivals fail:', e);
                        $scope.$evalAsync(function () {
                            $scope.arrivals = [];
                        });
                        return [];
                    }
                }

                // 0) ✅✅✅ 네 프로젝트에서 실제로 존재하는 함수(우선)
                try {
                    if ($scope && typeof $scope.fetchArrivalForStop === 'function') {
                        return $scope.fetchArrivalForStop(cityCode, nodeId).then(__applyArrivalListToScope);
                    }
                } catch (e00) {}

                try {
                    if ($rootScope && typeof $rootScope.fetchArrivalForStop === 'function') {
                        return $rootScope.fetchArrivalForStop(cityCode, nodeId).then(__applyArrivalListToScope);
                    }
                } catch (e01) {}

                try {
                    if (window && typeof window.fetchArrivalForStop === 'function') {
                        return window.fetchArrivalForStop(cityCode, nodeId).then(__applyArrivalListToScope);
                    }
                } catch (e02) {}

                // 1) 로컬 loadArrivalAndBus (있는 프로젝트도 있어서 흡수)
                try {
                    if (typeof loadArrivalAndBus === 'function') return loadArrivalAndBus(nodeId);
                } catch (e1) {}

                // 2) $scope에 있으면
                try {
                    if ($scope && typeof $scope.loadArrivalAndBus === 'function') return $scope.loadArrivalAndBus(nodeId);
                    if ($scope && typeof $scope.loadArrivalsAndBus === 'function') return $scope.loadArrivalsAndBus(nodeId);
                    if ($scope && typeof $scope.loadArrivals === 'function') return $scope.loadArrivals(nodeId);
                } catch (e2) {}

                // 3) window에 있으면
                try {
                    if (window && typeof window.loadArrivalAndBus === 'function') return window.loadArrivalAndBus(nodeId);
                    if (window && typeof window.loadArrivalsAndBus === 'function') return window.loadArrivalsAndBus(nodeId);
                    if (window && typeof window.loadArrivals === 'function') return window.loadArrivals(nodeId);
                } catch (e3) {}

                console.warn('[BusController] arrival loader not found. nodeId=', nodeId);
                $scope.$evalAsync(function () {
                    $scope.arrivals = [];
                });
            }

            // ---------------------------------------------------------
            // ✅✅✅ [ADD] 폴링 "안전 시작" 래퍼
            // - applyPollStepToArrivals 없어도 "심플 폴링"으로 대체
            // ---------------------------------------------------------
            var __simplePollTimerKey = '__simplePollTimer__';

            function __startSimplePolling() {
                // 기존 timer 제거
                try {
                    if (window[__simplePollTimerKey]) clearInterval(window[__simplePollTimerKey]);
                } catch (e0) {}
                window[__simplePollTimerKey] = null;

                // nodeId 없으면 종료
                try {
                    if (!currentNodeId) return;
                } catch (e1) {
                    return;
                }

                window[__simplePollTimerKey] = setInterval(function () {
                    try {
                        if (!currentNodeId) return;
                        __callLoadArrivalAndBus(currentNodeId);
                    } catch (e2) {}
                }, 10000);
            }

            function __safeStartPolling() {
                // 1) 기존 프로젝트 polling이 안전하게 돌 수 있으면 그걸 우선
                try {
                    var hasStep = typeof applyPollStepToArrivals === 'function' || (window && typeof window.applyPollStepToArrivals === 'function') || ($scope && typeof $scope.applyPollStepToArrivals === 'function');

                    if (hasStep) {
                        try {
                            if (typeof startPolling === 'function') return startPolling();
                        } catch (e1) {}
                        try {
                            if ($scope && typeof $scope.startPolling === 'function') return $scope.startPolling();
                        } catch (e2) {}
                        try {
                            if (window && typeof window.startPolling === 'function') return window.startPolling();
                        } catch (e3) {}
                    }
                } catch (e0) {}

                // 2) ✅✅✅ 없으면 심플 폴링으로 대체
                console.warn('[BusController] startPolling fallback => simple polling (10s)');
                __startSimplePolling();
            }

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

            // ✅✅✅ 핵심 수정: nodeid만 보지 말고 nodeId/stopId 등 다 흡수
            function pickNodeIdForArrival(stop) {
                var s = normalizeStopAny(stop) || stop || {};
                var v = s.nodeid || s.nodeId || s.node_id || s.stopId || s.stop_id || s.node || s.id;
                v = String(v || '').trim();
                return v ? v : null;
            }

            // ---------------------------------------------------------
            // ✅✅✅ [REPLACE/SAFE] resetSelectionAndLayers
            // ---------------------------------------------------------
            function resetSelectionAndLayers() {
                try {
                    $scope.arrivals = [];
                } catch (e0) {}
                try {
                    $scope.selectedStop = null;
                } catch (e1) {}
                try {
                    $scope.selectedBus = null;
                } catch (e2) {}

                try {
                    currentNodeId = null;
                } catch (e3) {}
                try {
                    currentStopCoord = null;
                } catch (e4) {}
                try {
                    lastPickedKey = null;
                } catch (e5) {}
                try {
                    lastPickedKind = null;
                } catch (e6) {}

                try {
                    hideMapPopup();
                } catch (e7) {}

                try {
                    if (typeof busVectorSource !== 'undefined' && busVectorSource && busVectorSource.clear) busVectorSource.clear(true);
                } catch (e8) {}
                try {
                    if (typeof busFeatureMap !== 'undefined' && busFeatureMap && busFeatureMap.clear) busFeatureMap.clear();
                } catch (e9) {}
                try {
                    if (typeof busLastSeen !== 'undefined' && busLastSeen && busLastSeen.clear) busLastSeen.clear();
                } catch (e10) {}

                try {
                    if (typeof routeVectorSource !== 'undefined' && routeVectorSource && routeVectorSource.clear) routeVectorSource.clear(true);
                } catch (e11) {}
                try {
                    if (typeof __nearestBusSource !== 'undefined' && __nearestBusSource && __nearestBusSource.clear) __nearestBusSource.clear(true);
                } catch (e12) {}

                // ✅ 심플 폴링도 같이 끄기
                try {
                    if (window[__simplePollTimerKey]) clearInterval(window[__simplePollTimerKey]);
                } catch (e13) {}
                window[__simplePollTimerKey] = null;
            }

            // ---------------------------------------------------------
            // ✅ 트램 전역 데이터 "자동 탐색"
            // ---------------------------------------------------------
            function guessTramRaw() {
                var direct = window.TRAM_STOPS || window.TRAM_STATIONS || window.TRAM_NODES || window.tramStops || window.tramStations;
                if (Array.isArray(direct) && direct.length) return direct;

                try {
                    var keys = Object.keys(window || {});
                    var candidates = [];

                    for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        var v = window[k];
                        if (!Array.isArray(v)) continue;
                        if (!v.length) continue;

                        if (v.length >= 10 && v.length <= 30) {
                            var one = v[0];
                            if (one && typeof one === 'object') {
                                var hasName = 'name' in one || 'nodenm' in one || 'nodeNm' in one || 'sttnNm' in one;
                                var hasCoord = 'lat' in one || 'gpslati' in one || 'lon' in one || 'gpslong' in one;
                                if (hasName || hasCoord) candidates.push({ key: k, arr: v });
                            }
                        }
                    }

                    if (candidates.length) {
                        candidates.sort(function (a, b) {
                            return Math.abs(a.arr.length - 14) - Math.abs(b.arr.length - 14);
                        });
                        console.info('[TRAM guess] picked =', candidates[0].key, 'len=', candidates[0].arr.length);
                        return candidates[0].arr;
                    }
                } catch (e) {}

                return [];
            }

            function buildTramList(kw2) {
                var tramRaw = guessTramRaw();
                var tramList = (Array.isArray(tramRaw) ? tramRaw : [])
                    .map(function (x) {
                        var s = normalizeStopAny(x);
                        if (!s) return null;
                        s.kind = 'TRAM';
                        s.type = 'TRAM';
                        return s;
                    })
                    .filter(Boolean);

                if (kw2) {
                    var q = kw2.toLowerCase();
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

                currentNodeId = null;
                setStatus('success', '✅ 트램 정거장 ' + tramOnly.length + '곳을 표시했습니다.', 2500);
                return;
            }

            // ---------------------------------------------------------
            // ✅ BUS / MIXED: DB 조회
            // ---------------------------------------------------------
            var type = null;

            function buildBusListFromDb(res) {
                var list = (Array.isArray(res) ? res : [])
                    .map(function (x) {
                        var s = normalizeStopAny(x);
                        if (!s) return null;
                        if (!s.kind) s.kind = 'BUS';
                        if (!s.type) s.type = 'BUS';
                        return s;
                    })
                    .filter(Boolean);

                list = list.filter(function (s) {
                    var k = String(s.kind || s.type || '').toUpperCase();
                    return k !== 'TRAM';
                });

                return list;
            }

            // ---------------------------------------------------------
            // ✅ MIXED
            // ---------------------------------------------------------
            if (mode === 'MIXED') {
                setStatus('info', kw ? '버스+트램 정류장 검색 중...' : '버스+트램 정류장 불러오는 중...', 0);

                var tramList = buildTramList(kw);

                return fetchAllStopsFromDb(__getCityCode(), kw || '', type)
                    .then(function (res) {
                        var busList = buildBusListFromDb(res);
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

                        var first = busList.length ? busList[0] : merged[0];
                        currentStopCoord = pickLatLon(first);
                        moveMapToStop(first, true);

                        currentNodeId = pickNodeIdForArrival(first);

                        if (currentNodeId) {
                            __callLoadArrivalAndBus(currentNodeId); // ✅ fetchArrivalForStop(cityCode,nodeId)로 정상 호출
                            __safeStartPolling(); // ✅ 기존 폴링 실패하면 심플 폴링
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
            // ✅ BUS 모드
            // ---------------------------------------------------------
            if (!kw) {
                setStatus('info', '전체 정류장 불러오는 중...', 0);

                return fetchAllStopsFromDb(__getCityCode(), '', type)
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

                        if (currentNodeId) {
                            __callLoadArrivalAndBus(currentNodeId);
                            __safeStartPolling();
                        }

                        setStatus('success', '✅ 전체 정류장 ' + list.length + '곳을 불러왔습니다.', 2500);
                    })
                    .catch(function (err) {
                        console.error('[BusController] 전체 정류장 조회 실패:', err);
                        setStatus('error', '❌ 전체 정류장 정보를 불러오지 못했습니다.', 2500);
                        resetSelectionAndLayers();
                    });
            }

            setStatus('info', '정류장 검색 중...', 0);

            return fetchAllStopsFromDb(__getCityCode(), kw, type)
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
                        __callLoadArrivalAndBus(currentNodeId);
                        __safeStartPolling();
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
        // ✅✅✅ [PASTE ONCE - CLEAN FINAL] focusStop + (필수 유틸) + nearestBus + fit lock + StopFilterOwner
        // - 중복 없음 / ES5 호환
        // - $timeout 있으면 사용, 없으면 setTimeout fallback
        // - nearest bus 레이어 1대만 표시(화살표 아이콘)
        // - 선택 정류장(__lastStopXY) + 버스(busXY) 함께 fit + 되돌림 방지 lockFit
        // - 전체정류장(빨간점) owner layer 자동 탐지 후 숨김/복구 지원
        // =========================================================

        // =========================================================
        // (0) Global-ish State (딱 1번만)
        // =========================================================
        var __lastStopXY = null;

        // stop marker filter guard (네 프로젝트에서 drawStopMarker 차단용)
        var __stopFilterOn = false;

        // nearest bus layer (1대만)
        var __nearestBusSource = null;
        var __nearestBusLayer = null;

        // lockFit token/timers
        var __focusBusFitToken = 0;
        var __focusBusFitTimers = []; // ✅ 누락되어있어서 추가

        // $timeout 사용 여부
        var __useNgTimeout = typeof $timeout === 'function';

        // =========================================================
        // (1) timeout wrapper
        // =========================================================
        function __schedule(ms, fn) {
            try {
                if (__useNgTimeout) return $timeout(fn, ms);
            } catch (e1) {}
            return setTimeout(fn, ms);
        }

        function __cancelScheduled(t) {
            try {
                if (__useNgTimeout) {
                    $timeout.cancel(t);
                    return;
                }
            } catch (e1) {}
            try {
                clearTimeout(t);
            } catch (e2) {}
        }

        function __cancelAllFitTimers() {
            try {
                if (__focusBusFitTimers && __focusBusFitTimers.length) {
                    for (var i = 0; i < __focusBusFitTimers.length; i++) {
                        __cancelScheduled(__focusBusFitTimers[i]);
                    }
                }
            } catch (e) {}
            __focusBusFitTimers = [];
            __focusBusFitToken++; // ✅ 이전 lock 무효화
        }

        // =========================================================
        // (2) map getter (프로젝트별 안전)
        // =========================================================
        function __getMapSafe() {
            try {
                if (typeof getInnerOlMap === 'function') {
                    var m = getInnerOlMap();
                    if (m) return m;
                }
            } catch (e) {}
            return window.map || window.olMap || window.__olMap || window.ngiiMap || null;
        }

        // =========================================================
        // (3) routeNo 정규화
        // =========================================================
        function __normRouteNo(v) {
            return String(v || '')
                .replace(/\s+/g, '')
                .replace(/번/g, '')
                .trim();
        }

        // =========================================================
        // (4) stop 객체에서 nodeId 추출(ES5)
        // =========================================================
        function __pickStopNodeId(s) {
            if (!s) return null;

            // 전역으로 더 강한 함수가 있으면 우선 사용
            try {
                if (typeof window.__pickStopNodeId === 'function') return window.__pickStopNodeId(s);
            } catch (e0) {}

            var id = s.nodeid || s.nodeId || s.nodeID || s.stopId || s.stopid || s.id || s.ID || s.node_id || s.stop_id || s.nodeno || s.nodeNo || s.node_no || null;

            id = String(id != null ? id : '').trim();
            return id ? id : null;
        }

        // =========================================================
        // (5) 좌표를 map XY로 정규화 (lon/lat이면 map projection으로 변환)
        // =========================================================
        function __toMapXY(map, xyOrLonLat) {
            try {
                if (!map || !xyOrLonLat || xyOrLonLat.length < 2) return null;

                var x = Number(xyOrLonLat[0]);
                var y = Number(xyOrLonLat[1]);
                if (!isFinite(x) || !isFinite(y)) return null;

                // lon/lat처럼 보이면 변환
                var looksLonLat = Math.abs(x) <= 180 && Math.abs(y) <= 90;
                if (looksLonLat && window.ol && ol.proj && ol.proj.transform) {
                    var view = map.getView && map.getView();
                    var proj = view && view.getProjection && view.getProjection();
                    if (proj) return ol.proj.transform([x, y], 'EPSG:4326', proj);
                }

                return [x, y];
            } catch (e) {
                return null;
            }
        }

        // =========================================================
        // (6) stop 좌표 저장 (__lastStopXY)
        // =========================================================
        function __saveLastStopXYFromStop(s) {
            try {
                var map = __getMapSafe();
                if (!map || !window.ol || !ol.proj) {
                    __lastStopXY = null;
                    return;
                }

                var view = map.getView && map.getView();
                var proj = view && view.getProjection && view.getProjection();

                // gpsx/gpsy가 mapXY인 경우
                var x = parseFloat(s.gpsx || s.gpsX);
                var y = parseFloat(s.gpsy || s.gpsY);

                if (isFinite(x) && isFinite(y) && (Math.abs(x) > 180 || Math.abs(y) > 90)) {
                    __lastStopXY = [x, y];
                    return;
                }

                // lon/lat인 경우
                var lat2 = parseFloat(s.gpslati || s.gpsLati || s.lat || s.latitude);
                var lon2 = parseFloat(s.gpslong || s.gpsLong || s.lon || s.longitude);

                if (isFinite(lon2) && isFinite(lat2) && Math.abs(lon2) <= 180 && Math.abs(lat2) <= 90 && proj) {
                    __lastStopXY = ol.proj.transform([lon2, lat2], 'EPSG:4326', proj);
                } else {
                    __lastStopXY = null;
                }
            } catch (e) {
                __lastStopXY = null;
            }
        }

        // =========================================================
        // (7) stop+bus 같이 fit
        // =========================================================
        function __fitStopAndBus(map, stopXY, busXY) {
            try {
                if (!map || !busXY) return false;
                var view = map.getView && map.getView();
                if (!view) return false;

                if (!stopXY || !window.ol || !ol.extent) {
                    view.animate({ center: busXY, zoom: 18, duration: 220 });
                    return true;
                }

                var extent = ol.extent.boundingExtent([stopXY, busXY]);

                var w = extent[2] - extent[0];
                var h = extent[3] - extent[1];
                var pad = Math.max(w, h) * 0.35;
                if (isFinite(pad) && pad > 0) {
                    extent = [extent[0] - pad, extent[1] - pad, extent[2] + pad, extent[3] + pad];
                }

                view.fit(extent, {
                    duration: 240,
                    padding: [90, 420, 90, 40],
                    maxZoom: 19,
                });
                return true;
            } catch (e) {
                return false;
            }
        }

        // =========================================================
        // ✅✅✅ (7.5) lockFit (되돌림 방지)
        // =========================================================
        function __lockFit(map, stopXY, busXY) {
            if (!map || !busXY) return;

            __cancelAllFitTimers();

            __focusBusFitToken++;
            var myToken = __focusBusFitToken;

            function sched(ms) {
                var t = __schedule(ms, function () {
                    if (myToken !== __focusBusFitToken) return;
                    __fitStopAndBus(map, stopXY, busXY);
                });
                __focusBusFitTimers.push(t);
            }

            sched(0);
            sched(250);
            sched(900);
            sched(1600);
            sched(2300);
        }

        // =========================================================
        // ✅✅✅ (A) busVectorLayer(얇은 화살표) ON/OFF 제어 추가
        // - 버스번호 클릭 시 얇은 화살표 숨기고(nearest만 남김)
        // =========================================================
        function __setBusLayerVisible(v) {
            try {
                if (typeof busVectorLayer !== 'undefined' && busVectorLayer && busVectorLayer.setVisible) {
                    busVectorLayer.setVisible(!!v);
                }
            } catch (e) {}
        }

        // =========================================================
        // ✅✅✅ (B) nearest bus layer 보장 (두꺼운 화살표 1대)
        // =========================================================
        function __makeArrowIconDataUrl(fill) {
            fill = fill || '#2563eb';
            var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' + '<path d="M6 30h32V20l20 12-20 12V34H6z" fill="' + fill + '"/>' + '</svg>';
            var encoded = btoa(unescape(encodeURIComponent(svg)));
            return 'data:image/svg+xml;base64,' + encoded;
        }

        // =========================================================
        // ✅✅✅ [PASTE ONCE - CLEAN FINAL]
        // Common Utils + NearestBusLayer + lockFit + (필수 전역 상태)
        // - 이 블록은 파일에 "1번만" 있어야 함
        // - ES5 호환
        // =========================================================

        // ---------------------------------------------------------
        // (0) Global State (딱 1번만)
        // ---------------------------------------------------------
        var __lastStopXY = null;
        var __stopFilterOn = false;

        // nearest bus (두꺼운 화살표 1대)
        var __nearestBusSource = null;
        var __nearestBusLayer = null;

        // lockFit token/timers
        var __focusBusFitToken = 0;
        var __focusBusFitTimers = [];

        // $timeout 사용 여부
        var __useNgTimeout = typeof $timeout === 'function';

        // ---------------------------------------------------------
        // (1) schedule / cancel wrappers
        // ---------------------------------------------------------
        function __schedule(ms, fn) {
            try {
                if (__useNgTimeout) return $timeout(fn, ms);
            } catch (e1) {}
            return setTimeout(fn, ms);
        }

        function __cancelScheduled(t) {
            try {
                if (__useNgTimeout) {
                    $timeout.cancel(t);
                    return;
                }
            } catch (e1) {}
            try {
                clearTimeout(t);
            } catch (e2) {}
        }

        function __cancelAllFitTimers() {
            try {
                if (__focusBusFitTimers && __focusBusFitTimers.length) {
                    for (var i = 0; i < __focusBusFitTimers.length; i++) {
                        __cancelScheduled(__focusBusFitTimers[i]);
                    }
                }
            } catch (e) {}
            __focusBusFitTimers = [];
            __focusBusFitToken++; // ✅ 이전 lock 무효화
        }

        // ---------------------------------------------------------
        // (2) map getter (프로젝트별 안전)
        // ---------------------------------------------------------
        function __getMapSafe() {
            try {
                if (typeof getInnerOlMap === 'function') {
                    var m = getInnerOlMap();
                    if (m) return m;
                }
            } catch (e) {}
            return window.__olMap || window.olMap || window.map || window.ngiiMap || null;
        }

        // ---------------------------------------------------------
        // (3) normalize routeNo
        // ---------------------------------------------------------
        function __normRouteNo(v) {
            return String(v || '')
                .replace(/\s+/g, '')
                .replace(/번/g, '')
                .trim();
        }

        // ---------------------------------------------------------
        // (4) XY normalize: lon/lat -> map projection
        // ---------------------------------------------------------
        function __toMapXY(map, xyOrLonLat) {
            try {
                if (!map || !xyOrLonLat || xyOrLonLat.length < 2) return null;

                var x = Number(xyOrLonLat[0]);
                var y = Number(xyOrLonLat[1]);
                if (!isFinite(x) || !isFinite(y)) return null;

                // lon/lat처럼 보이면 transform
                var looksLonLat = Math.abs(x) <= 180 && Math.abs(y) <= 90;
                if (looksLonLat && window.ol && ol.proj && ol.proj.transform) {
                    var view = map.getView && map.getView();
                    var proj = view && view.getProjection && view.getProjection();
                    if (proj) return ol.proj.transform([x, y], 'EPSG:4326', proj);
                }

                return [x, y];
            } catch (e) {
                return null;
            }
        }

        // ---------------------------------------------------------
        // (5) fit stop + bus
        // ---------------------------------------------------------
        function __fitStopAndBus(map, stopXY, busXY) {
            try {
                if (!map || !busXY) return false;
                var view = map.getView && map.getView();
                if (!view) return false;

                if (!stopXY || !window.ol || !ol.extent) {
                    view.animate({ center: busXY, zoom: 18, duration: 220 });
                    return true;
                }

                var extent = ol.extent.boundingExtent([stopXY, busXY]);

                var w = extent[2] - extent[0];
                var h = extent[3] - extent[1];
                var pad = Math.max(w, h) * 0.35;

                if (isFinite(pad) && pad > 0) {
                    extent = [extent[0] - pad, extent[1] - pad, extent[2] + pad, extent[3] + pad];
                }

                view.fit(extent, {
                    duration: 240,
                    padding: [90, 420, 90, 40],
                    maxZoom: 19,
                });
                return true;
            } catch (e) {
                return false;
            }
        }

        // ---------------------------------------------------------
        // (6) 되돌림 방지 lockFit (여러 타이밍 재-fit)
        // ---------------------------------------------------------
        function __lockFit(map, stopXY, busXY) {
            if (!map || !busXY) return;

            __focusBusFitToken++;
            var myToken = __focusBusFitToken;

            __cancelAllFitTimers();
            __focusBusFitToken = myToken; // cancel이 token++ 했으니 되돌림

            function sched(ms) {
                var t = __schedule(ms, function () {
                    if (myToken !== __focusBusFitToken) return;
                    __fitStopAndBus(map, stopXY, busXY);
                });
                __focusBusFitTimers.push(t);
            }

            sched(0);
            sched(250);
            sched(900);
            sched(1600);
            sched(2300);
        }

        // ---------------------------------------------------------
        // (7) SVG 화살표 아이콘 DataURL
        // - base64가 안 먹는 환경이 있으면 utf8 data url로 fallback
        // ---------------------------------------------------------
        function __makeArrowSvgUtf8(fill) {
            fill = fill || '#2563eb';
            return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64">' + '<path d="M6 30h30V18l22 14-22 14V34H6z" fill="' + fill + '"/>' + '</svg>');
        }

        function __makeArrowIconDataUrl(fill) {
            fill = fill || '#2563eb';
            try {
                var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64">' + '<path d="M6 30h30V18l22 14-22 14V34H6z" fill="' + fill + '"/>' + '</svg>';

                var encoded = btoa(unescape(encodeURIComponent(svg)));
                return 'data:image/svg+xml;base64,' + encoded;
            } catch (e) {
                return __makeArrowSvgUtf8(fill);
            }
        }

        // ---------------------------------------------------------
        // (8) ✅✅✅ nearest bus 레이어(두꺼운 화살표 1대만 + 번호 텍스트)
        // - ✅ __makeArrowIconDataUrl 없어도 "원+번호"로 무조건 보이게 fallback
        // - ✅ Style/Icon/Text 캐싱(성능/안정성)
        // - ✅ routeNo 키 다양 흡수 + 글자 정규화
        // - ✅ 이미 있으면 현재 map에 재-add 보장
        // ---------------------------------------------------------
        function ensureNearestBusLayer(map) {
            map = map || (typeof __getMapSafe === 'function' ? __getMapSafe() : null);
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.style) return false;

            // 이미 있으면 map에 재-add만
            if (window.__nearestBusLayer && window.__nearestBusSource) {
                try {
                    var arr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    if (arr && arr.indexOf(window.__nearestBusLayer) === -1) map.addLayer(window.__nearestBusLayer);
                } catch (e0) {}
                return true;
            }

            window.__nearestBusSource = new ol.source.Vector();

            // ✅ 방향 보정(네 프로젝트 화살표 기준)
            var rotOffsetRad = Math.PI / 2;

            // ---------------------------------------------------------
            // ✅ 아이콘 src 만들기(가능하면) + 실패하면 fallback로 원형 마커
            // ---------------------------------------------------------
            var arrowSrc = null;
            try {
                if (typeof __makeArrowIconDataUrl === 'function') arrowSrc = __makeArrowIconDataUrl('#2563eb');
            } catch (eA) {
                arrowSrc = null;
            }
            // dataURL 형태가 아니거나 너무 짧으면 실패로 간주
            if (!arrowSrc || typeof arrowSrc !== 'string' || arrowSrc.length < 30) arrowSrc = null;

            // ---------------------------------------------------------
            // ✅ 스타일 캐시(회전 값/번호별로 재사용)
            // ---------------------------------------------------------
            var __styleCache = Object.create(null);

            function _normRouteNo(v) {
                return String(v || '')
                    .replace(/\s+/g, '')
                    .replace(/번/g, '')
                    .trim();
            }

            function _pickRouteNoFromFeature(feature) {
                if (!feature || !feature.get) return '';
                var v = '';
                try {
                    v =
                        feature.get('routeNo') ||
                        feature.get('routeno') ||
                        feature.get('route_no') ||
                        feature.get('routeNoNm') ||
                        feature.get('route_no_nm') ||
                        feature.get('label') ||
                        (feature.get('bus') && (feature.get('bus').routeno || feature.get('bus').routeNo || feature.get('bus').route_no || feature.get('bus').routeNoNm)) ||
                        '';
                } catch (e) {
                    v = '';
                }
                return _normRouteNo(v);
            }

            // ✅ fallback marker(아이콘 실패해도 무조건 보이는 원형+번호 배지)
            function _makeFallbackStyle(rno) {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: 11,
                        fill: new ol.style.Fill({ color: '#2563eb' }),
                        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                    }),
                    text: rno
                        ? new ol.style.Text({
                              text: rno,
                              font: 'bold 12px sans-serif',
                              offsetY: 0,
                              fill: new ol.style.Fill({ color: '#ffffff' }),
                              stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 3 }),
                          })
                        : undefined,
                });
            }

            // ✅ arrow + text style
            function _makeArrowStyle(rot, rno) {
                // 아이콘은 캐시해서 재사용 (회전만 다르게)
                return new ol.style.Style({
                    image: new ol.style.Icon({
                        src: arrowSrc,
                        scale: 0.95,
                        rotation: rot,
                        rotateWithView: true,
                        anchor: [0.5, 0.5],
                        anchorXUnits: 'fraction',
                        anchorYUnits: 'fraction',
                    }),
                    text: rno
                        ? new ol.style.Text({
                              text: rno,
                              font: 'bold 13px sans-serif',
                              // ✅ 화살표 중심에 잘 보이게(묻히면 -10~-2 사이로 조절)
                              offsetY: -2,
                              fill: new ol.style.Fill({ color: '#ffffff' }),
                              stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 3 }),
                          })
                        : undefined,
                });
            }

            window.__nearestBusLayer = new ol.layer.Vector({
                source: window.__nearestBusSource,
                zIndex: 9999,
                style: function (feature) {
                    // rot
                    var rot = 0;
                    try {
                        rot = Number(feature && feature.get && feature.get('rot'));
                    } catch (e1) {
                        rot = 0;
                    }
                    if (!isFinite(rot)) rot = 0;
                    rot = rot + rotOffsetRad;

                    // routeNo
                    var rno = _pickRouteNoFromFeature(feature);

                    // 캐시 키(회전은 너무 세분화되면 캐시 폭발하니까 반올림)
                    var rotKey = Math.round(rot * 100) / 100; // 0.01rad 단위
                    var key = (arrowSrc ? 'A|' : 'F|') + rotKey + '|' + rno;

                    if (__styleCache[key]) return __styleCache[key];

                    // arrowSrc 없으면 fallback
                    var st = arrowSrc ? _makeArrowStyle(rotKey, rno) : _makeFallbackStyle(rno);
                    __styleCache[key] = st;
                    return st;
                },
            });

            try {
                window.__nearestBusLayer.set('tag', 'nearest-bus');
            } catch (e3) {}

            // ✅ map에 확실히 add
            try {
                map.addLayer(window.__nearestBusLayer);
            } catch (e4) {}

            // ✅ 강제 리렌더
            try {
                window.__nearestBusSource.changed && window.__nearestBusSource.changed();
            } catch (e5) {}
            try {
                window.__nearestBusLayer.changed && window.__nearestBusLayer.changed();
            } catch (e6) {}
            try {
                map.renderSync ? map.renderSync() : map.render && map.render();
            } catch (e7) {}

            return true;
        }

        // ---------------------------------------------------------
        // (11) ✅ 같은 노선 후보 중 "정류장에 가장 가까운 1대" 선택
        // ---------------------------------------------------------
        function __pickNearestBusFeature(map, routeId, routeNoNorm, stopXY) {
            try {
                if (!map) return null;

                // ✅ busVectorSource 확보(window/로컬 혼용)
                var src = null;
                try {
                    if (window && window.busVectorSource && window.busVectorSource.getFeatures) src = window.busVectorSource;
                } catch (e0) {}
                try {
                    if (!src && typeof busVectorSource !== 'undefined' && busVectorSource && busVectorSource.getFeatures) src = busVectorSource;
                } catch (e1) {}

                if (!src || !src.getFeatures) return null;

                var feats = src.getFeatures() || [];
                if (!feats.length) return null;

                var rid = String(routeId || '').trim();
                var rno = String(routeNoNorm || '').trim();

                function getFeatureRouteId(f) {
                    if (!f || !f.get) return '';
                    var bus = null;
                    try {
                        bus = f.get('bus');
                    } catch (e) {}
                    var v =
                        f.get('routeid') ||
                        f.get('routeId') ||
                        f.get('busRouteId') ||
                        f.get('route_id') ||
                        f.get('busrouteid') ||
                        f.get('bus_route_id') ||
                        (bus && (bus.routeid || bus.routeId || bus.busRouteId || bus.route_id || bus.busrouteid || bus.bus_route_id)) ||
                        '';
                    return String(v || '').trim();
                }

                function getFeatureRouteNoNorm(f) {
                    if (!f || !f.get) return '';
                    var bus = null;
                    try {
                        bus = f.get('bus');
                    } catch (e) {}
                    var v = f.get('routeNo') || f.get('routeno') || f.get('route_no') || f.get('routeNoNm') || f.get('route_no_nm') || (bus && (bus.routeno || bus.routeNo || bus.route_no || bus.routeNoNm || bus.route_no_nm)) || '';
                    try {
                        if (typeof __normRouteNo === 'function') return __normRouteNo(v);
                    } catch (e2) {}
                    return String(v || '')
                        .replace(/\s+/g, '')
                        .replace(/번/g, '');
                }

                function toMapXYSafe(map, rawXY) {
                    if (!rawXY || rawXY.length < 2) return null;
                    var x = Number(rawXY[0]);
                    var y = Number(rawXY[1]);
                    if (!isFinite(x) || !isFinite(y)) return null;

                    var looksLonLat = Math.abs(x) <= 180 && Math.abs(y) <= 90;
                    if (!looksLonLat) return [x, y];

                    try {
                        var view = map.getView && map.getView();
                        var proj = view && view.getProjection && view.getProjection();
                        var code = (proj && proj.getCode ? proj.getCode() : 'EPSG:3857') || 'EPSG:3857';
                        if (window.ol && ol.proj && ol.proj.transform) {
                            return ol.proj.transform([x, y], 'EPSG:4326', code);
                        }
                    } catch (e3) {}
                    return [x, y];
                }

                // ✅ 후보 수집
                var candidates = [];
                for (var i = 0; i < feats.length; i++) {
                    var f = feats[i];
                    if (!f || !f.get) continue;

                    var fRouteId = getFeatureRouteId(f);
                    var fRouteNo = getFeatureRouteNoNorm(f);

                    var ok = false;
                    if (rid && fRouteId) ok = fRouteId === rid;
                    else if (rno && fRouteNo) ok = fRouteNo === rno;

                    if (ok) candidates.push(f);
                }
                if (!candidates.length) return null;

                // stopXY 없으면 첫번째 후보
                if (!stopXY) {
                    var g0 = candidates[0].getGeometry && candidates[0].getGeometry();
                    var raw0 = g0 && g0.getCoordinates ? g0.getCoordinates() : null;
                    var xy0 = null;
                    try {
                        if (typeof __toMapXY === 'function') xy0 = __toMapXY(map, raw0);
                    } catch (e4) {}
                    if (!xy0) xy0 = toMapXYSafe(map, raw0);
                    return { feat: candidates[0], xy: xy0 };
                }

                // ✅ nearest 계산
                var best = null;
                var bestD2 = Infinity;

                for (var j = 0; j < candidates.length; j++) {
                    var cf = candidates[j];
                    var g = cf.getGeometry && cf.getGeometry();
                    var raw = g && g.getCoordinates ? g.getCoordinates() : null;

                    var xy = null;
                    try {
                        if (typeof __toMapXY === 'function') xy = __toMapXY(map, raw);
                    } catch (e5) {}
                    if (!xy) xy = toMapXYSafe(map, raw);
                    if (!xy) continue;

                    var dx = xy[0] - stopXY[0];
                    var dy = xy[1] - stopXY[1];
                    var d2 = dx * dx + dy * dy;

                    if (d2 < bestD2) {
                        bestD2 = d2;
                        best = { feat: cf, xy: xy };
                    }
                }
                return best;
            } catch (e) {
                console.warn('[__pickNearestBusFeature] error', e);
                return null;
            }
        }

        // =========================================================
        // ✅✅✅ AllStops Owner Layer Resolve + "항상 숨김" 정책
        // - 중복 함수 제거 버전(이 블록은 1개만 존재해야 함)
        // =========================================================
        var __ALL_STOPS_LAYER_IDX_HINT = 15; // 네 화면에서 확인된 값
        if (typeof window.__forceHideAllStops === 'undefined') window.__forceHideAllStops = true;

        function __resolveAllStopsOwnerLayer() {
            if (window.__allStopsOwnerLayer) return window.__allStopsOwnerLayer;

            var map = __getMapSafe();
            if (!map || !map.getLayers) return null;

            var layers = map.getLayers().getArray();
            if (!layers || !layers.length) return null;

            // (1) idx 힌트 우선
            try {
                var hinted = layers[__ALL_STOPS_LAYER_IDX_HINT];
                if (hinted && hinted.setVisible) {
                    window.__allStopsOwnerLayer = hinted;
                    try {
                        __patchAllStopsOwnerSetVisible(hinted);
                    } catch (eP1) {}
                    console.log('[__resolveAllStopsOwnerLayer] forced idx=', __ALL_STOPS_LAYER_IDX_HINT);
                    return hinted;
                }
            } catch (e0) {}

            // (2) fallback: pointCount 최대 탐색
            var best = null;
            for (var idx = 0; idx < layers.length; idx++) {
                var lyr = layers[idx];
                if (!lyr || !lyr.getSource) continue;

                var src = null;
                try {
                    src = lyr.getSource();
                } catch (e1) {
                    src = null;
                }
                if (!src || !src.getFeatures) continue;

                var feats = [];
                try {
                    feats = src.getFeatures() || [];
                } catch (e2) {
                    feats = [];
                }
                if (!feats.length) continue;

                var tag = '';
                try {
                    tag = typeof lyr.get === 'function' ? lyr.get('tag') || '' : '';
                } catch (e3) {}
                var tagLow = String(tag || '').toLowerCase();
                if (tagLow.indexOf('bus') >= 0 || tagLow.indexOf('tram') >= 0 || tagLow.indexOf('path') >= 0) continue;
                if (tagLow === 'route-stops' || tagLow === 'filtered-stops' || tagLow === 'nearest-bus') continue;

                var pointCount = 0;
                for (var i = 0; i < feats.length; i++) {
                    var g = feats[i] && feats[i].getGeometry && feats[i].getGeometry();
                    var t = g && g.getType && g.getType();
                    if (t === 'Point' || t === 'MultiPoint') pointCount++;
                }

                if (!best || pointCount > best.pointCount) best = { idx: idx, layer: lyr, pointCount: pointCount, tag: tag };
            }

            if (best && best.layer) {
                window.__allStopsOwnerLayer = best.layer;
                try {
                    __patchAllStopsOwnerSetVisible(best.layer);
                } catch (eP2) {}
                console.log('[__resolveAllStopsOwnerLayer] fallback idx=', best.idx, 'pointCount=', best.pointCount);
                return best.layer;
            }

            return null;
        }

        function __patchAllStopsOwnerSetVisible(lyr) {
            if (!lyr || !lyr.setVisible) return false;
            if (lyr.__allStopsVisiblePatched === true) return true;

            var orig = lyr.setVisible;
            lyr.setVisible = function (v) {
                if (window.__forceHideAllStops === true && v === true) {
                    console.warn('[ALL-STOPS] blocked direct layer.setVisible(true)');
                    v = false;
                }
                return orig.call(this, v);
            };

            lyr.__allStopsVisiblePatched = true;
            return true;
        }

        // ✅ setVisible 가드
        function __setAllStopsVisible(visible) {
            var lyr = __resolveAllStopsOwnerLayer();
            if (!lyr || !lyr.setVisible) return false;

            if (window.__forceHideAllStops === true && visible === true) visible = false;

            try {
                lyr.setVisible(!!visible);
            } catch (e) {}

            try {
                var map = __getMapSafe();
                if (map) {
                    if (map.renderSync) map.renderSync();
                    else if (map.render) map.render();
                }
            } catch (e2) {}

            return true;
        }

        function __hideAllStopsLayerOnly() {
            return __setAllStopsVisible(false);
        }

        // ⚠️ show는 남겨두되, forceHide가 true면 실제로는 켜지지 않음
        function __showAllStopsLayerOnly() {
            return __setAllStopsVisible(true);
        }

        // ✅ 숨김 락(여러번 적용)
        function __lockHideAllStops() {
            try {
                var times = [0, 200, 800, 1500, 2500];
                for (var i = 0; i < times.length; i++) {
                    (function (ms) {
                        __schedule(ms, function () {
                            try {
                                __hideAllStopsLayerOnly();
                            } catch (e1) {}
                        });
                    })(times[i]);
                }
            } catch (e0) {}
        }

        // 버스탭 진입/초기 렌더 때 정책 적용
        function __applyDefaultStopsPolicy() {
            window.__forceHideAllStops = true;
            __lockHideAllStops();
        }

        // exports
        try {
            window.__resolveAllStopsOwnerLayer = __resolveAllStopsOwnerLayer;
            window.__setAllStopsVisible = __setAllStopsVisible;
            window.__hideAllStopsLayerOnly = __hideAllStopsLayerOnly;
            window.__showAllStopsLayerOnly = __showAllStopsLayerOnly;
            window.__lockHideAllStops = __lockHideAllStops;
            window.__applyDefaultStopsPolicy = __applyDefaultStopsPolicy;
        } catch (e) {}

        // =========================================================
        // (9) ✅✅✅ drawStopMarker (필터 ON이면 MID 차단)
        // =========================================================
        function drawStopMarker(lon, lat, color, label, kind, stopId) {
            var filterOn = __stopFilterOn === true;

            var k = String(kind || '').toUpperCase();
            var allowEvenWhenFiltered = k === 'FROM' || k === 'TO' || k === 'SELECTED';

            if (filterOn && !allowEvenWhenFiltered) return;

            if (!ensureStopsLayer || !ensureStopsLayer()) return;
            if (typeof stopsVectorSource === 'undefined' || !stopsVectorSource) return;

            var xy = typeof lonLatToMapXY === 'function' ? lonLatToMapXY(lon, lat) : null;
            if (!xy) return;

            var f = new ol.Feature({ geometry: new ol.geom.Point(xy) });

            var radius = allowEvenWhenFiltered ? 9 : 6;

            var nodeId = '';
            if (stopId !== undefined && stopId !== null) {
                nodeId = String(stopId).trim();
                if (nodeId === 'undefined' || nodeId === 'null') nodeId = '';
            }

            if (nodeId && typeof stopFeatureById !== 'undefined' && stopFeatureById && stopFeatureById[nodeId]) return;

            if (nodeId && typeof stopFeatureById !== 'undefined' && stopFeatureById) {
                f.set('nodeId', nodeId);
                stopFeatureById[nodeId] = f;
            }

            f.setStyle(
                new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: radius,
                        fill: new ol.style.Fill({ color: color }),
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
                }),
            );

            stopsVectorSource.addFeature(f);
        }

        // =========================================================
        // (10) clearStopFilter / debug tools
        // =========================================================
        function clearStopFilter() {
            __stopFilterOn = false;

            try {
                if (typeof filteredStopsSource !== 'undefined' && filteredStopsSource) filteredStopsSource.clear(true);
            } catch (e0) {}

            try {
                if (typeof stopsVectorLayer !== 'undefined' && stopsVectorLayer) stopsVectorLayer.setVisible(true);
                if (typeof filteredStopsLayer !== 'undefined' && filteredStopsLayer) filteredStopsLayer.setVisible(false);
            } catch (e1) {}

            __showAllStopsLayerOnly();
        }

        function dumpPointLayers() {
            var map = __getMapSafe();
            if (!map || !map.getLayers) {
                console.warn('[dumpPointLayers] map missing');
                return;
            }

            var layers = map.getLayers().getArray();
            var rows = [];

            for (var idx = 0; idx < layers.length; idx++) {
                var lyr = layers[idx];
                if (!lyr) continue;

                var tag = '';
                try {
                    tag = typeof lyr.get === 'function' ? lyr.get('tag') || '' : '';
                } catch (e) {}

                var src = null;
                try {
                    src = lyr.getSource && lyr.getSource();
                } catch (e2) {
                    src = null;
                }
                if (!src || !src.getFeatures) continue;

                var feats = [];
                try {
                    feats = src.getFeatures() || [];
                } catch (e3) {
                    feats = [];
                }

                var pointCount = 0;
                for (var i = 0; i < feats.length; i++) {
                    var g = feats[i] && feats[i].getGeometry && feats[i].getGeometry();
                    var t = g && g.getType && g.getType();
                    if (t === 'Point' || t === 'MultiPoint') pointCount++;
                }

                rows.push({
                    idx: idx,
                    visible: typeof lyr.getVisible === 'function' ? lyr.getVisible() : 'n/a',
                    tag: tag,
                    featureCount: feats.length,
                    pointCount: pointCount,
                });
            }

            rows.sort(function (a, b) {
                return b.pointCount - a.pointCount;
            });
            console.table(rows);

            window.__pointLayerDump = rows;
            console.log('[dumpPointLayers] window.__pointLayerDump=', rows);
        }

        // =========================================================
        // (11) ✅✅✅ focusStop (딱 1개만) - FIXED
        // - loadArrivalAndBus 호출
        // - startPolling은 안전 래퍼로 호출 (없으면 simple polling)
        // =========================================================
        $scope.focusStop = function (stop) {
            if (!stop) return;

            var s = null;
            try {
                s = typeof normalizeStopAny === 'function' ? normalizeStopAny(stop) : stop;
            } catch (e0) {
                s = stop;
            }
            if (!s) return;

            $scope.selectedStop = s;
            $scope.keyword = s.name || $scope.keyword;

            try {
                if (typeof __cancelAllFitTimers === 'function') __cancelAllFitTimers();
            } catch (e1) {}

            try {
                if (typeof moveMapToStop === 'function') moveMapToStop(s, true);
            } catch (e2) {}

            try {
                if (typeof __saveLastStopXYFromStop === 'function') __saveLastStopXYFromStop(s);
            } catch (e3) {}

            // ✅ nodeId 추출 (없으면 여러 후보로)
            var nodeId = null;
            try {
                if (typeof __pickStopNodeId === 'function') nodeId = __pickStopNodeId(s);
            } catch (e4) {}

            if (!nodeId) {
                try {
                    nodeId = String(s.nodeid || s.nodeId || s.nodeID || s.stopId || s.stopid || s.id || '').trim();
                } catch (e5) {}
            }
            if (!nodeId) {
                console.warn('[focusStop] nodeId empty:', s);
                return;
            }

            // ✅ 전역 currentNodeId도 갱신(심플 폴링이 이 값을 보게 됨)
            try {
                currentNodeId = nodeId;
            } catch (e6) {}

            // ✅ 도착/버스 호출
            try {
                if (typeof loadArrivalAndBus === 'function') {
                    loadArrivalAndBus(nodeId);
                } else {
                    console.warn('[focusStop] loadArrivalAndBus not defined');
                }
            } catch (e7) {
                console.warn('[focusStop] loadArrivalAndBus error:', e7);
            }

            // ✅ 폴링 시작(안전 호출)
            try {
                // 1) 네가 이미 만들어둔 안전 래퍼가 있으면 그걸 우선
                if (typeof __safeStartPolling === 'function') {
                    __safeStartPolling();
                    return;
                }
            } catch (e8) {}

            // 2) 기존 startPolling이 안전할 때만 호출 (없으면 fallback)
            try {
                var hasStep = typeof applyPollStepToArrivals === 'function' || (window && typeof window.applyPollStepToArrivals === 'function') || ($scope && typeof $scope.applyPollStepToArrivals === 'function');

                if (hasStep && typeof startPolling === 'function') {
                    startPolling();
                    return;
                }
            } catch (e9) {}

            // 3) fallback: simple polling (10s)
            try {
                if (!window.__simplePollTimer__) {
                    window.__simplePollTimer__ = setInterval(function () {
                        try {
                            if (!currentNodeId) return;
                            if (typeof loadArrivalAndBus === 'function') loadArrivalAndBus(currentNodeId);
                        } catch (e10) {}
                    }, 10000);
                }
            } catch (e11) {}
        };

        // =========================================================
        // ✅✅✅ [REPLACE] focusBus (INDEX 캐시 + routeSource sync + boolean draw + FAST PATH)
        // - FIX1: "두 줄" 방지 => 다른 경로 레이어들 무조건 clear
        // - FIX2: nearest 파란 화살표 + 번호 라벨 강제 표시
        // - FIX3: busXY가 lonlat(4326)로 들어오면 mapProj(5179)로 변환 후 표시
        // - FIX4: in-flight + coords 0 캐시 덮어쓰기 방지 유지
        // =========================================================
        $scope.focusBus = function (arrival, opts) {
            if (!arrival) return;
            opts = opts || {};
            if (opts.showNearest === undefined) opts.showNearest = true;

            function __sched(ms, fn) {
                try {
                    if (typeof __schedule === 'function') return __schedule(ms, fn);
                } catch (e0) {}
                return setTimeout(fn, ms || 0);
            }

            var map = (typeof __getMapSafe === 'function' ? __getMapSafe() : null) || (typeof getInnerOlMap === 'function' ? getInnerOlMap() : null);
            if (!map) return;

            var OL = typeof ol !== 'undefined' ? ol : window && window.ol ? window.ol : null;
            if (!OL) return;

            // ✅ 얇은 화살표(busVectorLayer) 끄기
            try {
                if (typeof __setBusLayerVisible === 'function') __setBusLayerVisible(false);
            } catch (eHideBus) {}

            // ---------------------------------------------------------
            // ✅ FIX1) "두 줄" 원인: 다른 경로 레이어가 남아있음 → BUS 단일 클릭이면 싹 clear
            // ---------------------------------------------------------
            function __clearOtherPathLayersWhenBusSingle() {
                // 네 프로젝트에서 쓰는 소스 이름들이 섞여 있어서 가능한 범위 넓게 방어
                try {
                    if (window.pathVectorSource && window.pathVectorSource.clear) window.pathVectorSource.clear(true);
                } catch (e1) {}
                try {
                    if (window.mixedBusSource && window.mixedBusSource.clear) window.mixedBusSource.clear(true);
                } catch (e2) {}
                try {
                    if (window.mixedTramSource && window.mixedTramSource.clear) window.mixedTramSource.clear(true);
                } catch (e3) {}
                try {
                    if (window.mixedWalkSource && window.mixedWalkSource.clear) window.mixedWalkSource.clear(true);
                } catch (e4) {}
                try {
                    if (window.mixedTransferSource && window.mixedTransferSource.clear) window.mixedTransferSource.clear(true);
                } catch (e5) {}

                // single segment(hover용) 레이어가 따로 있으면 이것도 지워야 "두 줄"이 안 남음
                try {
                    if (window.singleSegSource && window.singleSegSource.clear) window.singleSegSource.clear(true);
                } catch (e6) {}
                try {
                    if (window.__singleSegSource && window.__singleSegSource.clear) window.__singleSegSource.clear(true);
                } catch (e7) {}

                // 혹시 "routeStops" 라인/레이어가 polyline으로 그려지는 케이스 방어(있으면)
                try {
                    if (window.routeStopsSource && window.routeStopsSource.clear) window.routeStopsSource.clear(true);
                } catch (e8) {}
            }

            // ---------------------------------------------------------
            // routeId / routeNo
            // ---------------------------------------------------------
            var routeId = String(arrival.routeid || arrival.routeId || arrival.busRouteId || arrival.route_id || (arrival._raw && (arrival._raw.routeid || arrival._raw.routeId || arrival._raw.busRouteId || arrival._raw.route_id)) || '').trim();

            var routeNoRaw = arrival.routeno || arrival.routeNo || arrival.route_no || arrival.routeNoNm || arrival.routenm || arrival.routeNm || arrival.lineNo || '';
            var routeNoNorm =
                typeof __normRouteNo === 'function'
                    ? __normRouteNo(routeNoRaw)
                    : String(routeNoRaw || '')
                          .replace(/\s+/g, '')
                          .replace(/번/g, '');

            if (!routeId && !routeNoNorm) {
                console.warn('[focusBus] routeId/routeNo empty:', arrival);
                return;
            }

            var stopXY = typeof __lastStopXY !== 'undefined' && __lastStopXY && __lastStopXY.length === 2 ? __lastStopXY : null;

            // ---------------------------------------------------------
            // ✅ route layer/source 보장 + route globals sync
            // ---------------------------------------------------------
            function __ensureRouteLayerSafe() {
                var ok = false;
                try {
                    if (typeof ensureRouteLayer === 'function') ok = !!ensureRouteLayer();
                } catch (e0) {}
                if (!ok) {
                    try {
                        if (window && typeof window.ensureRouteLayer === 'function') ok = !!window.ensureRouteLayer();
                    } catch (e1) {}
                }
                if (!ok) console.warn('[focusBus] ensureRouteLayer not found/failed');
                return ok;
            }

            function __syncRouteGlobalsSafe() {
                try {
                    if (typeof __syncRouteGlobals === 'function') __syncRouteGlobals();
                    else if (window && typeof window.__syncRouteGlobals === 'function') window.__syncRouteGlobals();
                } catch (e) {}
            }

            function __getRouteSourceSafeWinOnly() {
                __syncRouteGlobalsSafe();

                try {
                    if (window.__routeVectorSource && window.__routeVectorSource.getFeatures) return window.__routeVectorSource;
                } catch (e0) {}
                try {
                    if (window.routeVectorSource && window.routeVectorSource.getFeatures) return window.routeVectorSource;
                } catch (e1) {}

                // tag='path' 레이어에서 끌어오기
                try {
                    var layersArr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                    for (var i = 0; i < layersArr.length; i++) {
                        var ly = layersArr[i];
                        if (!ly || !ly.get) continue;
                        if (ly.get('tag') === 'path') {
                            var src = ly.getSource && ly.getSource();
                            if (src && src.getFeatures) {
                                window.__routeVectorSource = src;
                                window.routeVectorSource = src;
                                return src;
                            }
                        }
                    }
                } catch (e2) {}

                return null;
            }

            __ensureRouteLayerSafe();

            // ---------------------------------------------------------
            // ✅ routePathIndex 캐시 유틸
            // - coords<2면 캐시 덮어쓰기 금지(0개 캐시 때문에 느려지는 문제 방지)
            // ---------------------------------------------------------
            function __cacheRoutePathToIndex(rid, payload, cityCode) {
                try {
                    var ridNorm = String(rid || '').trim();
                    if (!ridNorm) return false;

                    var cc = cityCode || (typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25);
                    var idx = window.routePathIndex || (window.routePathIndex = {});

                    var prev =
                        (idx[ridNorm] && idx[ridNorm].coords && idx[ridNorm].coords.length >= 2 && idx[ridNorm]) ||
                        (idx[String(cc) + '|' + ridNorm] && idx[String(cc) + '|' + ridNorm].coords && idx[String(cc) + '|' + ridNorm].coords.length >= 2 && idx[String(cc) + '|' + ridNorm]) ||
                        null;

                    var d = payload;
                    if (d && typeof d === 'object' && d.data !== undefined) d = d.data;

                    var items = [];
                    try {
                        if (typeof extractRoutePathItems === 'function') {
                            items = extractRoutePathItems({ data: d }) || extractRoutePathItems(d) || [];
                        }
                    } catch (e0) {}

                    if (!items.length) {
                        if (Array.isArray(d)) items = d;
                        else if (d && Array.isArray(d.items)) items = d.items;
                        else if (d && Array.isArray(d.itemList)) items = d.itemList;
                        else if (d && d.response && d.response.body && d.response.body.items) {
                            var it = d.response.body.items.item;
                            if (Array.isArray(it)) items = it;
                            else if (it) items = [it];
                        }
                    }

                    var coords = [];
                    for (var i = 0; i < items.length; i++) {
                        var it2 = items[i] || {};
                        var lon = it2.gpslong || it2.gpsLong || it2.gpsx || it2.gpsX || it2.lon || it2.lng || it2.x;
                        var lat = it2.gpslati || it2.gpsLati || it2.gpsy || it2.gpsY || it2.lat || it2.y;
                        lon = Number(lon);
                        lat = Number(lat);
                        if (isFinite(lon) && isFinite(lat)) coords.push([lon, lat]);
                    }

                    if (!coords || coords.length < 2) {
                        if (prev) {
                            console.warn('[routePathIndex] skip caching (coords too short, keep prev)', ridNorm, 'coords=', coords ? coords.length : 0);
                            return false;
                        }
                        console.warn('[routePathIndex] skip caching (coords too short)', ridNorm, 'coords=', coords ? coords.length : 0);
                        return false;
                    }

                    var stopIds = [];
                    for (var k = 0; k < items.length; k++) {
                        var nid = String((items[k] && (items[k].nodeid || items[k].nodeId || items[k].node_id || items[k].node || items[k].stopId || items[k].stop_id || items[k].id || '')) || '').trim();
                        if (nid) stopIds.push(nid);
                    }

                    var info = { routeId: ridNorm, cityCode: cc, proj: 'EPSG:4326', coords: coords, stopIds: stopIds, raw: d || null };
                    idx[ridNorm] = info;
                    idx[String(cc) + '|' + ridNorm] = info;

                    console.log('[routePathIndex] cached', ridNorm, 'coords=', coords.length, 'stopIds=', stopIds.length);

                    // PERF: 변환 예열
                    try {
                        if (coords.length >= 2 && typeof window.__prewarmBusRouteProj === 'function') window.__prewarmBusRouteProj(ridNorm);
                    } catch (eWarm) {}

                    return true;
                } catch (e) {
                    console.warn('[routePathIndex] cache fail', e);
                    return false;
                }
            }

            // ---------------------------------------------------------
            // 1) nearest bus 선택
            // ---------------------------------------------------------
            var picked = null;
            try {
                if (typeof __pickNearestBusFeature === 'function') picked = __pickNearestBusFeature(map, routeId, routeNoNorm, stopXY);
            } catch (ePick) {}

            var busXY = picked && picked.xy ? picked.xy : null;
            var busFeat = picked && picked.feat ? picked.feat : null;

            if (!routeId) {
                try {
                    routeId = String(
                        (busFeat && busFeat.get && (busFeat.get('routeId') || busFeat.get('routeid') || busFeat.get('busRouteId'))) ||
                            (busFeat && busFeat.get && busFeat.get('bus') && (busFeat.get('bus').routeid || busFeat.get('bus').routeId || busFeat.get('bus').busRouteId)) ||
                            '',
                    ).trim();
                } catch (e0) {}
            }

            // ---------------------------------------------------------
            // ✅ FIX3) busXY가 lonlat(4326)로 들어오면 map proj로 변환
            // ---------------------------------------------------------
            function __ensureMapXY(map, xy) {
                try {
                    if (!xy || xy.length < 2) return null;
                    var x = Number(xy[0]),
                        y = Number(xy[1]);
                    if (!isFinite(x) || !isFinite(y)) return null;

                    var looksLonLat = Math.abs(x) <= 180 && Math.abs(y) <= 90;
                    if (!looksLonLat) return [x, y];

                    var view = map.getView && map.getView();
                    var proj = view && view.getProjection && view.getProjection();
                    var code = (proj && proj.getCode && proj.getCode()) || 'EPSG:3857';
                    if (OL.proj && OL.proj.transform) return OL.proj.transform([x, y], 'EPSG:4326', code);
                    return [x, y];
                } catch (e) {
                    return xy;
                }
            }
            busXY = __ensureMapXY(map, busXY);

            // ---------------------------------------------------------
            // 2) nearest marker(파란 화살표 + 번호)
            // ---------------------------------------------------------
            function __readHeadingRadFromFeature(f) {
                if (!f || !f.get) return 0;
                var v = f.get('headingRad');
                if (v != null) {
                    var r0 = Number(v);
                    if (isFinite(r0)) return r0;
                }
                var h = f.get('heading') || f.get('hdg') || f.get('dir') || f.get('angle') || (f.get('bus') && (f.get('bus').heading || f.get('bus').hdg || f.get('bus').dir || f.get('bus').angle));
                if (h == null) return 0;
                var hv = Number(h);
                if (!isFinite(hv)) return 0;
                return Math.abs(hv) > 6.283 ? (hv * Math.PI) / 180 : hv;
            }

            function __getNearestSourceSafeWinOnly() {
                try {
                    if (window.__nearestBusSource && window.__nearestBusSource.getFeatures) return window.__nearestBusSource;
                } catch (e0) {}
                return null;
            }

            // ✅ FIX2) ensureNearestBusLayer가 "아이콘 문제" 있더라도 번호가 무조건 보이게:
            // - 아이콘이 안되면 Circle+Text만으로도 보이게 만드는 걸 recommend
            function __drawNearestArrow(xy) {
                if (!xy) return;

                try {
                    if (typeof ensureNearestBusLayer === 'function') ensureNearestBusLayer(map);
                    // ensureNearestBusLayer가 다른 map에 붙는 경우 방지: tag로 다시 확인
                    try {
                        var arr = map.getLayers && map.getLayers().getArray ? map.getLayers().getArray() : [];
                        var hasNearest = false;
                        for (var i = 0; i < arr.length; i++) {
                            if (arr[i] && arr[i].get && arr[i].get('tag') === 'nearest-bus') {
                                hasNearest = true;
                                break;
                            }
                        }
                        if (!hasNearest && window.__nearestBusLayer) map.addLayer(window.__nearestBusLayer);
                    } catch (eAdd) {}
                } catch (e0) {}

                var src = __getNearestSourceSafeWinOnly();
                if (!src || !src.clear) return;

                try {
                    src.clear(true);
                } catch (e1) {}

                var rot = __readHeadingRadFromFeature(busFeat);
                var f2 = new OL.Feature({ geometry: new OL.geom.Point(xy) });

                try {
                    f2.set('rot', rot);
                } catch (e2) {}
                try {
                    f2.set('routeId', routeId);
                } catch (e3) {}
                try {
                    f2.set('routeNo', routeNoNorm || routeNoRaw || '');
                } catch (e4) {}

                try {
                    src.addFeature(f2);
                } catch (e5) {}

                // 렌더 강제 (추가 즉시 안 보이는 케이스 방지)
                try {
                    if (src.changed) src.changed();
                } catch (eC0) {}
                try {
                    if (window.__nearestBusLayer && window.__nearestBusLayer.changed) window.__nearestBusLayer.changed();
                } catch (eC1) {}
                try {
                    map.renderSync ? map.renderSync() : map.render && map.render();
                } catch (eC2) {}
            }

            if (opts.showNearest === true) {
                try {
                    if (busXY) __drawNearestArrow(busXY);
                    else {
                        var s0 = __getNearestSourceSafeWinOnly();
                        if (s0 && s0.clear) s0.clear(true);
                    }
                } catch (eNearest) {
                    console.warn('[focusBus] draw nearest bus fail:', eNearest);
                }
            } else {
                try {
                    var s1 = __getNearestSourceSafeWinOnly();
                    if (s1 && s1.clear) s1.clear(true);
                } catch (eClr) {}
            }

            // ---------------------------------------------------------
            // 3) fit + lock
            // ---------------------------------------------------------
            if (busXY) {
                try {
                    if (typeof __fitStopAndBus === 'function') __fitStopAndBus(map, stopXY, busXY);
                } catch (e2) {}
                try {
                    if (typeof __lockFit === 'function') __lockFit(map, stopXY, busXY);
                } catch (e3) {}
            }

            // ---------------------------------------------------------
            // snap helpers
            // ---------------------------------------------------------
            function __snapXYToCurrentRouteLine(xy) {
                try {
                    if (!xy) return xy;
                    var src = __getRouteSourceSafeWinOnly();
                    if (!src) return xy;

                    var feats = src.getFeatures() || [];
                    if (!feats.length) return xy;

                    var bestPt = null,
                        bestD2 = Infinity;
                    for (var i = 0; i < feats.length; i++) {
                        var g = feats[i] && feats[i].getGeometry && feats[i].getGeometry();
                        if (!g || !g.getType || g.getType() !== 'LineString') continue;
                        if (!g.getClosestPoint) continue;

                        var p = g.getClosestPoint(xy);
                        if (!p) continue;
                        var dx = p[0] - xy[0],
                            dy = p[1] - xy[1];
                        var d2 = dx * dx + dy * dy;
                        if (d2 < bestD2) {
                            bestD2 = d2;
                            bestPt = p;
                        }
                    }
                    return bestPt || xy;
                } catch (e) {
                    return xy;
                }
            }

            function __snapArrowToRouteIfPossible() {
                try {
                    if (!opts.showNearest) return;
                    if (!busXY) return;

                    var src = __getNearestSourceSafeWinOnly();
                    if (!src || !src.getFeatures) return;

                    var snapped = __snapXYToCurrentRouteLine(busXY);
                    if (!snapped) return;

                    var arr = src.getFeatures();
                    if (!arr || !arr.length) return;

                    var nf = arr[0];
                    var g = nf.getGeometry && nf.getGeometry();
                    if (g && g.setCoordinates) g.setCoordinates(snapped);

                    try {
                        if (typeof __fitStopAndBus === 'function') __fitStopAndBus(map, stopXY, snapped);
                        if (typeof __lockFit === 'function') __lockFit(map, stopXY, snapped);
                    } catch (eFit3) {}
                } catch (eSnap) {}
            }

            // ---------------------------------------------------------
            // route draw helpers
            // ---------------------------------------------------------
            function __countRouteFeaturesWinOnly() {
                try {
                    var src = __getRouteSourceSafeWinOnly();
                    if (!src || !src.getFeatures) return 0;
                    return (src.getFeatures() || []).length;
                } catch (e) {
                    return 0;
                }
            }

            function __drawFromIndex(rid) {
                try {
                    if (typeof window.drawBusRouteFromIndex === 'function') {
                        return !!window.drawBusRouteFromIndex(rid, { clear: false, fit: false });
                    }
                } catch (e0) {}
                return false;
            }

            function __warmByApiCandidates(rid, cc) {
                var ridNorm = String(rid || '').trim();
                if (!ridNorm) return Promise.reject('rid empty');

                var apiCandidates = [
                    '/api/bus/routePath?cityCode=' + cc + '&routeId=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?citycode=' + cc + '&routeId=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?city_code=' + cc + '&routeId=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?cityCode=' + cc + '&routeid=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?cityCode=' + cc + '&busRouteId=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?cityCode=' + cc + '&busrouteid=' + encodeURIComponent(ridNorm),
                    '/api/bus/routePath?cityCode=' + cc + '&route_id=' + encodeURIComponent(ridNorm),
                ];

                var i = 0;
                function next() {
                    if (i >= apiCandidates.length) return Promise.reject('all candidates failed');
                    var url = apiCandidates[i++];
                    return $http
                        .get(url)
                        .then(function (res) {
                            __cacheRoutePathToIndex(ridNorm, res, cc);
                            return res;
                        })
                        .catch(next);
                }
                return next();
            }

            // ✅✅✅ routeId별 중복 로딩 방지(in-flight)
            window.__routeLoadInFlight = window.__routeLoadInFlight || {};

            function __ensureRouteLoadedThenDraw(rid, done) {
                done = done || function () {};
                var ridNorm = String(rid || '').trim();
                if (!ridNorm) return done(false);

                var cc = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;

                function __hasIndexOK(rid0) {
                    try {
                        var idx = window.routePathIndex || {};
                        var info = idx[rid0] || idx[String(cc) + '|' + rid0];
                        return !!(info && info.coords && info.coords.length >= 2);
                    } catch (e) {
                        return false;
                    }
                }

                function __drawAndCheck() {
                    // ✅ FIX1) draw 직전에 다른 경로 레이어 제거 → 무조건 한 줄만 남게
                    __clearOtherPathLayersWhenBusSingle();

                    var ok1 = __drawFromIndex(ridNorm);
                    var cnt1 = __countRouteFeaturesWinOnly();
                    return !!ok1 && cnt1 > 0;
                }

                if (__hasIndexOK(ridNorm)) return done(__drawAndCheck());

                if (window.__routeLoadInFlight[ridNorm]) {
                    return window.__routeLoadInFlight[ridNorm]
                        .then(function () {
                            done(__drawAndCheck());
                        })
                        .catch(function () {
                            done(__drawAndCheck());
                        });
                }

                window.__routeLoadInFlight[ridNorm] = new Promise(function (resolve, reject) {
                    var p = null;
                    try {
                        if (typeof safeLoadRoutePath === 'function') p = safeLoadRoutePath(ridNorm);
                        else if (window && typeof window.safeLoadRoutePath === 'function') p = window.safeLoadRoutePath(ridNorm);
                    } catch (e1) {
                        p = null;
                    }

                    function finishOk(payload) {
                        __cacheRoutePathToIndex(ridNorm, payload, cc);
                        if (__hasIndexOK(ridNorm)) return resolve(true);

                        __warmByApiCandidates(ridNorm, cc)
                            .then(function (res2) {
                                __cacheRoutePathToIndex(ridNorm, res2, cc);
                                resolve(true);
                            })
                            .catch(function (e2) {
                                reject(e2);
                            });
                    }

                    if (p && typeof p.then === 'function') {
                        p.then(finishOk).catch(function () {
                            __warmByApiCandidates(ridNorm, cc)
                                .then(function (res3) {
                                    finishOk(res3);
                                })
                                .catch(function (e3) {
                                    reject(e3);
                                });
                        });
                    } else {
                        __warmByApiCandidates(ridNorm, cc)
                            .then(function (res4) {
                                finishOk(res4);
                            })
                            .catch(function (e4) {
                                reject(e4);
                            });
                    }
                }).finally(function () {
                    delete window.__routeLoadInFlight[ridNorm];
                });

                return window.__routeLoadInFlight[ridNorm]
                    .then(function () {
                        done(__drawAndCheck());
                    })
                    .catch(function () {
                        done(__drawAndCheck());
                    });
            }

            function __afterRouteDraw() {
                try {
                    try {
                        window.__stopFilterOn = true;
                    } catch (e0) {}
                    try {
                        if (typeof __stopFilterOn !== 'undefined') __stopFilterOn = true;
                    } catch (e1) {}

                    try {
                        if (typeof __lockHideAllStops === 'function') __lockHideAllStops();
                    } catch (eL) {}

                    try {
                        if (routeId && typeof window.drawRouteStopsByRouteId === 'function') {
                            window.drawRouteStopsByRouteId(routeId, { mode: 'BUS', clear: true, fit: false, $scope: $scope });
                        } else if (routeId && typeof window.applyRouteStopFilter === 'function') {
                            window.applyRouteStopFilter(routeId);
                        }
                    } catch (eStops) {}

                    var tries = 0;
                    function trySnap() {
                        tries++;
                        var cnt = __countRouteFeaturesWinOnly();
                        if (cnt > 0) __snapArrowToRouteIfPossible();
                        if (cnt <= 0 && tries < 8) return __sched(110, trySnap);
                        if (tries < 3) __sched(80, __snapArrowToRouteIfPossible);
                    }
                    __sched(0, trySnap);
                } catch (eAfter) {
                    console.warn('[focusBus] afterRouteDraw err:', eAfter);
                }
            }

            // ---------------------------------------------------------
            // routeId 우선
            // ---------------------------------------------------------
            if (routeId) {
                __ensureRouteLoadedThenDraw(routeId, function (okDraw) {
                    try {
                        var cc = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;
                        var hasIndex = !!(
                            window.routePathIndex &&
                            ((window.routePathIndex[routeId] && window.routePathIndex[routeId].coords && window.routePathIndex[routeId].coords.length >= 2) ||
                                (window.routePathIndex[String(cc) + '|' + routeId] && window.routePathIndex[String(cc) + '|' + routeId].coords && window.routePathIndex[String(cc) + '|' + routeId].coords.length >= 2))
                        );
                        var fcnt = __countRouteFeaturesWinOnly();
                        console.log('[focusBus] routeId=', routeId, 'drawOK=', okDraw, 'hasIndex=', hasIndex, 'routeFeatures=', fcnt);
                    } catch (eDbg) {}
                    __afterRouteDraw();
                });
                return;
            }

            // routeNo fallback
            if (routeNoNorm) {
                try {
                    console.warn('[focusBus] routeId empty -> routeNo fallback only:', routeNoNorm);
                } catch (e0) {}
                __afterRouteDraw();
                return;
            }

            __afterRouteDraw();
        };

        // =========================================================
        // (13) ✅✅✅ resetBusView (중복 없이 1개만) - FIXED
        // - 핵심 수정:
        //   1) route/nearest는 window source만 clear
        //   2) routePathIndex/Promise는 "일단 유지" (safeLoadRoutePath 붙기 전에는 삭제하면 더 안됨)
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

            // fit/필터/nearest 정리
            try {
                __cancelAllFitTimers();
            } catch (e0) {}
            __lastStopXY = null;
            __stopFilterOn = false;

            // ✅ nearest clear (window only)
            try {
                if (window.__nearestBusSource && window.__nearestBusSource.clear) window.__nearestBusSource.clear(true);
            } catch (eN) {}

            // ✅ 전체정류장(빨간점) 항상 숨김(강제)
            try {
                window.__forceHideAllStops = true;
                if (typeof __hideAllStopsLayerOnly === 'function') __hideAllStopsLayerOnly();
                if (typeof __lockHideAllStops === 'function') __lockHideAllStops();
            } catch (eS) {}

            // ✅ route-stops 지우기
            try {
                if (typeof __hideRouteStopsLayer === 'function') __hideRouteStopsLayer();
                if (typeof clearRouteStopsOnly === 'function') clearRouteStopsOnly();
            } catch (eRS) {}

            stopPolling();

            // 기존 소스 정리
            try {
                if (vectorSource) vectorSource.clear(true);
            } catch (e1) {}
            try {
                if (busVectorSource) busVectorSource.clear(true);
            } catch (e2) {}

            // ✅ route clear는 window route source만
            try {
                if (window.__routeVectorSource && window.__routeVectorSource.clear) window.__routeVectorSource.clear(true);
                else if (window.routeVectorSource && window.routeVectorSource.clear) window.routeVectorSource.clear(true);
            } catch (e3) {}

            // 트램 관련
            try {
                if (tramVectorSource) tramVectorSource.clear(true);
            } catch (e6) {}
            try {
                if (tramStationSource) tramStationSource.clear(true);
            } catch (e7) {}
            $scope.activeTramSections = {};

            // 버스 상태 캐시들
            try {
                busLastPos && busLastPos.clear();
            } catch (e8) {}
            try {
                busLastProjPos && busLastProjPos.clear();
            } catch (e9) {}
            try {
                busLastHeading && busLastHeading.clear();
            } catch (e10) {}
            try {
                busFeatureMap && busFeatureMap.clear();
            } catch (e11) {}
            try {
                busLastSeen && busLastSeen.clear();
            } catch (e12) {}

            // ❗ routePathIndex/Promise는 지금은 유지(자동 로더 붙기 전엔 지우면 더 안됨)
            // 필요하면 safeLoadRoutePath가 완성된 뒤에만 초기화로 되돌려도 됨.

            // 지도 초기 위치 복귀
            try {
                __sched(0, function () {
                    var map = typeof __getMapSafe === 'function' ? __getMapSafe() : null;
                    if (map && map.getView) {
                        var view = map.getView();
                        try {
                            if (initialCenter) view.setCenter(initialCenter);
                            if (typeof initialZoom === 'number') view.setZoom(initialZoom);
                            if (map.updateSize) map.updateSize();
                            if (map.renderSync) map.renderSync();
                            else if (map.render) map.render();
                        } catch (e) {}
                    }
                });
            } catch (e00) {}
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
        // ✅ arrival API (출발 기준 routeId 확보용) - STABLE
        // - "$scope / $rootScope / window" 어디서든 접근 가능
        // - ✅ $q 없을 때도 안전
        // - ✅ 중복 정의/덮어쓰기 최소화
        // ---------------------------------------------------------

        // ✅ Promise resolve helper ($q or native Promise)
        function __resolveP(v) {
            try {
                if (typeof $q !== 'undefined' && $q && typeof $q.resolve === 'function') return $q.resolve(v);
            } catch (e0) {}
            return Promise.resolve(v);
        }

        // ✅ 이미 만들어둔게 있으면 재사용 (중복 정의 방지)
        if (!$scope.fetchArrivalForStop) {
            $scope.fetchArrivalForStop = function (cityCode, stopId) {
                var c = cityCode != null && cityCode !== '' ? cityCode : typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;

                c = parseInt(c, 10);
                if (!isFinite(c)) c = 25;

                var sid = String(stopId || '').trim();
                if (!sid) return __resolveP([]);

                return $http
                    .get('/api/bus/arrival', {
                        params: {
                            cityCode: c, // ✅ 25
                            nodeId: sid, // ✅ DJB001682 같은 정류장ID
                            numOfRows: 50,
                            pageNo: 1,
                        },
                    })
                    .then(function (res) {
                        var data = res && res.data;

                        // ✅ JSON string이면 파싱(안전)
                        if (typeof data === 'string') {
                            try {
                                data = JSON.parse(data);
                            } catch (eJson) {
                                data = {};
                            }
                        }

                        // ✅ 표준 응답 형태 흡수
                        var body = ((data || {}).response || {}).body || {};
                        var list = (body.items && body.items.item) || [];

                        if (!Array.isArray(list)) list = list ? [list] : [];
                        return list;
                    })
                    .catch(function () {
                        return [];
                    });
            };
        }

        // ✅ 전역/루트스코프 노출 (덮어쓰기 최소화: 없을 때만 세팅)
        try {
            if (typeof $rootScope !== 'undefined' && $rootScope && !$rootScope.fetchArrivalForStop) {
                $rootScope.fetchArrivalForStop = $scope.fetchArrivalForStop;
            }
        } catch (e1) {}

        try {
            if (window && typeof window.fetchArrivalForStop !== 'function') {
                window.fetchArrivalForStop = $scope.fetchArrivalForStop;
            }
        } catch (e2) {}

        // ✅ (중요) "로컬 함수명 fetchArrivalForStop"는 만들지 말자.
        // - 번들 구조에서 다른 파일의 동일 함수명을 덮을 위험이 큼
        // - 대신 alias가 필요하면 window alias만 사용하면 됨:
        //
        //   window.fetchArrivalForStop(cityCode, stopId)
        //
        // 만약 기존 코드가 "fetchArrivalForStop(...)"를 로컬로 직접 부른다면,
        // 그 호출부를 "window.fetchArrivalForStop(...)"로 바꾸는게 가장 안전함.

        /* =========================================================
   ✅ 여기(수집 로직 시작하기 전)에 추가: ETA 뽑기 유틸
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
        var collectTimer = null;
        var collectToken = 0;

        $scope.collecting = false;
        $scope.collectPaused = false;
        $scope.collectAutoBoot = true;
        $scope.collectSaveToDb = true;

        $scope.collectStatusText = '';
        $scope.collectBatchInfo = '';
        $scope.collectCycleInfo = '';
        $scope.collectSavedCount = 0;
        $scope.collectLastAt = null;

        function setCollectStatusSafe(type, msg) {
            try {
                if (typeof setCollectStatus === 'function') {
                    setCollectStatus(type, msg);
                    return;
                }
            } catch (e) {}
            $scope.collectStatusText = msg || '';
        }

        $scope.canStartCollect = function () {
            try {
                var c = $scope.collect || {};
                var fromOk = !!((c.from && c.from.stopId) || String(c.fromStopId || '').trim());
                var toOk = !!((c.to && c.to.stopId) || String(c.toStopId || '').trim());

                var period = parseInt(c.periodSec, 10);
                var periodOk = isFinite(period) && period >= 5;

                return fromOk && toOk && periodOk;
            } catch (e) {
                return false;
            }
        };

        function cancelCollectTimer() {
            if (collectTimer) {
                try {
                    $interval.cancel(collectTimer);
                } catch (e) {}
                collectTimer = null;
            }
        }

        function runCollectTick(saveToDb, myToken, reason) {
            if (myToken !== collectToken) return;
            if (!$scope.collecting) return;
            if ($scope.collectPaused) return;

            if (!$scope.canStartCollect()) {
                $scope.collecting = false;
                cancelCollectTimer();
                setCollectStatusSafe('info', '출발/도착/주기 조건이 부족해서 수집 대기중');
                $scope.collectCycleInfo = '대기중';
                return;
            }

            var c = $scope.collect || {};
            var sec = Number(c.periodSec || 10);

            $scope.collectCycleInfo = '주기: ' + sec + 's';
            $scope.collectLastAt = new Date();

            try {
                var ret = $scope.collectOnce && $scope.collectOnce(!!saveToDb, myToken);

                if (ret && typeof ret.then === 'function') {
                    ret.then(function (r) {
                        if (myToken !== collectToken) return;
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

        function ensureCollectAutoBoot() {
            if (!$scope.collectAutoBoot) return;
            if ($scope.collecting && collectTimer) return;

            if ($scope.canStartCollect()) {
                $scope.startCollect();
            } else {
                setCollectStatusSafe('info', '출발/도착 선택 시 자동으로 수집이 시작됩니다.');
                $scope.collectCycleInfo = '대기중';
            }
        }

        $scope.startCollect = function () {
            var sec = Number($scope.collect && $scope.collect.periodSec);
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
            var myToken = collectToken;

            setCollectStatusSafe('ok', $scope.collectSaveToDb ? '자동 수집 시작 (DB 저장 ON)' : '자동 수집 시작 (저장 OFF)');

            runCollectTick($scope.collectSaveToDb, myToken, 'start');

            collectTimer = $interval(function () {
                runCollectTick($scope.collectSaveToDb, myToken, 'interval');
            }, sec * 1000);
        };

        $scope.stopCollect = function () {
            cancelCollectTimer();
            collectToken++;

            $scope.collecting = false;
            $scope.collectPaused = false;

            setCollectStatusSafe('ok', '수집 중지됨');
            $scope.collectBatchInfo = '';
            $scope.collectCycleInfo = '중지';
        };

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
                ensureCollectAutoBoot();
                return;
            }
            $scope.collectPaused = false;
            setCollectStatusSafe('ok', '재개됨');
        };

        $scope.testCollectOnce = function () {
            collectToken++;
            var myToken = collectToken;
            $scope.collecting = true;
            $scope.collectPaused = false;
            runCollectTick(true, myToken, 'test');
        };

        // ✅ 페이지 진입 시 자동 부팅
        (function initAutoCollectBoot() {
            $timeout(function () {
                ensureCollectAutoBoot();
            }, 0);

            $scope.$watchGroup(['collect.fromStopId', 'collect.toStopId', 'collect.from.stopId', 'collect.to.stopId', 'collect.periodSec'], function () {
                if ($scope.collecting && collectTimer) return;
                ensureCollectAutoBoot();
            });

            $scope.$on('$destroy', function () {
                cancelCollectTimer();
                collectToken++;
            });
        })();

        // ---------------------------------------------------------
        // ✅ API 응답에서 routeId/routeNo/sec 추출 (ES5 버전)
        // ---------------------------------------------------------
        function pickRouteId(x) {
            return String(x && (x.routeid || x.routeId || x.busRouteId || x.route_id || x.rid || '')).trim();
        }
        function pickRouteNo(x) {
            return String(x && (x.routeno || x.routeNo || x.routenm || x.routeNm || x.lineNo || x.busRouteNm || '')).trim();
        }
        function pickArrSec(x) {
            var sec = Number(x && (x.arrtime || x.arrTime || x.arrivalSec || x.remaintime || x.remainTime || x.traTime));
            if (!isFinite(sec) || sec < 0) return null;
            return Math.floor(sec);
        }

        function pickBestArrivalItem(list) {
            var best = null;
            (list || []).forEach(function (x) {
                var rid = pickRouteId(x);
                var rno = pickRouteNo(x);
                var sec = pickArrSec(x);
                if (!rid || !rno) return;
                if (sec == null) return;

                if (!best || sec < best.sec) {
                    best = { routeId: rid, routeNo: rno, sec: sec, raw: x };
                }
            });
            return best;
        }

        function pickBestCommonRoute(fromList, toList) {
            var fromMap = new Map();
            (fromList || []).forEach(function (x) {
                var rid = pickRouteId(x);
                var sec = pickArrSec(x);
                if (!rid || sec == null) return;

                if (!fromMap.has(rid)) fromMap.set(rid, x);
                else {
                    var prev = fromMap.get(rid);
                    var prevSec = pickArrSec(prev);
                    if (prevSec == null || sec < prevSec) fromMap.set(rid, x);
                }
            });

            var best = null;

            (toList || []).forEach(function (y) {
                var rid = pickRouteId(y);
                if (!rid) return;
                if (!fromMap.has(rid)) return;

                var x = fromMap.get(rid);

                var fromSec = pickArrSec(x);
                var toSec = pickArrSec(y);
                if (fromSec == null || toSec == null) return;

                var diffSec = toSec - fromSec;
                if (diffSec <= 0 || diffSec > 7200) return;

                var routeNo = pickRouteNo(x) || pickRouteNo(y);
                if (!routeNo) return;

                var cand = {
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
                    },
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
                                        : ''),
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
                }),
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
                        }),
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
                        },
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
                    },
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
        // ✅✅✅ [ADD] 특정 노선(routeId)의 stopIds만 "filteredStopsLayer"로 보여주기
        // - routePathIndex[routeId].stopIds 또는 info.stops 기반
        // - 전체 stopsVectorLayer는 숨기고 filteredStopsLayer만 켬
        // =========================================================
        function showOnlyStopsForRoute(routeId) {
            routeId = String(routeId || '').trim();
            if (!routeId) return false;

            if (!ensureStopsLayer()) return false;
            if (!window.routePathIndex || !routePathIndex) return false;

            var info = routePathIndex[routeId];
            if (!info) {
                console.warn('[showOnlyStopsForRoute] routePathIndex missing:', routeId);
                return false;
            }

            // stopIds 뽑기 (너가 저장한 형태 둘 다 대응)
            var stopIds =
                (Array.isArray(info.stopIds) && info.stopIds) ||
                (Array.isArray(info.stops) &&
                    info.stops.map(function (x) {
                        return x && (x.nodeId || x.nodeid || x.stopId || x.id);
                    })) ||
                null;

            if (!stopIds || !stopIds.length) {
                console.warn('[showOnlyStopsForRoute] stopIds empty:', routeId);
                return false;
            }

            // ✅ filteredStopsSource 초기화
            try {
                filteredStopsSource.clear(true);
            } catch (e0) {}

            // ✅ id set
            var set = Object.create(null);
            for (var i = 0; i < stopIds.length; i++) {
                var sid = String(stopIds[i] || '').trim();
                if (sid) set[sid] = true;
            }

            // ✅ stopsVectorSource에 이미 찍혀 있는 Feature 중에서 nodeId 매칭되는 것만 복제해서 filtered로 이동
            var picked = 0;

            // (A) stopFeatureById 인덱스를 쓰는 게 제일 빠름 (너가 이미 만들었음)
            try {
                for (var sid2 in set) {
                    if (!set.hasOwnProperty(sid2)) continue;
                    var f = stopFeatureById && stopFeatureById[sid2];
                    if (!f) continue;

                    // ✅ clone 해서 filtered에 넣기 (원본은 전체 레이어 소스에 남겨둠)
                    var c = f.clone();
                    // clone하면 style이 안 딸려갈 수 있어서 원본 style 복사
                    try {
                        if (f.getStyle) c.setStyle(f.getStyle());
                    } catch (eS) {}

                    filteredStopsSource.addFeature(c);
                    picked++;
                }
            } catch (e1) {}

            // (B) 인덱스가 비어있을 때 대비(보험): source 전체 스캔
            if (picked === 0) {
                try {
                    var feats = stopsVectorSource && stopsVectorSource.getFeatures ? stopsVectorSource.getFeatures() : [];
                    for (var k = 0; k < feats.length; k++) {
                        var ff = feats[k];
                        var nid = String((ff && ff.get && ff.get('nodeId')) || '').trim();
                        if (!nid || !set[nid]) continue;

                        var cc = ff.clone();
                        try {
                            if (ff.getStyle) cc.setStyle(ff.getStyle());
                        } catch (eS2) {}
                        filteredStopsSource.addFeature(cc);
                        picked++;
                    }
                } catch (e2) {}
            }

            // ✅ 핵심: 전체 레이어 숨기고 / 필터 레이어만 켜기
            try {
                if (stopsVectorLayer) stopsVectorLayer.setVisible(false);
                if (filteredStopsLayer) filteredStopsLayer.setVisible(true);
            } catch (e3) {}

            console.log('[showOnlyStopsForRoute] picked stops=', picked, 'routeId=', routeId);
            return picked > 0;
        }

        // =========================================================
        // ✅ 필터 상태 잠금(전역)
        // =========================================================
        function __applyStopVisibility() {
            try {
                if (stopsVectorLayer) stopsVectorLayer.setVisible(!__stopFilterOn); // 전체 OFF
                if (filteredStopsLayer) filteredStopsLayer.setVisible(__stopFilterOn); // 필터 ON
            } catch (e) {}
        }

        // =========================================================
        // ✅ 초기화 (전체/필터 source 비우기만 하고, 가시성은 "필터 상태"를 존중)
        // =========================================================
        function clearStopsOnMap() {
            try {
                if (stopsVectorSource) stopsVectorSource.clear(true);
            } catch (e1) {}
            try {
                if (filteredStopsSource) filteredStopsSource.clear(true);
            } catch (e2) {}

            stopFeatureById = Object.create(null);

            // ✅ 핵심: 무조건 전체 ON / 필터 OFF 하지 말고 현재 상태 유지
            __applyStopVisibility();
        }

        // =========================================================
        // ✅ 필터 해제: 다시 전체 정류장 보이기
        // =========================================================
        function clearStopFilter() {
            __stopFilterOn = false;

            try {
                if (filteredStopsSource) filteredStopsSource.clear(true);
            } catch (e0) {}

            __applyStopVisibility();
        }

        // =========================================================
        // ✅ 전체 정류장 보이기(원복)
        // =========================================================
        function showAllStops() {
            __stopFilterOn = false;

            ensureStopsLayer();
            try {
                if (filteredStopsSource) filteredStopsSource.clear(true);
            } catch (e1) {}

            __applyStopVisibility();
        }

        // =========================================================
        // ✅ stopIds를 받아서 "필터 레이어"에만 표시
        // - stopFeatureById 에서 찾아 clone해서 filteredStopsSource에 올림
        // =========================================================
        function showStopsForRouteStops(stopIds) {
            if (!ensureStopsLayer()) return;
            if (!filteredStopsSource || !filteredStopsLayer) return;

            // stopIds 정규화
            var ids = Array.isArray(stopIds) ? stopIds : [];
            var set = Object.create(null);

            for (var i = 0; i < ids.length; i++) {
                var k = String(ids[i] || '').trim();
                if (!k || k === 'undefined' || k === 'null') continue;
                set[k] = true;
            }

            // 필터 비었으면 원복
            var hasAny = false;
            for (var kk in set) {
                hasAny = true;
                break;
            }
            if (!hasAny) {
                showAllStops();
                return;
            }

            // ✅ 필터 ON
            __stopFilterOn = true;
            __applyStopVisibility();

            // filtered 채우기
            try {
                filteredStopsSource.clear(true);
            } catch (e0) {}

            var added = 0;
            Object.keys(set).forEach(function (nodeId) {
                var base = stopFeatureById && stopFeatureById[nodeId];
                if (!base) return;

                var clone = base.clone();

                // clone은 style이 복사 안 되는 경우가 있어서 강제 세팅
                try {
                    if (base.getStyle) clone.setStyle(base.getStyle());
                } catch (e1) {}

                filteredStopsSource.addFeature(clone);
                added++;
            });

            console.log('[showStopsForRouteStops] filtered stops added=', added);
        }

        // =========================================================
        // ✅✅✅ [REPLACE] applyRouteStopFilter(routeId)
        // - routePath에서 stopIds만 뽑아 "필터 적용"만 한다.
        // - ✅ cityCode fallback
        // - ✅ items 추출 강화
        // - ✅ stopId 키 다양하게 지원 + 중복 제거
        // - ✅ stopIds 0일 때 원인 로그
        // =========================================================
        function applyRouteStopFilter(routeId) {
            if (!ensureStopsLayer()) return;

            var rid = String(routeId || '').trim();
            if (!rid) return;

            // ✅ CITY_CODE 안전 처리
            var cc = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;

            console.log('[filter] routeId=', rid, 'cityCode=', cc);

            // ✅ routePath 호출 (정상 파라미터 1개로 고정)
            // (만약 너가 fetchRoutePathFallback(rid) 만들어둔 상태면, 여기서 교체 가능)
            $http
                .get('/api/bus/routePath', { params: { cityCode: cc, routeId: rid } })
                .then(function (res) {
                    var items = [];

                    // 1) 프로젝트 커스텀 extractor가 있으면 우선 사용
                    try {
                        if (typeof extractRoutePathItems === 'function') {
                            items = extractRoutePathItems(res) || [];
                        }
                    } catch (e) {
                        items = [];
                    }

                    // 2) fallback: 흔한 응답 포맷들 처리
                    if (!items || !items.length) {
                        var d = res && res.data;

                        // 배열로 바로 오는 경우
                        if (Array.isArray(d)) {
                            items = d;
                        }
                        // { items: [...] }
                        else if (d && Array.isArray(d.items)) {
                            items = d.items;
                        }
                        // { itemList: [...] }
                        else if (d && Array.isArray(d.itemList)) {
                            items = d.itemList;
                        }
                        // TAGO 스타일: response.body.items.item
                        else if (d && d.response && d.response.body && d.response.body.items) {
                            var it = d.response.body.items.item;
                            if (Array.isArray(it)) items = it;
                            else if (it) items = [it];
                        }
                    }

                    console.log('[filter] routePath items=', items ? items.length : 0);

                    if (!items || !items.length) {
                        console.warn('[filter] routePath empty (rid=', rid, ')');
                        // ✅ 정류장 필터를 원복/해제하고 싶으면 여기서 처리 가능
                        // showStopsForRouteStops([]);  // <- 전체 숨김은 원치 않으면 주석
                        return;
                    }

                    // ✅ stopIds 추출 (키 다양 지원)
                    var stopIdSet = {};
                    var stopIds = [];

                    function pushStopId(raw) {
                        var s = String(raw || '').trim();
                        if (!s) return;
                        if (stopIdSet[s]) return;
                        stopIdSet[s] = true;
                        stopIds.push(s);
                    }

                    for (var i = 0; i < items.length; i++) {
                        var it = items[i] || {};

                        // ✅ nodeId 후보들
                        pushStopId(it.nodeid);
                        pushStopId(it.nodeId);
                        pushStopId(it.node_id);
                        pushStopId(it.node);
                        pushStopId(it.NODE_ID);
                        pushStopId(it.NODEID);

                        // ✅ 혹시 stopId로 오는 케이스도 대비
                        pushStopId(it.stopId);
                        pushStopId(it.stopid);
                        pushStopId(it.stop_id);

                        // ✅ from/to 형태로 오는 케이스 대비 (간혹 세그먼트로 줄 때)
                        pushStopId(it.from_node_id);
                        pushStopId(it.to_node_id);
                        pushStopId(it.fromNodeId);
                        pushStopId(it.toNodeId);
                    }

                    console.log('[filter] stopIds=', stopIds.length);

                    // stopIds가 0이면: 응답 키가 다르거나, routePath가 정류장 기반이 아닐 수 있음
                    if (!stopIds.length) {
                        try {
                            console.warn('[filter] stopIds=0. sample keys=', Object.keys(items[0] || {}));
                        } catch (e2) {}
                        return;
                    }

                    // ✅ 핵심: 전체 정류장 인덱스에서 골라서 필터 적용
                    if (typeof showStopsForRouteStops === 'function') {
                        showStopsForRouteStops(stopIds);
                    } else {
                        console.warn('[filter] showStopsForRouteStops is not defined');
                    }
                })
                .catch(function (err) {
                    console.error('[filter] routePath error', err);
                });
        }

        // =========================================================
        // ✅ 필터 해제(별칭)
        // =========================================================
        function clearRouteStopFilter() {
            clearStopFilter();
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
        // ✅✅✅ [ADD/REPLACE] "경로 정류장만" 표시 레이어 (route-stops)
        //  - 출발(FROM)=초록, 도착(TO)=빨강
        //  - 나머지: BUS=파랑, TRAM=보라
        //  - 정류장 이름(label) 표시
        //  - ✅ 핵심: routeStopSource에 넣을 때 좌표를 "항상 map projection"으로 맞춤
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
                        if (role === 'FROM')
                            color = '#22c55e'; // 초록
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

                try {
                    routeStopLayer.set('tag', 'route-stops');
                } catch (e1) {}
                map.addLayer(routeStopLayer);
            }

            // ✅ 혹시 다른 로직에서 숨겨놨으면 강제로 보이게
            try {
                routeStopLayer.setVisible(true);
            } catch (e2) {}

            return true;
        }

        function clearRouteStopsOnly() {
            try {
                if (routeStopSource) routeStopSource.clear(true);
            } catch (e) {}
        }

        // =========================================================
        // ✅ 좌표 유틸: stop 객체가 lon/lat이든, 이미 proj이든 -> "map projection XY"로 통일
        // =========================================================
        function __routeStop_toMapXY(map, stopObjOrCoord) {
            try {
                if (!map || !stopObjOrCoord) return null;

                var view = map.getView && map.getView();
                var proj = view && view.getProjection ? view.getProjection() : null;

                // 1) 배열로 들어온 경우
                if (Array.isArray(stopObjOrCoord) && stopObjOrCoord.length >= 2) {
                    var x0 = Number(stopObjOrCoord[0]);
                    var y0 = Number(stopObjOrCoord[1]);
                    if (!isFinite(x0) || !isFinite(y0)) return null;

                    // lon/lat처럼 보이면 변환
                    if (Math.abs(x0) <= 180 && Math.abs(y0) <= 90 && proj && ol.proj && ol.proj.transform) {
                        return ol.proj.transform([x0, y0], 'EPSG:4326', proj);
                    }
                    return [x0, y0];
                }

                // 2) stop 객체로 들어온 경우
                var s = stopObjOrCoord;

                // (A) 이미 투영좌표일 가능성: gpsx/gpsy
                var px = parseFloat(s.gpsx || s.gpsX || s.x || s.X);
                var py = parseFloat(s.gpsy || s.gpsY || s.y || s.Y);
                if (isFinite(px) && isFinite(py)) {
                    // 투영좌표는 대개 절대값이 큼
                    if (Math.abs(px) > 180 || Math.abs(py) > 90) return [px, py];
                }

                // (B) lon/lat
                var lat = parseFloat(s.gpslati || s.gpsLati || s.lat || s.latitude);
                var lon = parseFloat(s.gpslong || s.gpsLong || s.lon || s.longitude);

                // swap 방어
                if (isFinite(lat) && isFinite(lon) && Math.abs(lat) > 90 && Math.abs(lon) <= 90) {
                    var t = lat;
                    lat = lon;
                    lon = t;
                }

                if (!isFinite(lat) || !isFinite(lon)) return null;
                if (!proj || !ol.proj || !ol.proj.transform) return null;

                return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
            } catch (e) {
                return null;
            }
        }

        // =========================================================
        // ✅ stopId로 stop 객체 찾기 (프로젝트 변수명 다양해서 최대한 방어)
        // - stopIndex / stopsById / $scope.stops / window.stops 등에서 탐색
        // =========================================================
        function __routeStop_findStopById(stopId, $scope) {
            stopId = String(stopId || '').trim();
            if (!stopId) return null;

            // 1) 맵 구조
            try {
                if (window.stopIndex && window.stopIndex[stopId]) return window.stopIndex[stopId];
            } catch (e1) {}
            try {
                if (window.stopsById && window.stopsById[stopId]) return window.stopsById[stopId];
            } catch (e2) {}
            try {
                if ($scope && $scope.stopIndex && $scope.stopIndex[stopId]) return $scope.stopIndex[stopId];
            } catch (e3) {}

            // 2) 배열 구조
            var arr = null;
            try {
                if ($scope && Array.isArray($scope.stops)) arr = $scope.stops;
            } catch (e4) {}
            if (!arr) {
                try {
                    if (Array.isArray(window.stops)) arr = window.stops;
                } catch (e5) {}
            }
            if (!arr) {
                try {
                    if (Array.isArray(window.stopList)) arr = window.stopList;
                } catch (e6) {}
            }

            if (Array.isArray(arr)) {
                for (var i = 0; i < arr.length; i++) {
                    var s = arr[i];
                    if (!s) continue;
                    var sid = String(s.nodeid || s.nodeId || s.stopId || s.stopid || s.id || s.ID || '').trim();
                    if (sid === stopId) return s;
                }
            }
            return null;
        }

        // =========================================================
        // ✅✅✅ [REPLACE] 선택 노선(routeId) 관련 "정류장만" 표시 (ULTRA STABLE v2)
        // - routeStopSource(route-stops)에도 찍고
        // - ✅ 핵심: showStopsForRouteStops(stopIds) 호출로 "전체 정류장"은 숨기고 필터만 노출
        // - ✅ routePathIndex 키 불일치 대응(routeId / city|routeId / fuzzy)
        // - ✅ ensureRouteStopLayer / routeStopSource 확보 방어
        // - ✅ fit: source.getExtent 미지원 대비(geometry extent 직접 계산)
        // =========================================================
        function drawRouteStopsByRouteId(routeId, opts) {
            opts = opts || {};
            routeId = String(routeId || '').trim();
            if (!routeId) return false;

            var map = null;
            try {
                map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : window.getInnerOlMap ? window.getInnerOlMap() : null;
            } catch (eM) {}
            if (!map) return false;

            // ✅ route-stops 레이어 확보(전역/윈도우 혼용 방어)
            var ok = false;
            try {
                if (typeof ensureRouteStopLayer === 'function') ok = !!ensureRouteStopLayer();
            } catch (e0) {}
            if (!ok) {
                try {
                    if (window && typeof window.ensureRouteStopLayer === 'function') ok = !!window.ensureRouteStopLayer();
                } catch (e1) {}
            }

            // routeStopSource 확보(전역/윈도우 혼용 방어)
            var rs = null;
            try {
                if (window.routeStopSource && window.routeStopSource.addFeature) rs = window.routeStopSource;
            } catch (e2) {}
            try {
                if (!rs && typeof routeStopSource !== 'undefined' && routeStopSource && routeStopSource.addFeature) rs = routeStopSource;
            } catch (e3) {}

            if (!ok || !rs) {
                console.warn('[drawRouteStopsByRouteId] route-stops layer/source missing', 'ok=', ok, 'rs=', !!rs);
                return false;
            }

            // (옵션) 그릴 때마다 기존 정류장 지움
            if (opts.clear !== false) {
                try {
                    rs.clear(true);
                } catch (e4) {}
            }

            // ✅ routePathIndex 키 불일치 대응
            var idx = window.routePathIndex || (typeof routePathIndex !== 'undefined' ? routePathIndex : null) || {};
            if (!window.routePathIndex) window.routePathIndex = idx;

            function __findInfo(idx, rid) {
                if (!idx || !rid) return null;

                // 1) routeId 그대로
                if (idx[rid]) return idx[rid];

                // 2) city|routeId
                var cc = typeof CITY_CODE !== 'undefined' && CITY_CODE ? CITY_CODE : 25;
                var k1 = String(cc) + '|' + rid;
                if (idx[k1]) return idx[k1];

                // 3) 대문자 변형
                var ridU = String(rid).trim().toUpperCase();
                if (idx[ridU]) return idx[ridU];
                var k1U = String(cc) + '|' + ridU;
                if (idx[k1U]) return idx[k1U];

                // 4) fuzzy (routeId 포함 키)
                try {
                    var keys = Object.keys(idx);
                    for (var i = 0; i < keys.length; i++) {
                        var k = keys[i];
                        if (!k) continue;
                        if (String(k).indexOf(rid) >= 0 || String(k).indexOf(ridU) >= 0) {
                            console.warn('[drawRouteStopsByRouteId] using fuzzy key:', k, 'for routeId:', rid);
                            return idx[k];
                        }
                    }
                } catch (eK) {}

                return null;
            }

            var info = __findInfo(idx, routeId);
            if (!info) {
                try {
                    console.warn('[drawRouteStopsByRouteId] routePathIndex missing:', routeId, 'keys(sample)=', Object.keys(idx).slice(0, 10));
                } catch (eKs) {
                    console.warn('[drawRouteStopsByRouteId] routePathIndex missing:', routeId);
                }
                return false;
            }

            // ✅ stopIds 후보 (다양 포맷 흡수)
            var stopIds =
                (Array.isArray(info.stopIds) && info.stopIds) ||
                (Array.isArray(info.stops) &&
                    info.stops
                        .map(function (x) {
                            return x && (x.nodeId || x.nodeid || x.node_id || x.stopId || x.stopid || x.id || x.node);
                        })
                        .filter(Boolean)) ||
                null;

            // info.raw/TAGO 응답에서 nodeid 뽑기
            if ((!stopIds || !stopIds.length) && info && (info.raw || info.data || info.res)) {
                var d = info.raw || info.data || info.res;
                var items = null;
                try {
                    if (d && Array.isArray(d.itemList)) items = d.itemList;
                    else if (d && Array.isArray(d.items)) items = d.items;
                    else if (d && d.response && d.response.body && d.response.body.items) {
                        var it = d.response.body.items.item;
                        if (Array.isArray(it)) items = it;
                        else if (it) items = [it];
                    }
                } catch (eIt) {}

                if (items && items.length) {
                    var tmp = [];
                    for (var ii = 0; ii < items.length; ii++) {
                        var nid = String((items[ii] && (items[ii].nodeid || items[ii].nodeId || items[ii].node_id || items[ii].node || '')) || '').trim();
                        if (nid) tmp.push(nid);
                    }
                    if (tmp.length) stopIds = tmp;
                }
            }

            if (!stopIds || !stopIds.length) {
                console.warn(
                    '[drawRouteStopsByRouteId] stopIds empty:',
                    routeId,
                    'infoKeys=',
                    (function () {
                        try {
                            return Object.keys(info || {});
                        } catch (e) {
                            return [];
                        }
                    })(),
                );
                // stopIds가 없으면 필터도 불가 → 원복(원하면)
                try {
                    if (typeof showAllStops === 'function') showAllStops();
                } catch (e00) {}
                return false;
            }

            // ✅ 중복 제거
            var dedup = [];
            var seen = Object.create(null);
            for (var si = 0; si < stopIds.length; si++) {
                var sid0 = String(stopIds[si] || '').trim();
                if (!sid0) continue;
                if (seen[sid0]) continue;
                seen[sid0] = true;
                dedup.push(sid0);
            }
            stopIds = dedup;

            // ✅✅✅ 핵심: 선택 노선 정류장만 지도에 보이게 (전체 정류장 숨김)
            try {
                if (typeof showStopsForRouteStops === 'function') {
                    showStopsForRouteStops(stopIds);
                }
            } catch (eFilter) {
                console.warn('[drawRouteStopsByRouteId] showStopsForRouteStops fail:', eFilter);
            }

            // FROM/TO 역할(있으면 표시)
            var fromId = String(opts.fromStopId || info.fromStopId || info.from || info.startStopId || '').trim();
            var toId = String(opts.toStopId || info.toStopId || info.to || info.endStopId || '').trim();

            var mode = String(opts.mode || info.mode || 'BUS').toUpperCase();
            var labelField = opts.labelField || 'nodenm';

            // 유틸이 없으면 기본 fallback
            function __fallbackToMapXY(map, obj) {
                try {
                    var view = map && map.getView && map.getView();
                    var proj = view && view.getProjection && view.getProjection();

                    // lat/lon 후보들
                    var lat = obj && (obj.gpslati || obj.gpsLati || obj.lat || obj.latitude || obj.gpsy || obj.gpsY);
                    var lon = obj && (obj.gpslong || obj.gpsLong || obj.lon || obj.longitude || obj.gpsx || obj.gpsX);

                    lat = parseFloat(lat);
                    lon = parseFloat(lon);
                    if (!isFinite(lat) || !isFinite(lon)) return null;

                    if (ol && ol.proj && ol.proj.transform && proj) {
                        return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                    }
                    return [lon, lat];
                } catch (e) {
                    return null;
                }
            }

            // extent 누적용
            var OL = typeof ol !== 'undefined' ? ol : window && window.ol ? window.ol : null;
            var extent = null;
            var count = 0;

            for (var k = 0; k < stopIds.length; k++) {
                var sid = String(stopIds[k] || '').trim();
                if (!sid) continue;

                // stop 객체 찾기
                var sObj = null;
                try {
                    if (typeof __routeStop_findStopById === 'function') {
                        sObj = __routeStop_findStopById(sid, opts.$scope);
                    }
                } catch (eFind) {}

                // 좌표 얻기
                var xy = null;
                if (sObj) {
                    try {
                        if (typeof __routeStop_toMapXY === 'function') {
                            xy = __routeStop_toMapXY(map, sObj);
                        }
                    } catch (eXY) {}

                    if (!xy) xy = __fallbackToMapXY(map, sObj);
                }

                // info.stops에 좌표가 들어있는 케이스 방어
                if (!xy && Array.isArray(info.stops)) {
                    for (var j = 0; j < info.stops.length; j++) {
                        var t = info.stops[j];
                        var tid = String((t && (t.nodeId || t.nodeid || t.stopId || t.id)) || '').trim();
                        if (tid === sid) {
                            sObj = t;
                            try {
                                if (typeof __routeStop_toMapXY === 'function') xy = __routeStop_toMapXY(map, t);
                            } catch (eXY2) {}
                            if (!xy) xy = __fallbackToMapXY(map, t);
                            break;
                        }
                    }
                }

                if (!xy) continue;

                var label = '';
                try {
                    label = String((sObj && (sObj[labelField] || sObj.nodeNm || sObj.nodenm || sObj.name || sObj.stopNm)) || '');
                } catch (eL) {}

                var f = new ol.Feature({
                    geometry: new ol.geom.Point(xy),
                });

                f.set('kind', 'routeStop');
                f.set('routeId', routeId);
                f.set('stopId', sid);
                f.set('mode', mode);
                f.set('label', label);

                if (fromId && sid === fromId) f.set('role', 'FROM');
                else if (toId && sid === toId) f.set('role', 'TO');

                try {
                    rs.addFeature(f);
                } catch (eAdd) {}
                count++;

                // extent 누적(가능하면)
                try {
                    if (OL && OL.extent && typeof OL.extent.extend === 'function') {
                        var g = f.getGeometry && f.getGeometry();
                        var ex = g && g.getExtent && g.getExtent();
                        if (ex && isFinite(ex[0])) {
                            extent = extent ? OL.extent.extend(extent, ex) : ex.slice();
                        }
                    }
                } catch (eEx) {}
            }

            console.log('[drawRouteStopsByRouteId] drawn:', count, 'routeId:', routeId, 'mode:', mode);

            // (선택) 정류장만 화면 fit
            if (opts.fit && extent && map.getView && map.getView()) {
                try {
                    map.getView().fit(extent, { padding: [60, 420, 60, 60], duration: 180 });
                } catch (eFit) {}
            }

            return count > 0;
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
                    },
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
                    },
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
        // ✅✅✅ [CLEAN FINAL] clearPath + clearAllRouteLayersOnMap (ES5, 중복/충돌 제거)
        // - clearPath: 경로 상태 초기화 + 경로 레이어 완전 초기화
        // - __clearAllRouteLayersOnMap(scope, opts):
        //    단일 path + seg + mixed + marker + route-stops + highlight + hover overlay + 캐시까지 싹 정리
        //    (옵션) 전체정류장(빨간점) hide/show 가능
        // =========================================================

        // ---------------------------------------------------------
        // ✅ scope 안전 getter
        // ---------------------------------------------------------
        function __getScopeSafe() {
            try {
                if (typeof $scope !== 'undefined' && $scope) return $scope;
            } catch (e) {}
            return null;
        }

        // ---------------------------------------------------------
        // ✅ map 안전 getter
        // ---------------------------------------------------------
        function __getMapSafe() {
            try {
                if (typeof getInnerOlMap === 'function') return getInnerOlMap();
            } catch (e) {}
            return null;
        }

        // ---------------------------------------------------------
        // ✅ map rerender
        // ---------------------------------------------------------
        function __renderMapSafe() {
            try {
                var map = __getMapSafe();
                if (!map) return;
                if (map.renderSync) map.renderSync();
                else if (map.render) map.render();
            } catch (e) {}
        }

        // ---------------------------------------------------------
        // ✅ route layer clear (완전 초기화)
        // opts:
        //   - hideAllStops: true면 전체정류장(빨간점) 숨김
        //   - showAllStops: true면 전체정류장(빨간점) 복구
        // ---------------------------------------------------------
        function __clearAllRouteLayersOnMap(scope, opts) {
            scope = scope || __getScopeSafe();
            opts = opts || {};

            // 1) 단일 경로/세그먼트
            try {
                if (typeof pathVectorSource !== 'undefined' && pathVectorSource) pathVectorSource.clear(true);
            } catch (e1) {}
            try {
                if (typeof pathSegSource !== 'undefined' && pathSegSource) pathSegSource.clear(true);
            } catch (e2) {}

            // 2) MIXED
            try {
                if (typeof mixedBusSource !== 'undefined' && mixedBusSource) mixedBusSource.clear(true);
            } catch (e3) {}
            try {
                if (typeof mixedTramSource !== 'undefined' && mixedTramSource) mixedTramSource.clear(true);
            } catch (e4) {}
            try {
                if (typeof mixedWalkSource !== 'undefined' && mixedWalkSource) mixedWalkSource.clear(true);
            } catch (e5) {}
            try {
                if (typeof mixedTransferSource !== 'undefined' && mixedTransferSource) mixedTransferSource.clear(true);
            } catch (e6) {}
            try {
                if (typeof mixedMarkerSource !== 'undefined' && mixedMarkerSource) mixedMarkerSource.clear(true);
            } catch (e7) {}

            // 3) route stops (정류장 강조 레이어)
            try {
                if (typeof clearRouteStopsOnly === 'function') {
                    clearRouteStopsOnly();
                } else {
                    // fallback: 프로젝트마다 변수명이 다를 수 있어 안전하게
                    try {
                        if (typeof routeStopsSource !== 'undefined' && routeStopsSource) routeStopsSource.clear(true);
                    } catch (e8) {}
                    try {
                        if (typeof routeStopSource !== 'undefined' && routeStopSource) routeStopSource.clear(true);
                    } catch (e9) {}
                    try {
                        if (typeof routeStopVectorSource !== 'undefined' && routeStopVectorSource) routeStopVectorSource.clear(true);
                    } catch (e10) {}
                }
            } catch (e11) {}

            // 4) 하이라이트(있으면)
            try {
                if (typeof clearMixedHighlight === 'function') clearMixedHighlight();
            } catch (e12) {}

            // 5) hover overlay 숨김 (mixed)
            try {
                if (typeof __mixedOverlay !== 'undefined' && __mixedOverlay) __mixedOverlay.setPosition(undefined);
            } catch (e13) {}
            try {
                if (typeof __mixedHoverLastFeatureUid !== 'undefined') __mixedHoverLastFeatureUid = null;
            } catch (e14) {}

            // 6) hover overlay 숨김 (single)
            try {
                if (typeof __segHoverOverlay !== 'undefined' && __segHoverOverlay) __segHoverOverlay.setPosition(undefined);
            } catch (e15) {}

            // 7) ✅ 캐시 초기화 (잔상 방지)
            try {
                window.__lastRouteStopIds = [];
            } catch (e16) {}
            try {
                window.__lastStopCoordMap = {};
            } catch (e17) {}
            try {
                window.__lastStopLabelMap = {};
            } catch (e18) {}
            try {
                window.__lastEdgeMetaMap = {};
            } catch (e19) {}

            // 8) scope 상태(있으면)
            if (scope) {
                try {
                    scope.pathPolylineFeature = null;
                } catch (e20) {}
                try {
                    scope.pathPolylineExtent = null;
                } catch (e21) {}
                try {
                    scope.pathPolylineReady = false;
                } catch (e22) {}
            }

            // 9) (옵션) 전체정류장(빨간점) hide/show
            // ⚠️ 기본은 건드리지 않는게 안전함 (원할 때만 opts로)
            if (opts.hideAllStops === true) {
                try {
                    if (typeof __hideAllStopsLayerOnly === 'function') __hideAllStopsLayerOnly();
                    else if (typeof __setAllStopsVisible === 'function') __setAllStopsVisible(false);
                    else if (typeof setAllStopsVisible === 'function') setAllStopsVisible(false);
                } catch (e23) {}
            }
            if (opts.showAllStops === true) {
                try {
                    if (typeof __showAllStopsLayerOnly === 'function') __showAllStopsLayerOnly();
                    else if (typeof __setAllStopsVisible === 'function') __setAllStopsVisible(true);
                    else if (typeof setAllStopsVisible === 'function') setAllStopsVisible(true);
                } catch (e24) {}
            }

            // 10) 렌더
            __renderMapSafe();
        }

        // ---------------------------------------------------------
        // ✅✅✅ [REPLACE] clearPath
        // - 기본: 경로만 지움 (전체정류장 빨간점은 건드리지 않음)
        // - 경로 지울 때 빨간점도 같이 없애고 싶으면 hideAllStops:true로 바꿔
        // ---------------------------------------------------------
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

            // 1) ✅ 지도 경로 완전 초기화
            try {
                __clearAllRouteLayersOnMap($scope, {
                    hideAllStops: false, // ✅ 기본 false (원하면 true)
                });
            } catch (e0) {
                // fallback
                try {
                    if (typeof clearPathOnMap === 'function') clearPathOnMap();
                } catch (e1) {}
                try {
                    if (typeof clearRouteStopsOnly === 'function') clearRouteStopsOnly();
                } catch (e2) {}
            }

            if (typeof setPathStatus === 'function') setPathStatus('', '경로를 지웠습니다.');
        };

        // ---------------------------------------------------------
        // ✅ (선택) HTML에서 호출용 (전역 함수랑 이름 겹치지 않게)
        // - ng-click="clearAllRouteLayersOnMap(true)" 이런식으로 쓰면 됨
        // ---------------------------------------------------------
        $scope.clearAllRouteLayersOnMap = function (hideAllStops) {
            try {
                __clearAllRouteLayersOnMap($scope, {
                    hideAllStops: hideAllStops === true,
                });
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
            },
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

                if (prefix === 'posts')
                    postsRadar = ch; // ✅ 변수명 유지
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
