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
        // ✅ 버스 파란 화살표 마커 레이어
        // =========================================================
        function ensureBusVectorLayer() {
            const map = getInnerOlMap();
            if (!map) return;

            if (!window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return;
            if (busVectorLayer && busVectorSource) return;

            busVectorSource = new ol.source.Vector();
            busVectorLayer = new ol.layer.Vector({
                source: busVectorSource,
                style: busArrowStyle,
                zIndex: 30,
            });
            map.addLayer(busVectorLayer);
        }

        // =========================================================
        // ✅ Route Layer (버스/도보/트램/트램공구) 공통 레이어
        // =========================================================

        // 전역(컨트롤러 스코프) 변수라고 가정
        // var routeVectorLayer = null;
        // var routeVectorSource = null;
        // var mapProjection = ...; // 이미 쓰고 있음
        // function getInnerOlMap(){...} // 이미 쓰고 있음

        // ✅ 스타일은 매번 새로 만들면 성능도 떨어지고, 미묘하게 참조 꼬임도 생김 → 캐시
        let __ROUTE_STYLES__ = null;

        // ✅ pathKind 정규화
        function normRouteKind(k) {
            const s = String(k || '').toUpperCase();

            // 공구
            if (s === 'TRAM_TOOL' || s === 'TRAMTOOL' || s === 'TOOL' || s === 'TRAM_TOOL_ROUTE') return 'TRAM_TOOL';

            // 도보
            if (s === 'WALK' || s === 'WALKING' || s === 'FOOT' || s === 'PED' || s === 'PEDESTRIAN') return 'WALK';

            // 트램 최단
            if (s === 'TRAM' || s === 'RAIL' || s === 'TRAIN') return 'TRAM';

            // 기본 = 버스
            return 'BUS';
        }

        function ensureRouteLayer() {
            const map = getInnerOlMap && getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return false;

            // 이미 있으면 OK
            if (routeVectorLayer && routeVectorSource) return true;

            // ✅ 스타일 캐시 생성(최초 1회)
            if (!__ROUTE_STYLES__) {
                __ROUTE_STYLES__ = {
                    BUS: new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#2563eb',
                            width: 5,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                    WALK: new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#111827',
                            width: 3,
                            lineCap: 'round',
                            lineJoin: 'round',
                            lineDash: [8, 8],
                        }),
                    }),
                    TRAM: new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#ec4899',
                            width: 6,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                    TRAM_TOOL: new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: '#111827',
                            width: 6,
                            lineCap: 'round',
                            lineJoin: 'round',
                        }),
                    }),
                };
            }

            routeVectorSource = new ol.source.Vector();

            routeVectorLayer = new ol.layer.Vector({
                source: routeVectorSource,
                style: function (feature) {
                    const kind = normRouteKind(feature && feature.get ? feature.get('pathKind') : '');

                    // 공구 우선
                    if (kind === 'TRAM_TOOL') return __ROUTE_STYLES__.TRAM_TOOL;
                    if (kind === 'WALK') return __ROUTE_STYLES__.WALK;
                    if (kind === 'TRAM') return __ROUTE_STYLES__.TRAM;

                    return __ROUTE_STYLES__.BUS;
                },
                zIndex: 15,
            });

            map.addLayer(routeVectorLayer);

            // ✅ 디버그용 전역 핸들 (콘솔에서 확인 가능)
            window.__routeVectorLayer = routeVectorLayer;
            window.__routeVectorSource = routeVectorSource;

            // ✅ 콘솔에서 map 접근도 가능하게(원하면)
            window.__getInnerOlMap = getInnerOlMap;

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
        // ✅ draw helper (cacheKey 기반) : "실제 폴리라인 생성" 담당
        // - routeVectorSource는 ensureRouteLayer()에서 window.__routeVectorSource로 노출됨
        // =========================================================
        function tryDrawFromCacheKey(cacheKey, opts) {
            opts = opts || {};

            ensureRouteLayer();

            const src = window.__routeVectorSource;
            if (!src || !src.addFeature || !window.ol || !ol.geom) {
                console.warn('[tryDrawFromCacheKey] route source missing');
                return false;
            }

            const info = routePathIndex[cacheKey];
            if (!info || !info.dirs) {
                console.warn('[tryDrawFromCacheKey] no cache:', cacheKey, info);
                return false;
            }

            const dirs = info.dirs || {};
            const coordsProj = (dirs.ALL && dirs.ALL.length >= 2 && dirs.ALL) || (dirs.UP && dirs.UP.length >= 2 && dirs.UP) || (dirs.DOWN && dirs.DOWN.length >= 2 && dirs.DOWN) || null;

            if (!coordsProj || coordsProj.length < 2) {
                console.warn('[tryDrawFromCacheKey] empty coords:', cacheKey, Object.keys(dirs || {}));
                return false;
            }

            // ✅ 기존 선 지우고(원하면 주석)
            if (typeof clearRouteLayer === 'function') clearRouteLayer();
            else src.clear(true);

            // ✅ 네 프로젝트에 addPathLineToRouteLayer 있으면 그걸 우선 사용(스타일/속성 유지)
            if (typeof addPathLineToRouteLayer === 'function') {
                addPathLineToRouteLayer('BUS', coordsProj, {
                    routeId: info.routeId,
                    cityCode: info.cityCode,
                    cacheKey: cacheKey,
                    kind: 'routeLine',
                });
            } else {
                // fallback: 직접 feature 추가
                const line = new ol.geom.LineString(coordsProj);
                const feat = new ol.Feature({ geometry: line });
                if (feat.set) {
                    feat.set('pathKind', 'BUS');
                    feat.set('routeId', info.routeId);
                    feat.set('cityCode', info.cityCode);
                    feat.set('cacheKey', cacheKey);
                    feat.set('kind', 'routeLine');
                }
                if (typeof feat.setStyle === 'function') feat.setStyle(null);
                src.addFeature(feat);
            }

            // ✅ fit 옵션이면 화면 맞추기
            if (opts.fit) {
                const map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
                const view = map && map.getView ? map.getView() : null;
                if (view && ol.extent && src.getExtent) {
                    try {
                        const ext = src.getExtent();
                        view.fit(ext, { padding: [30, 30, 30, 30], duration: 200, maxZoom: 17 });
                    } catch (e) {}
                }
            }

            console.log('[tryDrawFromCacheKey] drawn:', cacheKey, 'features=', src.getFeatures ? src.getFeatures().length : '?');
            return true;
        }

        // =========================================================
        // ✅ 경로 로딩 Promise 캐시 (+ raw fallback + draw 옵션 지원)
        // - cacheKey = cityCode:routeId
        // - routePathIndex[cacheKey] = { dirs, proj, cityCode, routeId }
        // - opts.draw=true 이면 캐시 채운 후 그리기까지 수행
        // =========================================================
        function loadRoutePath(routeId, opts) {
            opts = opts || {};
            const draw = !!opts.draw;

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

            ensureRouteLayer();

            const defer = $q.defer();
            routePathPromise[cacheKey] = defer.promise;

            // ---------- 유틸 ----------
            function normDirKey(v) {
                const s = String(v || '').toUpperCase();
                if (s === '0' || s === 'UP' || s === 'U' || s.includes('상')) return 'UP';
                if (s === '1' || s === 'DOWN' || s === 'D' || s.includes('하')) return 'DOWN';
                return 'ALL';
            }

            function pickDirKey(p) {
                return normDirKey(p && (p.updowncd ?? p.upDownCd ?? p.upDown ?? p.updown ?? p.dir ?? p.direction ?? p.directionType ?? p.updn ?? 'ALL'));
            }

            function pickLonLat(p) {
                if (!p) return null;
                const latRaw = p.gpslati ?? p.gpsLati ?? p.gpsLat ?? p.gpsY ?? p.lat ?? p.latitude ?? p.y ?? p.mapY ?? p.posY ?? p.tmY;
                const lonRaw = p.gpslong ?? p.gpsLong ?? p.gpsLon ?? p.gpsX ?? p.lon ?? p.longitude ?? p.x ?? p.mapX ?? p.posX ?? p.tmX;
                const lat = Number(latRaw);
                const lon = Number(lonRaw);
                if (!isFinite(lat) || !isFinite(lon)) return null;
                if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
                return { lon: lon, lat: lat };
            }

            function buildFromLonLatList(coordsLonLat, proj) {
                if (!coordsLonLat || coordsLonLat.length < 2) return null;

                // 중복 제거
                const filtered = [];
                let prevLon = null,
                    prevLat = null;

                coordsLonLat.forEach(function (xy) {
                    const lon = Number(xy && xy[0]);
                    const lat = Number(xy && xy[1]);
                    if (!isFinite(lon) || !isFinite(lat)) return;

                    const rLon = Math.round(lon * 1e6) / 1e6;
                    const rLat = Math.round(lat * 1e6) / 1e6;
                    if (prevLon === rLon && prevLat === rLat) return;

                    filtered.push([lon, lat]);
                    prevLon = rLon;
                    prevLat = rLat;
                });

                if (filtered.length < 2) return null;

                const dense = typeof densifyCoords === 'function' ? densifyCoords(filtered, 1) : filtered;
                const smooth = typeof chaikinSmooth === 'function' ? chaikinSmooth(dense, 1) : dense;

                const projected = smooth.map(function (xy) {
                    const lon = xy[0],
                        lat = xy[1];
                    if (proj && ol.proj && ol.proj.transform) return ol.proj.transform([lon, lat], 'EPSG:4326', proj);
                    return [lon, lat];
                });

                return projected && projected.length >= 2 ? projected : null;
            }

            // =========================================================
            // ✅ 실제 로딩은 "raw" 기반으로 통일 (너가 이미 만들어둔 loadRoutePathRaw 사용)
            // =========================================================
            (typeof loadRoutePathRaw === 'function' ? loadRoutePathRaw(rid, cc) : $q.resolve(null))
                .then(function (raw) {
                    if (!raw || !raw.list || !raw.list.length) {
                        console.warn('[loadRoutePath] raw empty:', { cc: cc, rid: rid, raw: raw });
                        routePathIndex[cacheKey] = null;
                        defer.resolve(null);
                        return;
                    }

                    const list = raw.list;

                    const view = map.getView && map.getView();
                    const proj = (view && view.getProjection && view.getProjection()) || mapProjection;

                    // 그룹핑(dir)
                    const groups = new Map();
                    list.forEach(function (p) {
                        const k = pickDirKey(p);
                        if (!groups.has(k)) groups.set(k, []);
                        groups.get(k).push(p);
                    });

                    // dirs 생성
                    const dirCoordsMap = {};
                    groups.forEach(function (arr, k) {
                        if (!arr || arr.length < 2) return;

                        arr.sort(function (a, b) {
                            const aOrdRaw = a && (a.nodeord ?? a.nodeOrd ?? a.nodeseq ?? a.nodeSeq ?? a.seq ?? a.ord);
                            const bOrdRaw = b && (b.nodeord ?? b.nodeOrd ?? b.nodeseq ?? b.nodeSeq ?? b.seq ?? b.ord);
                            const aOrd = isFinite(parseInt(aOrdRaw, 10)) ? parseInt(aOrdRaw, 10) : 0;
                            const bOrd = isFinite(parseInt(bOrdRaw, 10)) ? parseInt(bOrdRaw, 10) : 0;
                            return aOrd - bOrd;
                        });

                        const coordsLonLat = [];
                        arr.forEach(function (p2) {
                            const ll = pickLonLat(p2);
                            if (ll) coordsLonLat.push([ll.lon, ll.lat]);
                        });

                        const projected = buildFromLonLatList(coordsLonLat, proj);
                        if (projected && projected.length >= 2) dirCoordsMap[k] = projected;
                    });

                    // ALL 보정
                    if ((!dirCoordsMap.ALL || dirCoordsMap.ALL.length < 2) && (dirCoordsMap.UP || dirCoordsMap.DOWN)) {
                        const up = dirCoordsMap.UP && dirCoordsMap.UP.length >= 2 ? dirCoordsMap.UP : null;
                        const down = dirCoordsMap.DOWN && dirCoordsMap.DOWN.length >= 2 ? dirCoordsMap.DOWN : null;
                        if (up) dirCoordsMap.ALL = up;
                        else if (down) dirCoordsMap.ALL = down;
                    }

                    const cached = {
                        dirs: dirCoordsMap,
                        proj: proj,
                        cityCode: cc,
                        routeId: rid,
                        cacheKey: cacheKey,
                        _rawLen: list.length,
                    };

                    routePathIndex[cacheKey] = cached;

                    console.log('[loadRoutePath] cached:', {
                        cacheKey: cacheKey,
                        rawLen: list.length,
                        keys: Object.keys(dirCoordsMap || {}),
                        allLen: dirCoordsMap.ALL ? dirCoordsMap.ALL.length : 0,
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
        // ✅ 공통: routeId -> load(cache) -> draw (옵션)
        // - 여기서 draw:true를 주면 loadRoutePath가 알아서 그림까지 함
        // =========================================================
        function drawBusRouteByRouteId(routeId, opt) {
            opt = opt || {};
            const rid = String(routeId || '').trim();
            if (!rid) return $q.resolve(null);

            const cc = String(opt.cityCode || (typeof CITY_CODE !== 'undefined' ? CITY_CODE : 25) || 25).trim();
            const cacheKey = makeCacheKey(cc, rid);

            return loadRoutePath(rid, {
                cityCode: cc,
                draw: true, // ✅ load 안에서 draw까지 처리
                fit: !!opt.fit, // ✅ fit도 draw helper가 처리
                from: opt.reason || 'drawBusRouteByRouteId',
            }).then(function (cached) {
                if (!cached) {
                    console.warn('[drawBusRouteByRouteId] cached null:', cacheKey);
                    return null;
                }
                // 디버그: feature 개수
                try {
                    const src = window.__routeVectorSource;
                    const cnt = src && src.getFeatures ? src.getFeatures().length : -1;
                    console.log('[drawBusRouteByRouteId] ok:', { cacheKey: cacheKey, features: cnt });
                } catch (e) {}
                return cached;
            });
        }

        // =========================================================
        // ✅ 도착정보 목록에서 버스 클릭
        // - 기존 로직 유지하면서 "폴리라인"은 drawBusRouteByRouteId로 통일
        // =========================================================
        $scope.focusBus = function (arrival) {
            if (!arrival) return;

            const targetNo = String(arrival.routeNo || arrival.routeno || arrival.route_no || arrival.routeNoNm || '').trim();

            // ✅ routeId: 실제 routePath용
            const arrivalRouteId = String(arrival.routeid || arrival.routeId || arrival.busRouteId || (arrival._raw && (arrival._raw.routeid || arrival._raw.routeId || arrival._raw.busRouteId)) || '').trim();

            // ✅ 후보 없어도 routeId만 있으면 그리기 시도 가능
            if (!arrivalRouteId) {
                console.warn('[focusBus] arrivalRouteId empty:', arrival);
                return;
            }

            const map = typeof getInnerOlMap === 'function' ? getInnerOlMap() : null;
            if (!map || !busVectorSource) {
                // 버스 피처 없어도 routeId만으로는 그릴 수 있음
                return drawBusRouteByRouteId(arrivalRouteId, { fit: true, reason: 'arrival-click(no-map-or-busSource)' });
            }

            const features = busVectorSource.getFeatures ? busVectorSource.getFeatures() : [];

            // routeNo 정규화
            function normalizeRouteNo(v) {
                return String(v || '')
                    .replace(/\s+/g, '')
                    .replace(/번/g, '')
                    .trim();
            }

            const targetNoNorm = normalizeRouteNo(targetNo);

            // 후보 찾기(있으면 map center만 이동)
            let moved = false;
            if (features && features.length) {
                const candidates = [];
                for (let i = 0; i < features.length; i++) {
                    const f = features[i];
                    const fRouteNo = normalizeRouteNo(f.get && (f.get('routeNo') || f.get('routeno') || f.get('route_no') || (f.get('bus') && f.get('bus').routeno)));
                    const fRouteId = String((f.get && (f.get('routeid') || f.get('routeId') || f.get('busRouteId'))) || (f.get && f.get('bus') && (f.get('bus').routeid || f.get('bus').routeId || f.get('bus').busRouteId)) || '').trim();

                    if (targetNoNorm && fRouteNo && fRouteNo === targetNoNorm) candidates.push(f);
                    else if (arrivalRouteId && fRouteId && fRouteId === arrivalRouteId) candidates.push(f);
                }

                // 첫 후보로 화면 이동(선택 UX용)
                if (candidates.length) {
                    try {
                        const geom = candidates[0].getGeometry && candidates[0].getGeometry();
                        const coord = geom && geom.getCoordinates ? geom.getCoordinates() : null;
                        const view = map.getView && map.getView();
                        if (view && coord) {
                            view.setCenter(coord);
                            const z = view.getZoom ? view.getZoom() : null;
                            if (!z || z < 15) view.setZoom(15);
                            moved = true;
                        }
                    } catch (e) {}
                }
            }

            console.log('[focusBus] click:', {
                targetNo: targetNoNorm,
                arrivalRouteId: arrivalRouteId,
                movedToBus: moved,
            });

            // ✅✅✅ 폴리라인은 여기 한 줄로 끝
            return drawBusRouteByRouteId(arrivalRouteId, { fit: true, reason: 'arrival-click' });
        };

        // =========================================================
        // ✅ 버스 탭 리셋
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

        // ================== 수집(폴링) ==================
        let collectTimer = null;
        let collectToken = 0;

        $scope.collecting = false;

        // ---------------------------------------------------------
        // ✅ 수집 시작 가능 조건
        $scope.canStartCollect = function () {
            try {
                const c = $scope.collect || {};

                const fromOk = !!((c.from && c.from.stopId) || String(c.fromStopId || '').trim());
                const toOk = !!((c.to && c.to.stopId) || String(c.toStopId || '').trim());

                const period = parseInt(c.periodSec, 10);
                const periodOk = isFinite(period) && period >= 5;

                // ✅ routeId 조건 제거 (출발/도착만 있으면 OK)
                return fromOk && toOk && periodOk;
            } catch (e) {
                return false;
            }
        };

        $scope.startCollect = function () {
            const sec = Number($scope.collect && $scope.collect.periodSec);
            if (!sec || sec < 5) {
                setCollectStatus('error', '주기(초)는 5 이상이어야 해요.');
                return;
            }

            if (collectTimer) $interval.cancel(collectTimer);
            collectTimer = null;

            $scope.collecting = true;

            collectToken++;
            const myToken = collectToken;

            setCollectStatus('ok', '수집 시작됨 (자동 저장 ON)');

            $scope.collectOnce(true, myToken);

            collectTimer = $interval(function () {
                $scope.collectOnce(true, myToken);
            }, sec * 1000);
        };

        $scope.stopCollect = function () {
            if (collectTimer) {
                $interval.cancel(collectTimer);
                collectTimer = null;
            }

            collectToken++;

            $scope.collecting = false;
            setCollectStatus('ok', '수집 중지됨');
        };

        // ✅ 자동수집 JOB 등록
        $scope.registerAutoCollect = function () {
            try {
                const c = $scope.collect || {};

                const cityCode = Number(c.cityCode || 25);
                const periodSec = Number(c.periodSec || 10);

                const fromStopId = String((c.from && c.from.stopId) || c.fromStopId || '').trim();
                const toStopId = String((c.to && c.to.stopId) || c.toStopId || '').trim();

                const fromStopName = String((c.from && (c.from.name || c.from.nodenm || c.from.nodeNm)) || c.fromStopName || '').trim();
                const toStopName = String((c.to && (c.to.name || c.to.nodenm || c.to.nodeNm)) || c.toStopName || '').trim();

                const mode = String(c.mode || 'BUS').trim(); // BUS / TRAM / BUS_TRAM 등 네 정책대로

                if (!fromStopId || !toStopId) {
                    alert('출발/도착 정류장을 먼저 선택하세요.');
                    return;
                }

                const body = {
                    cityCode,
                    fromStopId,
                    toStopId,
                    fromStopName,
                    toStopName,
                    mode,
                    periodSec,
                };

                $scope.collectStatus = 'JOB 등록 중...';
                $http.post('/api/buscollect/register', body).then(
                    function (res) {
                        $scope.collectStatus = '✅ 자동수집 JOB 등록 완료 (서버가 켜져있는 동안 자동 저장됨)';
                        // 원하면 JOB 목록 갱신도
                        $scope.loadJobs && $scope.loadJobs();
                    },
                    function (err) {
                        $scope.collectStatus = '❌ JOB 등록 실패: ' + ((err.data && err.data.message) || err.statusText);
                    }
                );
            } catch (e) {
                $scope.collectStatus = '❌ 예외: ' + e.message;
            }
        };

        // ✅ 자동수집 JOB 해제
        $scope.disableAutoCollect = function () {
            const c = $scope.collect || {};
            const cityCode = Number(c.cityCode || 25);

            const fromStopId = String((c.from && c.from.stopId) || c.fromStopId || '').trim();
            const toStopId = String((c.to && c.to.stopId) || c.toStopId || '').trim();
            const mode = String(c.mode || 'BUS').trim();

            if (!fromStopId || !toStopId) {
                alert('출발/도착 정류장을 먼저 선택하세요.');
                return;
            }

            $scope.collectStatus = 'JOB 해제 중...';
            $http.post('/api/buscollect/disable', { cityCode, fromStopId, toStopId, mode }).then(
                function () {
                    $scope.collectStatus = '✅ 자동수집 JOB 해제 완료';
                    $scope.loadJobs && $scope.loadJobs();
                },
                function (err) {
                    $scope.collectStatus = '❌ JOB 해제 실패: ' + ((err.data && err.data.message) || err.statusText);
                }
            );
        };

        // (선택) JOB 목록 확인용
        $scope.loadJobs = function () {
            $http.get('/api/buscollect/jobs?enabled=1').then(function (res) {
                $scope.jobs = res.data && res.data.items ? res.data.items : [];
            });
        };

        $scope.testCollectOnce = function () {
            return $scope.collectOnce(true, collectToken);
        };

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
                if (!rid || !rno) return; // ✅ route 정보도 API에서 있어야 저장
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
        // ✅ 수집 1회 실행 (API ONLY)
        // ---------------------------------------------------------
        $scope.collectOnce = function (saveToDb, tokenFromCaller) {
            // ✅ boolean normalize
            saveToDb = saveToDb !== false;

            const myToken = tokenFromCaller == null ? collectToken : tokenFromCaller;

            // 수집 중단/토큰 변경이면 중단
            if (saveToDb && (!$scope.collecting || myToken !== collectToken)) return;

            $scope.collect = $scope.collect || {};
            if ($scope.collect._saving == null) $scope.collect._saving = false;

            const cityCode = String($scope.collect.cityCode || CITY_CODE || 25);

            const fromStopId = String(($scope.collect.from && $scope.collect.from.stopId) || $scope.collect.fromStopId || '').trim();
            const toStopId = String(($scope.collect.to && $scope.collect.to.stopId) || $scope.collect.toStopId || '').trim();

            if (!fromStopId) return setCollectStatus('error', '출발 정류장을 선택해야 해요.');
            if (!toStopId) return setCollectStatus('error', '도착 정류장을 선택해야 해요.');

            function formatEta(sec) {
                sec = Math.max(0, Math.floor(Number(sec) || 0));
                var m = Math.floor(sec / 60);
                return '약 ' + m + '분 (' + sec + 's)';
            }

            // ---------------------------
            // ✅ 실행 시작 (API ONLY)
            // ---------------------------
            setCollectStatus('ok', saveToDb ? '수집 + DB 저장 중...(API ONLY)' : '수집 중...(저장 안 함)');

            const pFrom = fetchArrivalForStop(cityCode, fromStopId);
            const pTo = fetchArrivalForStop(cityCode, toStopId);

            return $q.all([pFrom, pTo]).then(function (arr) {
                if (saveToDb && (myToken !== collectToken || !$scope.collecting)) {
                    console.warn('[collectOnce] canceled by stopCollect (before compute)');
                    return;
                }

                const fromList = arr[0] || [];
                const toList = arr[1] || [];

                // ✅🔥 FIX: 출발/도착 이름 fallback 보강
                // collectFromSelected(선택객체) → collect.from(정류장 객체) → collect.fromStopName(문자열)
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

                // ✅ 1) 공통 노선(= “이동 소요시간 의미” 유지 가능) → API 값만 저장
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
                        mode: bestCommon.mode,
                        note: '공통노선(API) 기준',
                    });
                }

                // ✅ 2) 공통 노선이 없어도 저장: 각 정류장 최단 도착 1개씩 (API ONLY)
                const bestFrom = pickBestArrivalItem(fromList);
                const bestTo = pickBestArrivalItem(toList);

                if (!bestFrom || !bestTo) {
                    setCollectStatus('error', 'API 도착정보에서 routeId/routeNo/arrtime을 충분히 얻지 못해 저장할 수 없습니다.');
                    return;
                }

                const fromArrSec = bestFrom.sec;
                const toArrSec = bestTo.sec;

                // diffSec는 참고용(두 도착시간 차이)
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
            });

            // ---------------------------------------------------------
            // ✅ DB 저장/화면 반영 (API ONLY 공통 처리)
            // ---------------------------------------------------------
            function saveApiOnlyResult(saveToDbArg, myTokenArg, obj) {
                const routeId = String(obj.routeId || '').trim();
                const routeNo = String(obj.routeNo || '').trim();

                // ✅ 추정 금지: routeId/routeNo 없으면 저장하지 않음
                if (!routeId || !routeNo) {
                    setCollectStatus('error', 'routeId/routeNo를 API에서 얻지 못해 저장을 중단했습니다.');
                    return;
                }

                const diffSec = Math.max(0, Math.floor(Number(obj.diffSec) || 0));

                $scope.collect.routeId = routeId;
                $scope.collect.routeNo = routeNo;

                $scope.collectLast = {
                    cityCode: obj.cityCode,
                    routeId: routeId,
                    routeNo: routeNo,
                    fromStopId: obj.fromStopId,
                    toStopId: obj.toStopId,
                    fromStopName: obj.fromStopName,
                    toStopName: obj.toStopName,
                    fromArrSec: obj.fromArrSec,
                    toArrSec: obj.toArrSec,
                    diffSec: diffSec,
                    pretty: formatEta(diffSec),
                    collectedAt: new Date(),
                    mode: obj.mode,
                    note: obj.note || '',
                    toRouteId: obj.toRouteId,
                    toRouteNo: obj.toRouteNo,
                };

                if (!saveToDbArg) {
                    setCollectStatus('ok', '수집 완료(API ONLY): ' + $scope.collectLast.pretty);
                    return;
                }

                if (myTokenArg !== collectToken || !$scope.collecting) {
                    console.warn('[collectOnce] canceled by stopCollect (before save)');
                    return;
                }

                if ($scope.collect._saving) {
                    console.warn('[collectOnce] skip: saving in progress');
                    return;
                }
                $scope.collect._saving = true;

                const dedupeKey = [obj.cityCode, routeId, obj.fromStopId, obj.toStopId, obj.fromArrSec, obj.toArrSec, diffSec, obj.mode, obj.toRouteId || '', obj.toRouteNo || ''].join('|');

                const payload = {
                    cityCode: Number(obj.cityCode),
                    routeId: routeId,
                    routeNo: routeNo,
                    fromStopId: obj.fromStopId,
                    toStopId: obj.toStopId,
                    fromStopName: obj.fromStopName,
                    toStopName: obj.toStopName,
                    fromArrSec: obj.fromArrSec,
                    toArrSec: obj.toArrSec,
                    diffSec: diffSec,
                    mode: obj.mode,
                    collectedAt: new Date().toISOString(),
                    dedupeKey: dedupeKey,

                    // 확장 필드(백엔드가 지원하면 저장)
                    toRouteId: obj.toRouteId,
                    toRouteNo: obj.toRouteNo,
                    note: obj.note || '',
                };

                return $http
                    .post('/api/buscollect/save', payload)
                    .then(function (res) {
                        const data = res.data || {};
                        if (data.saved === false) setCollectStatus('ok', '⏭ 중복이라 저장 안 함(API ONLY): ' + $scope.collectLast.pretty);
                        else setCollectStatus('ok', '✅ 저장 완료(API ONLY): ' + $scope.collectLast.pretty);
                    })
                    .catch(function (err) {
                        console.error('[collectOnce] DB save fail', err);
                        setCollectStatus('error', 'DB 저장 실패');
                    })
                    .finally(function () {
                        $scope.collect._saving = false;
                    });
            }
        };

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

        // ✅ 거리(m)
        function distanceMeters(lon1, lat1, lon2, lat2) {
            const R = 6371000;
            const toRad = (d) => (d * Math.PI) / 180;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
                    color: isTram ? 'rgba(236, 72, 153, 0.95)' : '#2563eb', // TRAM=핑크 / 그 외=파랑
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
                map.addLayer(pathVectorLayer);
            } else {
                pathVectorLayer.setStyle(STYLE);
                pathVectorLayer.setZIndex(14);
            }
            return true;
        }

        // =========================================================
        // ✅ MIXED 레이어 3개: BUS(파랑) / TRAM(핑크) / WALK(검정 점선)
        // =========================================================
        function ensureMixedLayers() {
            const map = getInnerOlMap();
            if (!map || !window.ol || !ol.layer || !ol.source || !ol.geom || !ol.style) return false;

            // BUS
            if (!mixedBusSource) mixedBusSource = new ol.source.Vector();
            const BUS_STYLE = new ol.style.Style({
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
                    zIndex: 14,
                });
                map.addLayer(mixedBusLayer);
            } else {
                mixedBusLayer.setStyle(BUS_STYLE);
                mixedBusLayer.setZIndex(14);
            }

            // TRAM
            if (!mixedTramSource) mixedTramSource = new ol.source.Vector();
            const TRAM_STYLE = new ol.style.Style({
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
                    zIndex: 15,
                });
                map.addLayer(mixedTramLayer);
            } else {
                mixedTramLayer.setStyle(TRAM_STYLE);
                mixedTramLayer.setZIndex(15);
            }

            // WALK (검정 점선)
            if (!mixedWalkSource) mixedWalkSource = new ol.source.Vector();
            const WALK_STYLE = new ol.style.Style({
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
                    zIndex: 16,
                });
                map.addLayer(mixedWalkLayer);
            } else {
                mixedWalkLayer.setStyle(WALK_STYLE);
                mixedWalkLayer.setZIndex(16);
            }

            return true;
        }

        // =========================================================
        // ✅ PATH만 clear (단일 + MIXED 모두 정리)
        // =========================================================
        function clearPathOnMap() {
            if (pathVectorSource) pathVectorSource.clear(true);

            if (mixedBusSource) mixedBusSource.clear(true);
            if (mixedTramSource) mixedTramSource.clear(true);
            if (mixedWalkSource) mixedWalkSource.clear(true);

            $scope.pathPolylineFeature = null;
            $scope.pathPolylineExtent = null;
            $scope.pathPolylineReady = false;
        }

        // =========================================================
        // ✅ 단일 모드 polyline 그리기 (기존 유지)
        // =========================================================
        function drawPathPolylineLonLat(polyLonLat, mode) {
            const map = getInnerOlMap();
            if (!map) return false;

            const m = String(mode || '').toUpperCase();

            // ✅ MIXED는 여기서 그리지 말고 drawMixedSegmentsFromResult()를 쓰자
            if (m === 'MIXED') return false;

            if (!ensurePathLayer(m)) return false;
            if (!pathVectorSource) return false;

            pathVectorSource.clear(true);
            if (!Array.isArray(polyLonLat) || polyLonLat.length < 2) return false;

            const projected = polyLonLat
                .map(function (xy) {
                    const lon = Number(xy && xy[0]);
                    const lat = Number(xy && xy[1]);
                    return lonLatToMapXY(lon, lat);
                })
                .filter(Boolean);

            if (projected.length < 2) return false;

            const line = new ol.geom.LineString(projected);
            const feature = new ol.Feature({ geometry: line });

            // ✅ 선 색 고정
            const isTram = m === 'TRAM';
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

            pathVectorSource.addFeature(feature);

            $scope.pathPolylineFeature = feature;
            $scope.pathPolylineExtent = line.getExtent();
            $scope.pathPolylineReady = true;

            if (map.renderSync) map.renderSync();
            return true;
        }

        // =========================================================
        // ✅ MIXED 전용: BUS/TRAM/WALK 구간별로 그리기
        // r.path(구간 정보) + r.stops(좌표) 를 이용
        // =========================================================
        function pickModeUpper(x) {
            return String((x && (x.mode ?? x.kind ?? x.type ?? x.vehicle ?? x.edgeType ?? x.transitType ?? '')) || '')
                .trim()
                .toUpperCase();
        }

        function buildStopCoordMapFromResult(r) {
            const m = {};

            // r.stops에서 stopId -> [lon,lat]
            if (Array.isArray(r && r.stops)) {
                r.stops.forEach(function (s) {
                    const id = String(s && (s.stopId ?? s.nodeId ?? s.nodeid ?? '')).trim();
                    const lon = Number(s && (s.lon ?? s.gpslong ?? s.gpsLong));
                    const lat = Number(s && (s.lat ?? s.gpslati ?? s.gpsLat));
                    if (id && isFinite(lon) && isFinite(lat)) m[id] = [lon, lat];
                });
            }

            return m;
        }

        function addSegmentToSource(vectorSource, A, B) {
            if (!vectorSource) return false;
            if (!A || !B) return false;

            const a = lonLatToMapXY(Number(A[0]), Number(A[1]));
            const b = lonLatToMapXY(Number(B[0]), Number(B[1]));
            if (!a || !b) return false;

            const line = new ol.geom.LineString([a, b]);
            vectorSource.addFeature(new ol.Feature({ geometry: line }));
            return true;
        }

        /**
         * ✅ MIXED 구간 렌더
         * - BUS: mixedBusSource
         * - TRAM: mixedTramSource
         * - 그 외/빈환승: mixedWalkSource
         *
         * r.path가 이런 형태면 제일 잘 됨:
         *   [{mode:'BUS', from:'...', to:'...'}, {mode:'WALK', from:'...', to:'...'}, {mode:'TRAM', from:'...', to:'...'}]
         */
        function drawMixedSegmentsFromResult(r) {
            const map = getInnerOlMap();
            if (!map) return false;
            if (!ensureMixedLayers()) return false;

            // 단일 경로 레이어는 지워서 겹침 방지
            if (pathVectorSource) pathVectorSource.clear(true);

            // MIXED 레이어 초기화
            if (mixedBusSource) mixedBusSource.clear(true);
            if (mixedTramSource) mixedTramSource.clear(true);
            if (mixedWalkSource) mixedWalkSource.clear(true);

            // ─────────────────────────────────────────
            // 0) 좌표 맵 구성(중요)
            //    buildStopCoordMapFromResult(r)가 TRAM 좌표를 못 담는 경우가 많아서
            //    여기서 "강제로 보강"한다.
            // ─────────────────────────────────────────
            const stopCoord = buildStopCoordMapFromResult(r) || {};

            // (A) r.stops가 있으면 최우선 보강 (stopId/lat/lon)
            if (Array.isArray(r && r.stops)) {
                r.stops.forEach(function (s) {
                    const id = String((s && (s.stopId ?? s.id ?? s.nodeId ?? '')) || '').trim();
                    const lat = Number(s && (s.lat ?? s.latitude));
                    const lon = Number(s && (s.lon ?? s.lng ?? s.longitude));
                    if (!id) return;
                    if (!isFinite(lat) || !isFinite(lon)) return;
                    stopCoord[id] = [lon, lat]; // ✅ [lon,lat]
                });
            }

            // (B) r.polyline 만 있는 경우 대비: stopIds 순서와 매칭
            // - stopIds 길이와 polyline 길이가 같으면 같은 인덱스로 매칭 가능
            if (Array.isArray(r && r.stopIds) && Array.isArray(r && r.polyline) && r.stopIds.length === r.polyline.length) {
                for (let i = 0; i < r.stopIds.length; i++) {
                    const id = String(r.stopIds[i] || '').trim();
                    const p = r.polyline[i] || {};
                    // 서버 Point가 (lat,lon)인 네 DTO 기준
                    const lat = Number(p.lat);
                    const lon = Number(p.lon);
                    if (!id) continue;
                    if (!isFinite(lat) || !isFinite(lon)) continue;
                    if (!stopCoord[id]) stopCoord[id] = [lon, lat];
                }
            }

            // (C) TRAM_STOPS(전역 JS)로도 보강 (DB에 트램 stops가 없는 경우)
            // - 너가 window.TRAM_STOPS를 갖고 있는 구조라면 이게 가장 강력함
            if (window.TRAM_STOPS && Array.isArray(window.TRAM_STOPS)) {
                window.TRAM_STOPS.forEach(function (t) {
                    const id = String((t && (t.stopId ?? t.id ?? '')) || '').trim();
                    // 너 트램은 lng를 쓰고 있음
                    const lat = Number(t && t.lat);
                    const lon = Number(t && (t.lon ?? t.lng));
                    if (!id) return;
                    if (!isFinite(lat) || !isFinite(lon)) return;
                    if (!stopCoord[id]) stopCoord[id] = [lon, lat];
                });
            }

            // ─────────────────────────────────────────
            // pathArr 확보
            // ─────────────────────────────────────────
            const pathArr = Array.isArray(r && r.path) ? r.path : [];
            if (!pathArr.length) return false;

            // ─────────────────────────────────────────
            // 안전 추출 유틸 (서버 필드명 변형 흡수)
            // ─────────────────────────────────────────
            function getFromId(seg) {
                return String((seg && (seg.from ?? seg.fromStopId ?? seg.a ?? seg.start ?? seg.u ?? '')) || '').trim();
            }
            function getToId(seg) {
                return String((seg && (seg.to ?? seg.toStopId ?? seg.b ?? seg.end ?? seg.v ?? '')) || '').trim();
            }
            function getAtId(seg) {
                return String((seg && (seg.at ?? seg.nodeId ?? seg.stopId ?? seg.id ?? '')) || '').trim();
            }

            // ─────────────────────────────────────────
            // 좌표 가져오기 + (필요시) EPSG 변환
            // stopCoord는 [lon,lat] (EPSG:4326) 기준
            // ─────────────────────────────────────────
            function toMapXY(lonLat) {
                // lonLat: [lon,lat]
                const view = map.getView && map.getView();
                const proj = (view && view.getProjection && view.getProjection()) || null;
                if (proj && window.ol && ol.proj && ol.proj.transform) {
                    // map projection으로 변환
                    return ol.proj.transform([lonLat[0], lonLat[1]], 'EPSG:4326', proj);
                }
                return lonLat;
            }

            function coordOf(id) {
                const c = stopCoord[String(id || '').trim()];
                if (!c) return null;
                // c is [lon,lat]
                if (!isFinite(Number(c[0])) || !isFinite(Number(c[1]))) return null;
                return c;
            }

            // ─────────────────────────────────────────
            // 1) pathArr 구간 그대로 그림
            //    - at-only도 "이전 앵커 -> at"으로 연결선을 만든다(끊김 방지)
            // ─────────────────────────────────────────
            let prevAnchorId = null;

            for (let i = 0; i < pathArr.length; i++) {
                const e = pathArr[i];
                const mode = (pickModeUpper(e) || 'WALK').toUpperCase();

                let fromId = getFromId(e);
                let toId = getToId(e);
                const atId = getAtId(e);

                // ✅ 1) at-only: 이전 앵커가 있으면 prevAnchor -> at 선을 그려주고 anchor 갱신
                if ((!fromId || !toId) && atId) {
                    if (prevAnchorId && prevAnchorId !== atId) {
                        const A0 = coordOf(prevAnchorId);
                        const B0 = coordOf(atId);
                        if (A0 && B0) {
                            // at-only는 기본 WALK로 처리(환승/연결)
                            addSegmentToSource(mixedWalkSource, toMapXY(A0), toMapXY(B0));
                        }
                    }
                    prevAnchorId = atId;
                    continue;
                }

                // ✅ 2) from/to가 하나라도 비면 anchor로 보정
                if (!fromId && prevAnchorId) fromId = prevAnchorId;
                if (!toId && prevAnchorId) toId = prevAnchorId;

                if (!fromId || !toId) continue;

                const A = coordOf(fromId);
                const B = coordOf(toId);

                if (!A || !B) {
                    // 좌표 못 찾으면 anchor만 갱신하고 넘어감
                    prevAnchorId = toId || fromId || prevAnchorId;
                    continue;
                }

                const AX = toMapXY(A);
                const BX = toMapXY(B);

                if (mode === 'BUS') addSegmentToSource(mixedBusSource, AX, BX);
                else if (mode === 'TRAM') addSegmentToSource(mixedTramSource, AX, BX);
                else addSegmentToSource(mixedWalkSource, AX, BX); // WALK/TRANSFER/UNKNOWN

                prevAnchorId = toId;
            }

            // ─────────────────────────────────────────
            // 2) “빈 환승 구간” 자동 보강
            //    - 모드가 바뀌는데 prev.to != cur.from 이면 WALK 점선 추가
            //    - 너무 가까우면(5m 미만) 생략
            // ─────────────────────────────────────────
            for (let i = 1; i < pathArr.length; i++) {
                const prev = pathArr[i - 1];
                const cur = pathArr[i];

                const pm = (pickModeUpper(prev) || '').toUpperCase();
                const cm = (pickModeUpper(cur) || '').toUpperCase();

                if (!pm || !cm) continue;
                if (pm === cm) continue;

                const prevTo = getToId(prev) || getAtId(prev);
                const curFrom = getFromId(cur) || getAtId(cur);

                if (!prevTo || !curFrom) continue;
                if (prevTo === curFrom) continue;

                const A = coordOf(prevTo);
                const B = coordOf(curFrom);
                if (!A || !B) continue;

                const d = distanceMeters(A[0], A[1], B[0], B[1]); // [lon,lat]
                if (isFinite(d) && d < 5) continue;

                addSegmentToSource(mixedWalkSource, toMapXY(A), toMapXY(B));
            }

            if (map.renderSync) map.renderSync();
            return true;
        }

        // =========================================================
        // ✅ STOPS (정류장 마커) 레이어
        // =========================================================
        let stopsVectorSource = null;
        let stopsVectorLayer = null;

        function ensureStopsLayer() {
            const map = getInnerOlMap();
            if (!map || !window.ol) return false;

            if (!stopsVectorSource) stopsVectorSource = new ol.source.Vector();

            if (!stopsVectorLayer) {
                stopsVectorLayer = new ol.layer.Vector({
                    source: stopsVectorSource,
                    zIndex: 15,
                });
                map.addLayer(stopsVectorLayer);
            }
            return true;
        }

        function clearStopsOnMap() {
            if (stopsVectorSource) stopsVectorSource.clear(true);
        }

        function drawStopMarker(lon, lat, color, label, kind) {
            if (!ensureStopsLayer()) return;

            const xy = lonLatToMapXY(lon, lat);
            if (!xy) return;

            const f = new ol.Feature({ geometry: new ol.geom.Point(xy) });

            const isEnd = kind === 'FROM' || kind === 'TO';
            const radius = isEnd ? 9 : 6;

            f.setStyle(
                new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: radius,
                        fill: new ol.style.Fill({ color }),
                        stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                    }),
                    text: label
                        ? new ol.style.Text({
                              text: label,
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

            stopsVectorSource.addFeature(f);
        }

        function drawStopsFromServer(stops, fromStopId, toStopId) {
            clearStopsOnMap();
            if (!Array.isArray(stops) || stops.length === 0) return;

            const fromId = String(fromStopId || '').trim();
            const toId = String(toStopId || '').trim();

            for (let i = 0; i < stops.length; i++) {
                const s = stops[i] || {};
                const stopId = String(s.stopId || '').trim();
                const name = String(s.name || '').trim();
                const lat = Number(s.lat);
                const lon = Number(s.lon);
                if (!isFinite(lat) || !isFinite(lon)) continue;

                let kind = 'MID';
                if (stopId && fromId && stopId === fromId) kind = 'FROM';
                else if (stopId && toId && stopId === toId) kind = 'TO';
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

                drawStopMarker(lon, lat, color, label, kind);
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
                map.addLayer(walkVectorLayer);
            } else {
                // 꼬임 방지: source/style 강제
                if (walkVectorLayer.getSource && walkVectorLayer.getSource() !== walkVectorSource) {
                    walkVectorLayer.setSource(walkVectorSource);
                }
                walkVectorLayer.setStyle(WALK_STYLE);
            }

            // ✅ 최상단
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

            // ✅ 서버 enum(ShortestPathService.Mode)에 맞추기
            // - 네 서버 enum: BUS, TRAM, BUS_TRAM, MIXED(추가했었음)
            // - 그런데 프론트 UI에 MIXED가 와도 내부에서 BUS_TRAM로 처리하는게 안전
            //   (서버가 MIXED도 받게 해놨으면 그대로 보내도 됨)
            let mode = rawMode;
            if (mode === 'MIXED') mode = 'BUS_TRAM'; // ✅ 가장 안전 (서버가 MIXED만 받는 경우는 거의 없음)
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
            // ✅ 서버 shortest(cityCode, fromStopId, toStopId, mode, weight) 형태면 stopId가 핵심
            // ✅ 혹시 서버가 fromNodeId/toNodeId로 받는 코드도 있을 수 있으니 같이 보냄
            if (p.fromStopId && !p.fromNodeId) p.fromNodeId = p.fromStopId;
            if (p.toStopId && !p.toNodeId) p.toNodeId = p.toStopId;

            // ----------------------------
            // 3) 타입 힌트(선택)
            // ----------------------------
            // 트램이 숫자 ID(242/243/244...)인 경우에만 의미 있음
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

                    // ✅ found=false면 실패로 처리해서 catch로 보내기
                    if (data.found === false) {
                        const msg = data.message || data.error || '경로를 찾지 못했습니다.';
                        return $q.reject(new Error(msg));
                    }

                    // ✅ 서버/프론트 필드명 혼용 흡수
                    const dist = Number(data.totalDistM ?? data.totalDistanceM ?? data.totalDist ?? data.totalDistance ?? 0);

                    const time = Number(
                        data.totalTimeS ?? // ✅ 네 백엔드 필드
                            data.totalTimeSec ?? // 예전 프론트 기대값
                            data.totalTimeSeconds ??
                            data.totalTime ??
                            0
                    );

                    // ✅ 둘 다 숫자 아니면 응답 형식 문제
                    if (!isFinite(dist) && !isFinite(time)) {
                        const msg = data.message || data.error || '최단경로 응답 형식이 올바르지 않습니다.';
                        return $q.reject(new Error(msg));
                    }

                    // ✅ 프론트 표준 필드로 강제 보강 (버튼 잠김/표시 0 문제 방지)
                    data.totalDistM = isFinite(dist) ? dist : Number(data.totalDistM || 0);
                    data.totalTimeS = isFinite(time) ? time : Number(data.totalTimeS || 0);

                    // ✅ 혹시 프론트 다른 코드가 totalTimeSec을 읽는 경우까지 대비(옵션)
                    data.totalTimeSec = data.totalTimeS;

                    res.data = data;
                    return res; // ✅ 반드시 res 반환 (호출부가 res.data를 기대)
                })
                .catch(function (err) {
                    // ✅ 서버 에러 응답에서 메시지 최대한 추출
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

                    // 양방향 연결
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
        // ✅✅✅ [REAL] findShortestPath: 데모 하드코딩 제거 → API 호출
        // =========================================================
        $scope.findShortestPath = function () {
            // ✅ 서버 필드명 변형 흡수 + fallback 계산용 헬퍼들
            function pickTransfersCount(r) {
                const v = (r && (r.transfersCount ?? r.transferCount ?? r.transferCnt ?? r.transCnt ?? r.transfers ?? r.transfer)) ?? 0;
                const n = Number(v);
                return isFinite(n) ? n : 0;
            }

            function computeTransfersFromPath(pathArr) {
                if (!Array.isArray(pathArr) || pathArr.length < 2) return 0;

                function pickMode(x) {
                    return String((x && (x.mode ?? x.kind ?? x.type ?? x.vehicle ?? x.edgeType ?? x.transitType ?? '')) || '').toUpperCase();
                }

                let prev = pickMode(pathArr[0]);
                let transfers = 0;

                for (let i = 1; i < pathArr.length; i++) {
                    const cur = pickMode(pathArr[i]);
                    if (cur && prev && cur !== prev) transfers++;
                    if (cur) prev = cur;
                }
                return transfers;
            }

            // ✅ 두 좌표(lon/lat) 사이 거리(m)
            function distanceMeters(lon1, lat1, lon2, lat2) {
                const R = 6371000;
                const toRad = (d) => (d * Math.PI) / 180;
                const dLat = toRad(lat2 - lat1);
                const dLon = toRad(lon2 - lon1);
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            // ✅ 도보시간 계산용 m/s
            const WALK_SPEED_MPS = 1.25;

            // ✅ TRAM 속도(m/s) - 필요하면 조절
            const TRAM_SPEED_MPS = 6.94; // 약 25km/h

            // =========================================================
            // ✅ TRAM 전용: "노선 순서" 기반 그래프 (TRAM_ROUTE_FULL_HD) + 다익스트라
            // =========================================================
            function pickStopId(s) {
                return String(s && (s.stopId ?? s.stop_id ?? s.nodeid ?? s.nodeId ?? s.id ?? '')).trim();
            }
            function pickStopName(s) {
                return String(s && (s.name ?? s.nodenm ?? s.nodeNm ?? '')).trim();
            }
            function pickLonLat(s) {
                const lon = Number(s && (s.lon ?? s.gpslong ?? s.gpsLong ?? s.lng));
                const lat = Number(s && (s.lat ?? s.gpslati ?? s.gpsLat));
                if (!isFinite(lon) || !isFinite(lat)) return null;
                return [lon, lat];
            }

            // ✅ stopId -> {lon,lat,name} 맵 만들기 (TRAM_STOPS + TRAM_ROUTE_FULL_HD로 보강)
            function buildTramStopInfoMap() {
                const m = {};

                // 1) TRAM_STOPS 우선
                const arr = window.TRAM_STOPS || window.tramStops || [];
                if (Array.isArray(arr)) {
                    arr.forEach(function (s) {
                        const id = pickStopId(s);
                        const ll = pickLonLat(s);
                        const name = pickStopName(s);
                        if (id && ll) {
                            m[id] = { id: id, lon: ll[0], lat: ll[1], name: name || id };
                        }
                    });
                }

                // 2) TRAM_ROUTE_FULL_HD로 보강
                const raw = window.TRAM_ROUTE_FULL_HD || [];
                if (Array.isArray(raw)) {
                    raw.forEach(function (p) {
                        if (!p || p.type !== 'station') return;
                        const id = String(p.id ?? p.stopId ?? '').trim();
                        if (!id) return;

                        const lon = Number(p.lon ?? p.lng);
                        const lat = Number(p.lat);
                        const name = String(p.name || '').trim();

                        if ((!m[id] || !isFinite(m[id].lon) || !isFinite(m[id].lat)) && isFinite(lon) && isFinite(lat)) {
                            m[id] = { id: id, lon: lon, lat: lat, name: name || id };
                        }
                    });
                }

                return m;
            }

            // ✅ TRAM_ROUTE_FULL_HD에서 station id 순서 뽑기 (중복 제거)
            function getTramStationSequence() {
                const raw = window.TRAM_ROUTE_FULL_HD || [];
                const seq = [];
                if (!Array.isArray(raw)) return seq;

                for (let i = 0; i < raw.length; i++) {
                    const p = raw[i];
                    if (!p || p.type !== 'station') continue;
                    const id = String(p.id ?? p.stopId ?? '').trim();
                    if (!id) continue;
                    if (seq.length && seq[seq.length - 1] === id) continue;
                    seq.push(id);
                }
                return seq;
            }

            // ✅ 노선 순서 기반 그래프 만들기(양방향)
            function buildTramGraphFromRoute() {
                const stopMap = buildTramStopInfoMap();
                const seq = getTramStationSequence();
                const graph = {}; // id -> [{to, distM, timeS}]

                function addEdge(a, b, distM, timeS) {
                    if (!graph[a]) graph[a] = [];
                    graph[a].push({ to: b, distM: distM, timeS: timeS });
                }

                if (seq.length < 2) return { graph: graph, stopMap: stopMap, seq: seq };

                for (let i = 0; i < seq.length - 1; i++) {
                    const aId = seq[i];
                    const bId = seq[i + 1];
                    const A = stopMap[aId];
                    const B = stopMap[bId];
                    if (!A || !B) continue;

                    const distM = distanceMeters(A.lon, A.lat, B.lon, B.lat);
                    const timeS = Math.max(1, Math.round(distM / TRAM_SPEED_MPS));

                    addEdge(aId, bId, distM, timeS);
                    addEdge(bId, aId, distM, timeS);
                }

                return { graph: graph, stopMap: stopMap, seq: seq };
            }

            function dijkstra(graph, startId, endId, weightKey /* 'DIST'|'TIME' */) {
                const dist = {};
                const prev = {};
                const visited = {};
                const pq = [];

                function costOfEdge(e) {
                    return weightKey === 'TIME' ? Number(e.timeS || 0) : Number(e.distM || 0);
                }

                dist[startId] = 0;
                pq.push({ id: startId, d: 0 });

                while (pq.length) {
                    pq.sort((a, b) => a.d - b.d);
                    const cur = pq.shift();
                    const u = cur.id;
                    if (visited[u]) continue;
                    visited[u] = true;

                    if (u === endId) break;

                    const edges = graph[u] || [];
                    for (let i = 0; i < edges.length; i++) {
                        const e = edges[i];
                        const v = e && e.to;
                        if (!v) continue;

                        const nd = (dist[u] || 0) + costOfEdge(e);
                        if (dist[v] == null || nd < dist[v]) {
                            dist[v] = nd;
                            prev[v] = { from: u, edge: e };
                            pq.push({ id: v, d: nd });
                        }
                    }
                }

                if (dist[endId] == null) return null;

                const nodes = [];
                let cur = endId;
                nodes.push(cur);
                while (cur !== startId) {
                    const p = prev[cur];
                    if (!p) break;
                    cur = p.from;
                    nodes.push(cur);
                }
                nodes.reverse();

                return { nodes: nodes, prev: prev };
            }

            function buildTramResponse(fromId, toId, weightKey) {
                const built = buildTramGraphFromRoute();
                const graph = built.graph || {};
                const stopMap = built.stopMap || {};
                const seq = built.seq || [];

                if (!seq.length) {
                    return { found: false, message: 'TRAM_ROUTE_FULL_HD(station 순서) 데이터가 없습니다. tram-data.js 확인 필요' };
                }

                if (!stopMap[fromId] || !stopMap[toId]) {
                    return { found: false, message: '트램 출발/도착 stopId가 stopMap(TRAM_STOPS/TRAM_ROUTE_FULL_HD)에 없습니다. (ID 확인 필요)' };
                }

                const res = dijkstra(graph, fromId, toId, weightKey);
                if (!res || !Array.isArray(res.nodes) || res.nodes.length < 2) {
                    return { found: false, message: '경로를 찾지 못했습니다. (트램 엣지 연결 부족 / 노선 순서 확인 필요)' };
                }

                let totalDistM = 0;
                let totalTimeS = 0;
                const polyline = [];
                const stops = [];
                const path = [];

                for (let i = 0; i < res.nodes.length; i++) {
                    const id = res.nodes[i];
                    const s = stopMap[id];

                    if (s && isFinite(s.lon) && isFinite(s.lat)) {
                        polyline.push({ lon: s.lon, lat: s.lat });
                    }

                    stops.push({
                        stopId: id,
                        nodeId: id,
                        name: s ? s.name || id : id,
                        nodenm: s ? s.name || id : id,
                        lon: s ? s.lon : undefined,
                        lat: s ? s.lat : undefined,
                    });

                    if (i > 0) {
                        const p = res.prev[id];
                        if (p && p.edge) {
                            totalDistM += Number(p.edge.distM || 0);
                            totalTimeS += Number(p.edge.timeS || 0);
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

            // =========================================================
            // ✅ MIXED 모드: r.path + r.stops 기반으로 (BUS=파랑, TRAM=핑크, WALK=검정 점선)
            // - drawMixedSegmentsFromResult(r)가 "전역"에 이미 있다고 가정
            //   (네가 전에 넣은 MIXED 레이어/함수 세트)
            // =========================================================

            try {
                $scope.pathResult = null;

                // ✅ 지도 싹 초기화
                clearPathOnMap();
                if (typeof clearStopsOnMap === 'function') clearStopsOnMap();
                if (typeof clearWalkOnMap === 'function') clearWalkOnMap();

                // ✅ 선택이 raw로 들어왔을 가능성 방어
                if ($scope.path.from && !$scope.path.from.stopId) $scope.path.from = normalizeStop($scope.path.from);
                if ($scope.path.to && !$scope.path.to.stopId) $scope.path.to = normalizeStop($scope.path.to);

                if (!$scope.path.from || !$scope.path.to) {
                    return setPathStatus('error', '출발/도착을 각각 선택해야 합니다.');
                }

                if (!$scope.path.fromNodeId) $scope.path.fromNodeId = String($scope.path.from.stopId || '').trim();
                if (!$scope.path.toNodeId) $scope.path.toNodeId = String($scope.path.to.stopId || '').trim();

                if (!($scope.path.fromNodeId && $scope.path.toNodeId)) {
                    return setPathStatus('error', '출발/도착 nodeId가 비어있습니다. 후보를 다시 선택해 주세요.');
                }

                $scope.pathLoading = true;
                setPathStatus('info', '최단경로 계산 중...(실제 계산)');

                const params = {
                    cityCode: CITY_CODE,
                    fromStopId: $scope.path.fromNodeId,
                    toStopId: $scope.path.toNodeId,
                    mode: $scope.path.mode || 'MIXED', // BUS | TRAM | MIXED
                    weight: $scope.path.weight || 'DIST', // DIST | TIME
                };

                // ✅ TRAM이면 프론트 계산(buildTramResponse), BUS/MIXED는 서버 호출
                const promise = String(params.mode).toUpperCase() === 'TRAM' ? $q.when({ data: buildTramResponse(params.fromStopId, params.toStopId, params.weight) }) : fetchShortestPathReal(params);

                return promise
                    .then(function (res) {
                        const r = res && res.data ? res.data : res || {};
                        console.log('[shortestPath raw]', r);

                        // ✅✅✅ [핵심] 최종 모드 결정 (서버 응답 mode 우선, 없으면 params.mode)
                        const modeUpper = String((r && (r.mode ?? r.kind ?? r.type)) || params.mode || '').toUpperCase();
                        const isMixed = modeUpper === 'MIXED';

                        // ✅ 실패 처리
                        if (r.found === false) {
                            clearPathOnMap();
                            if (typeof clearStopsOnMap === 'function') clearStopsOnMap();
                            if (typeof clearWalkOnMap === 'function') clearWalkOnMap();

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
                            return setPathStatus('error', r.message || '경로를 찾지 못했습니다.');
                        }

                        const stopIds = Array.isArray(r.stopIds) ? r.stopIds : [];
                        const pathArr = Array.isArray(r.path) ? r.path : [];

                        const serverTransfers = pickTransfersCount(r);
                        const computedTransfers = computeTransfersFromPath(pathArr);
                        const finalTransfers = (serverTransfers > 0 ? serverTransfers : computedTransfers) || 0;

                        // ✅ polyline 좌표 준비 (단일 BUS/TRAM에서 사용)
                        let coordsLonLat = [];
                        if (Array.isArray(r.polyline) && r.polyline.length >= 2) {
                            coordsLonLat = r.polyline
                                .map(function (p) {
                                    const lon = Number(p.lon);
                                    const lat = Number(p.lat);
                                    return [lon, lat];
                                })
                                .filter(function (c) {
                                    return isFinite(c[0]) && isFinite(c[1]);
                                });
                        }

                        // ✅ 도보시간 계산 (출발->첫점, 마지막점->도착)
                        let walkDistM = 0;
                        let walkTimeS = 0;

                        (function computeWalkFromEnds() {
                            if (!Array.isArray(coordsLonLat) || coordsLonLat.length < 2) {
                                walkDistM = 0;
                                walkTimeS = 0;
                                return;
                            }

                            const first = coordsLonLat[0];
                            const last = coordsLonLat[coordsLonLat.length - 1];

                            let fLon, fLat, tLon, tLat;

                            if (Array.isArray(r.stops) && r.stops.length >= 2) {
                                const s0 = r.stops[0];
                                const sN = r.stops[r.stops.length - 1];
                                fLon = Number(s0 && (s0.lon ?? s0.gpslong ?? s0.gpsLong));
                                fLat = Number(s0 && (s0.lat ?? s0.gpslati ?? s0.gpsLat));
                                tLon = Number(sN && (sN.lon ?? sN.gpslong ?? sN.gpsLong));
                                tLat = Number(sN && (sN.lat ?? sN.gpslati ?? sN.gpsLat));
                            } else {
                                fLat = Number($scope.path.from.gpslati || $scope.path.from.gpsLat || $scope.path.from.lat);
                                fLon = Number($scope.path.from.gpslong || $scope.path.from.gpsLong || $scope.path.from.lon);
                                tLat = Number($scope.path.to.gpslati || $scope.path.to.gpsLat || $scope.path.to.lat);
                                tLon = Number($scope.path.to.gpslong || $scope.path.to.gpsLong || $scope.path.to.lon);
                            }

                            if (isFinite(fLon) && isFinite(fLat) && first && isFinite(first[0]) && isFinite(first[1])) {
                                const d1 = distanceMeters(fLon, fLat, first[0], first[1]);
                                if (d1 >= 5) walkDistM += d1;
                            }

                            if (isFinite(tLon) && isFinite(tLat) && last && isFinite(last[0]) && isFinite(last[1])) {
                                const d2 = distanceMeters(last[0], last[1], tLon, tLat);
                                if (d2 >= 5) walkDistM += d2;
                            }

                            if (walkDistM > 0 && WALK_SPEED_MPS > 0) {
                                walkTimeS = Math.round(walkDistM / WALK_SPEED_MPS);
                            } else {
                                walkTimeS = 0;
                            }
                        })();

                        $scope.pathResult = {
                            found: r.found !== false,
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
                        // - MIXED면: BUS(파랑) + TRAM(핑크) + WALK(점선) 구간별 렌더
                        // - BUS/TRAM 단일이면: drawPathPolylineLonLat(coordsLonLat, modeUpper)
                        // =========================================================
                        let okDraw = false;

                        if (isMixed) {
                            if (typeof drawMixedSegmentsFromResult === 'function') {
                                okDraw = drawMixedSegmentsFromResult(r);
                            } else {
                                okDraw = false;
                                console.warn('[MIXED] drawMixedSegmentsFromResult 함수가 없습니다. MIXED 레이어 코드가 먼저 필요합니다.');
                            }

                            // ✅ MIXED에서도 "출발/도착 ↔ 첫/마지막 점" 도보 점선은 유지(빈공간 보강)
                            // (이미 drawMixedSegmentsFromResult가 처리해도, 이건 UX상 도움 됨)
                            if (typeof drawWalkDashed === 'function' && Array.isArray(r.stops) && r.stops.length >= 2) {
                                const s0 = r.stops[0];
                                const sN = r.stops[r.stops.length - 1];

                                const firstLon = Number(s0 && (s0.lon ?? s0.gpslong ?? s0.gpsLong));
                                const firstLat = Number(s0 && (s0.lat ?? s0.gpslati ?? s0.gpsLat));
                                const lastLon = Number(sN && (sN.lon ?? sN.gpslong ?? sN.gpsLong));
                                const lastLat = Number(sN && (sN.lat ?? sN.gpslati ?? sN.gpsLat));

                                const fLon = Number($scope.path.from.gpslong || $scope.path.from.gpsLong || $scope.path.from.lon);
                                const fLat = Number($scope.path.from.gpslati || $scope.path.from.gpsLat || $scope.path.from.lat);
                                const tLon = Number($scope.path.to.gpslong || $scope.path.to.gpsLong || $scope.path.to.lon);
                                const tLat = Number($scope.path.to.gpslati || $scope.path.to.gpsLat || $scope.path.to.lat);

                                if (isFinite(fLon) && isFinite(fLat) && isFinite(firstLon) && isFinite(firstLat)) {
                                    const d1 = distanceMeters(fLon, fLat, firstLon, firstLat);
                                    if (d1 >= 5)
                                        drawWalkDashed([
                                            [fLon, fLat],
                                            [firstLon, firstLat],
                                        ]);
                                }
                                if (isFinite(tLon) && isFinite(tLat) && isFinite(lastLon) && isFinite(lastLat)) {
                                    const d2 = distanceMeters(lastLon, lastLat, tLon, tLat);
                                    if (d2 >= 5)
                                        drawWalkDashed([
                                            [lastLon, lastLat],
                                            [tLon, tLat],
                                        ]);
                                }
                            }
                        } else {
                            if (Array.isArray(coordsLonLat) && coordsLonLat.length >= 2) {
                                okDraw = typeof drawPathPolylineLonLat === 'function' ? drawPathPolylineLonLat(coordsLonLat, modeUpper) : false;
                            }
                        }

                        if (!okDraw) {
                            setPathStatus('info', '경로 계산은 됐지만 지도에 경로를 그리지 못했습니다. (MIXED는 r.path/r.stops, 단일은 polyline 좌표 확인 필요)');
                        }

                        // =========================================================
                        // ✅ 2) 정류장 마커
                        // =========================================================
                        if (typeof drawStopsFromServer === 'function' && Array.isArray(r.stops) && r.stops.length) {
                            drawStopsFromServer(r.stops, $scope.path.fromNodeId, $scope.path.toNodeId);
                        } else {
                            if (typeof drawStopMarker === 'function') {
                                const fLat = Number($scope.path.from.gpslati || $scope.path.from.gpsLat || $scope.path.from.lat);
                                const fLon = Number($scope.path.from.gpslong || $scope.path.from.gpsLong || $scope.path.from.lon);
                                const tLat = Number($scope.path.to.gpslati || $scope.path.to.gpsLat || $scope.path.to.lat);
                                const tLon = Number($scope.path.to.gpslong || $scope.path.to.gpsLong || $scope.path.to.lon);

                                if (isFinite(fLat) && isFinite(fLon)) drawStopMarker(fLon, fLat, '#ef4444', '출발', 'FROM');
                                if (isFinite(tLat) && isFinite(tLon)) drawStopMarker(tLon, tLat, '#22c55e', '도착', 'TO');
                            }
                        }

                        // =========================================================
                        // ✅ 3) 단일(BUS/TRAM)일 때만 "끝단 도보" 점선
                        // (MIXED는 위에서 drawMixedSegmentsFromResult + 보강 점선 처리)
                        // =========================================================
                        if (!isMixed && typeof drawWalkDashed === 'function' && Array.isArray(coordsLonLat) && coordsLonLat.length >= 2) {
                            const first = coordsLonLat[0];
                            const last = coordsLonLat[coordsLonLat.length - 1];

                            let fLon, fLat, tLon, tLat;

                            if (Array.isArray(r.stops) && r.stops.length >= 2) {
                                const s0 = r.stops[0];
                                const sN = r.stops[r.stops.length - 1];
                                fLon = Number(s0 && s0.lon);
                                fLat = Number(s0 && s0.lat);
                                tLon = Number(sN && sN.lon);
                                tLat = Number(sN && sN.lat);
                            } else {
                                fLat = Number($scope.path.from.gpslati || $scope.path.from.gpsLat || $scope.path.from.lat);
                                fLon = Number($scope.path.from.gpslong || $scope.path.from.gpsLong || $scope.path.from.lon);
                                tLat = Number($scope.path.to.gpslati || $scope.path.to.gpsLat || $scope.path.to.lat);
                                tLon = Number($scope.path.to.gpslong || $scope.path.to.gpsLong || $scope.path.to.lon);
                            }

                            if (isFinite(fLon) && isFinite(fLat) && first && isFinite(first[0]) && isFinite(first[1])) {
                                const d1 = distanceMeters(fLon, fLat, first[0], first[1]);
                                if (d1 >= 5)
                                    drawWalkDashed([
                                        [fLon, fLat],
                                        [first[0], first[1]],
                                    ]);
                            }

                            if (isFinite(tLon) && isFinite(tLat) && last && isFinite(last[0]) && isFinite(last[1])) {
                                const d2 = distanceMeters(last[0], last[1], tLon, tLat);
                                if (d2 >= 5)
                                    drawWalkDashed([
                                        [last[0], last[1]],
                                        [tLon, tLat],
                                    ]);
                            }
                        }

                        const fromName = $scope.path && $scope.path.from && ($scope.path.from.name || $scope.path.from.nodenm || $scope.path.from.nodeNm) ? $scope.path.from.name || $scope.path.from.nodenm || $scope.path.from.nodeNm : '-';
                        const toName = $scope.path && $scope.path.to && ($scope.path.to.name || $scope.path.to.nodenm || $scope.path.to.nodeNm) ? $scope.path.to.name || $scope.path.to.nodenm || $scope.path.to.nodeNm : '-';

                        setPathStatus(
                            'ok',
                            '최단경로 계산 완료: ' +
                                fromName +
                                ' → ' +
                                toName +
                                ' (모드 ' +
                                modeUpper +
                                ', 거리 ' +
                                (($scope.pathResult && $scope.pathResult.totalDistM) || 0) +
                                'm, 시간 ' +
                                (($scope.pathResult && $scope.pathResult.totalTimeS) || 0) +
                                's, 도보 ' +
                                (($scope.pathResult && $scope.pathResult.walkTimeS) || 0) +
                                's, 환승 ' +
                                finalTransfers +
                                '회)'
                        );
                    })
                    .catch(function (err) {
                        console.error('[findShortestPath] fail:', err);
                        clearPathOnMap();
                        if (typeof clearStopsOnMap === 'function') clearStopsOnMap();
                        if (typeof clearWalkOnMap === 'function') clearWalkOnMap();
                        setPathStatus('error', '최단경로 계산 실패: ' + (err && err.message ? err.message : '서버 오류'));
                    })
                    .finally(function () {
                        $scope.pathLoading = false;
                    });
            } catch (e) {
                console.error(e);
                clearPathOnMap();
                if (typeof clearStopsOnMap === 'function') clearStopsOnMap();
                if (typeof clearWalkOnMap === 'function') clearWalkOnMap();
                $scope.pathLoading = false;
                setPathStatus('error', '최단경로 계산 중 오류가 발생했습니다.');
            }
        };

        // =========================================================

        // =========================================================
        // ✅ "경로로 이동하기"는 지금 코드 그대로 써도 됨 (pathPolylineFeature/Extent 사용)
        // =========================================================

        // ✅ "경로로 이동하기" 버튼 동작
        $scope.goToPathOnMap = function () {
            try {
                const map = getInnerOlMap();
                if (!map) return;

                const view = map.getView && map.getView();
                if (!view || !view.fit) return;

                // 1) extent가 있으면 그걸로 fit (가장 안전)
                let ext = $scope.pathPolylineExtent;

                // 2) extent가 없고 feature가 있으면 geometry에서 뽑기
                if (!ext && $scope.pathPolylineFeature) {
                    const geom = $scope.pathPolylineFeature.getGeometry && $scope.pathPolylineFeature.getGeometry();
                    if (geom && geom.getExtent) ext = geom.getExtent();
                }

                if (!ext) {
                    setPathStatus('error', '이동할 경로 범위를 찾지 못했습니다. (polyline/extent 없음)');
                    return;
                }

                view.fit(ext, {
                    padding: [40, 40, 40, 40],
                    duration: 450,
                    maxZoom: 17,
                });

                setPathStatus('ok', '지도 영역을 경로로 맞췄습니다.');
            } catch (e) {
                console.error('[goToPathOnMap] fail:', e);
                setPathStatus('error', '경로로 이동 중 오류가 발생했습니다.');
            }
        };

        // =========================================================
        // ✅ clearPath에 "지도 경로 제거"도 포함
        // =========================================================
        $scope.clearPath = function () {
            $scope.path.fromCandidates = [];
            $scope.path.toCandidates = [];
            $scope.path.from = null;
            $scope.path.to = null;
            $scope.path.fromNodeId = null;
            $scope.path.toNodeId = null;
            $scope.pathResult = null;

            clearPathOnMap();

            setPathStatus('', '경로를 지웠습니다.');
        };

        // =========================================================
        // ✅ 사용자 미니 관리
        // =========================================================
        function buildKeySet(obj) {
            if (!obj) return new Set();
            const cand = [obj.user_id, obj.userId, obj.id, obj.email, obj.username, obj.name].filter(Boolean).map((s) => String(s).trim().toLowerCase());
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
                .then(function (arr) {
                    const users = arr[0];
                    const roles = arr[1];
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

        // =========================================================
        // ✅✅✅ $destroy 단 한 번만: 폴링 + 수집 타이머 정리
        // =========================================================
        $scope.$on('$destroy', function () {
            stopPolling();

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
