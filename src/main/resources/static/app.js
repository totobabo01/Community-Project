(function () {
    'use strict';

    const app = angular.module('busApp', ['ngRoute']);

    // ───────────────── AuthService: /api/me 로 현재 사용자/권한 로드 ─────────────────
    app.factory('AuthService', function ($http, $q) {
        let me = null; // { username, authorities:[], admin:boolean }

        function loadMe(force) {
            if (!force && me) return $q.resolve(me);
            return $http.get('/api/me').then(
                (res) => (me = res.data),
                // 비로그인(401)이면 null 유지
                () => (me = null)
            );
        }
        function getMe() {
            return me;
        }

        return { loadMe, getMe };
    });

    // ───────────────── Routing ─────────────────
    app.config(function ($routeProvider) {
        $routeProvider
            .when('/users', { template: '<div></div>' }) // 목록은 index.html 본문에서 렌더
            .when('/users/new', {
                templateUrl: '/users-new.html',
                controller: 'UsersNewCtrl',
            })
            // 관리자 전용 페이지(접근은 permitAll, 데이터는 /api/admin/** 로 제한)
            .when('/roles', { templateUrl: '/roles.html', controller: 'RolesCtrl' })
            .when('/db-users', { templateUrl: '/db-users.html', controller: 'DbUsersCtrl' })
            .otherwise({ redirectTo: '/users' });
    });

    // ───────────────── Root / 탭 뷰 판단 + 로그인 정보 표시 ─────────────────
    app.controller('RootCtrl', function ($scope, $location, AuthService) {
        $scope.me = null;

        $scope.isListView = function () {
            const p = $location.path();
            return p === '/users' || p === '' || p === '/';
        };

        // 최초 진입 시 내 정보 로드(있으면 우상단 인사말 등에 활용)
        AuthService.loadMe().finally(function () {
            $scope.me = AuthService.getMe(); // null 가능(비로그인)
        });
    });

    // 공통 메시지 유틸
    function setTimed($scope, scopeKeyType, scopeKeyMsg, type, msg, ms, $timeout) {
        $scope[scopeKeyType] = type;
        $scope[scopeKeyMsg] = msg;
        if (ms) $timeout(() => ($scope[scopeKeyMsg] = ''), ms);
    }

    // 역할 라벨/스타일 도우미
    function roleToLabel(role) {
        if (!role) return '사용자';
        return String(role).toUpperCase().includes('ADMIN') ? '관리자' : '사용자';
    }
    function roleToClass(role) {
        if (!role) return 'badge-user';
        return String(role).toUpperCase().includes('ADMIN') ? 'badge-admin' : 'badge-user';
    }

    // ───────────────── 버스 + DB 사용자 목록/수정/삭제 ─────────────────
    app.controller('BusController', function ($scope, $http, $timeout, $location, $q) {
        // ===== 버스 =====
        $scope.items = [];
        $scope.filteredItems = [];
        $scope.keyword = '';
        $scope.statusMessage = '';
        $scope.statusType = '';

        $scope.loadData = function () {
            setTimed($scope, 'statusType', 'statusMessage', 'info', '⏳ 데이터를 불러오는 중입니다...', null, $timeout);

            const params = { pageNo: 1, numOfRows: 500 };
            if ($scope.keyword && $scope.keyword.trim()) params.stNm = $scope.keyword.trim();

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
                .catch(function (err) {
                    console.error('❌ 네트워크/서버 오류:', err);
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

        // ===== 사용자(DB) + 역할(권한) =====
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';

        $scope.newUser = { name: '', email: '' };

        function setUserStatus(type, msg, ms) {
            setTimed($scope, 'userStatusType', 'userStatusMessage', type, msg, ms, $timeout);
        }

        // ── 권한 병합용 유틸 (여러 후보 키로 매칭)
        function buildKeySet(obj) {
            if (!obj) return new Set();
            const cand = [
                obj.user_id,
                obj.userId,
                obj.id,
                obj.email,
                obj.username,
                obj.name, // 혹시 username이 name인 환경
            ]
                .filter(Boolean)
                .map(String)
                .map((s) => s.trim().toLowerCase());
            return new Set(cand);
        }
        function makeRoleIndex(roleRows) {
            const idx = new Map();
            (roleRows || []).forEach((r) => {
                const keys = buildKeySet(r);
                keys.forEach((k) =>
                    idx.set(k, {
                        role: r.role,
                    })
                );
            });
            return idx;
        }
        function attachRolesToUsers(users, roleIndex) {
            (users || []).forEach((u) => {
                const keys = buildKeySet(u);
                let matched = null;
                keys.forEach((k) => {
                    if (!matched && roleIndex.has(k)) matched = roleIndex.get(k);
                });
                const role = matched ? matched.role : null;
                u._role = role;
                u.roleLabel = roleToLabel(role);
                u.roleClass = roleToClass(role);
            });
        }

        // 사용자 목록 + 역할(권한) 병합 로드
        $scope.loadUsers = function () {
            setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');

            // 1) 사용자 목록
            const usersP = $http.get('/user').then((res) => (Array.isArray(res.data) ? res.data : []));

            // 2) 역할 목록 (표시용: GET /api/roles 는 로그인만 허용)
            const rolesP = $http
                .get('/api/roles')
                .then((res) => (Array.isArray(res.data) ? res.data : []))
                .catch(() => []); // 오류/권한 문제 시 조용히 무시

            $q.all([usersP, rolesP])
                .then(function ([users, roles]) {
                    const roleIndex = makeRoleIndex(roles);
                    attachRolesToUsers(users, roleIndex);
                    $scope.users = users;
                    setUserStatus('success', `👤 사용자 ${$scope.users.length}명 불러왔습니다.`, 1500);
                })
                .catch(function (err) {
                    console.error('사용자/권한 로드 오류:', err);
                    setUserStatus('error', '❌ 사용자 목록을 불러오지 못했습니다.', 2500);
                });
        };

        // (단건 추가용 – 유지)
        $scope.createUser = function () {
            const name = ($scope.newUser.name || '').trim();
            const email = ($scope.newUser.email || '').trim();
            if (!name || !email) return setUserStatus('error', '이름과 이메일을 모두 입력하세요.', 2000);
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);
            }

            setUserStatus('info', '⏳ 사용자 추가 중...');
            $http
                .post('/user', { name, email })
                .then(function (res) {
                    const created = res.data || {};
                    // 새로 추가된 사용자는 기본적으로 사용자(ROLE_USER)라고 가정
                    created.roleLabel = '사용자';
                    created.roleClass = 'badge-user';
                    $scope.users.unshift(created);
                    $scope.newUser = { name: '', email: '' };
                    setUserStatus('success', `✅ 추가 완료 (ID: ${created.user_id || created.userId || created.id})`, 1500);
                })
                .catch(function (err) {
                    console.error('추가 오류:', err);
                    setUserStatus('error', '❌ 사용자 추가에 실패했습니다.', 2500);
                });
        };

        // 편집 시작/취소
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

        // 저장
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
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);
                }
                payload.email = email;
            }
            if (Object.keys(payload).length === 0) return $scope.cancelEdit(u);

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
                .catch(function (err) {
                    console.error('수정 오류:', err);
                    setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };

        // 삭제
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
                .catch(function (err) {
                    console.error('삭제 오류:', err);
                    setUserStatus('error', '❌ 삭제에 실패했습니다.', 2500);
                });
        };

        $scope.goToNew = function () {
            $location.path('/users/new');
        };
    });

    // ───────────────── 관리자 전용: 권한 관리 화면 ─────────────────
    app.controller('RolesCtrl', function ($scope, $http, AuthService) {
        $scope.loading = true;
        $scope.adminOnly = false; // 비관리자면 true로 바뀌어 "관리자 전용입니다" 노출
        $scope.me = null;
        $scope.rows = [];

        // 내 권한 먼저 확인(표 버튼 활성화 등)
        AuthService.loadMe().finally(function () {
            $scope.me = AuthService.getMe(); // null 가능

            // 실제 데이터는 ADMIN 전용 API 호출
            $http
                .get('/api/admin/roles')
                .then(
                    (res) => {
                        $scope.rows = Array.isArray(res.data) ? res.data : [];
                    },
                    (err) => {
                        if (err.status === 403) $scope.adminOnly = true;
                    }
                )
                .finally(() => {
                    $scope.loading = false;
                });
        });

        // (옵션) 관리자 작업: 권한 부여/해제 API도 /api/admin/** 로 구현해 연결
        $scope.grantAdmin = function (row) {
            /* PUT /api/admin/roles/{id}/grant-admin */
        };
        $scope.revokeAdmin = function (row) {
            /* PUT /api/admin/roles/{id}/revoke-admin */
        };
        $scope.roleToLabel = roleToLabel;
        $scope.roleToClass = roleToClass;
    });

    // ───────────────── 관리자 전용: DB 사용자 관리 화면 ─────────────────
    app.controller('DbUsersCtrl', function ($scope, $http, AuthService) {
        $scope.loading = true;
        $scope.adminOnly = false;
        $scope.me = null;
        $scope.users = [];

        AuthService.loadMe().finally(function () {
            $scope.me = AuthService.getMe();

            // 여기는 예시 엔드포인트입니다. 백엔드에서 /api/admin/db-users 를 구현하세요.
            $http
                .get('/api/admin/db-users')
                .then(
                    (res) => {
                        $scope.users = Array.isArray(res.data) ? res.data : [];
                    },
                    (err) => {
                        if (err.status === 403) $scope.adminOnly = true;
                    }
                )
                .finally(() => {
                    $scope.loading = false;
                });
        });
    });

    // ───────────────── 여러 명 한 번에 추가(아이디/이름/전화/이메일) ─────────────────
    app.controller('UsersNewCtrl', function ($scope, $http, $q, $location) {
        // 각 행은 명시적 필드 사용
        $scope.rows = [{ user_id: '', name: '', phone: '', email: '' }];
        $scope.saving = false;

        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const uidRe = /^[A-Za-z0-9_]{1,16}$/; // 선택 입력. 입력 시 제약

        $scope.addRow = function () {
            $scope.rows.push({ user_id: '', name: '', phone: '', email: '' });
        };
        $scope.removeRow = function (i) {
            $scope.rows.splice(i, 1);
            if ($scope.rows.length === 0) $scope.addRow();
        };

        // 폼 유효성 보조
        $scope._touched = {};
        $scope.touch = function (i, field) {
            $scope._touched[i] = $scope._touched[i] || {};
            $scope._touched[i][field] = true;
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

        // 저장
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
                    // 서버 구현체 호환(둘 다 보냄)
                    payload.user_id = uid;
                    payload.userId = uid;
                }
                return $http.post('/user', payload);
            });

            $q.all(tasks)
                .then(function () {
                    alert('저장 완료!');
                    $location.path('/users');
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
            $location.path('/users');
        };
    });

    // 데모 컨트롤러(/api/users 호출)
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
