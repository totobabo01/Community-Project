(function () {
    'use strict';

    // 앱 모듈 + 라우팅
    const app = angular.module('busApp', ['ngRoute']);

    // 라우팅 설정
    app.config(function ($routeProvider) {
        $routeProvider
            .when('/users', { template: '<div></div>' }) // 목록은 index.html 본문 사용
            .when('/users/new', { templateUrl: '/users-new.html', controller: 'UsersNewCtrl' })
            .otherwise({ redirectTo: '/users' });
    });

    // 루트 컨트롤러(현재 경로에 따라 섹션 표시)
    app.controller('RootCtrl', function ($scope, $location) {
        $scope.isListView = function () {
            const p = $location.path();
            return p === '/users' || p === '' || p === '/';
        };
    });

    // 공통 메시지 유틸
    function setTimed($scope, scopeKeyType, scopeKeyMsg, type, msg, ms, $timeout) {
        $scope[scopeKeyType] = type;
        $scope[scopeKeyMsg] = msg;
        if (ms) $timeout(() => ($scope[scopeKeyMsg] = ''), ms);
    }

    // 목록/수정/삭제 컨트롤러
    app.controller('BusController', function ($scope, $http, $timeout, $location) {
        // ===== 정류장 =====
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

        // ===== 사용자(DB) =====
        $scope.users = [];
        $scope.userStatusMessage = '';
        $scope.userStatusType = '';

        $scope.newUser = { name: '', email: '' }; // (과거 단건 추가 모델, 호환용)

        function setUserStatus(type, msg, ms) {
            setTimed($scope, 'userStatusType', 'userStatusMessage', type, msg, ms, $timeout);
        }

        $scope.loadUsers = function () {
            setUserStatus('info', '⏳ 사용자 목록을 불러오는 중...');
            $http
                .get('/user')
                .then(function (res) {
                    $scope.users = Array.isArray(res.data) ? res.data : [];
                    setUserStatus('success', `👤 사용자 ${$scope.users.length}명 불러왔습니다.`, 1500);
                })
                .catch(function (err) {
                    console.error('사용자 목록 오류:', err);
                    setUserStatus('error', '❌ 사용자 목록을 불러오지 못했습니다.', 2500);
                });
        };

        // (참고) 단건 추가 – 새 화면에선 UsersNewCtrl 사용
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
                    const created = res.data;
                    $scope.users.unshift(created);
                    $scope.newUser = { name: '', email: '' };
                    setUserStatus('success', `✅ 추가 완료 (ID: ${created.id})`, 1500);
                })
                .catch(function (err) {
                    console.error('추가 오류:', err);
                    setUserStatus('error', '❌ 사용자 추가에 실패했습니다.', 2500);
                });
        };

        $scope.startEdit = function (u) {
            u._editing = true;
            u._editName = u.name;
            u._editEmail = u.email;
        };
        $scope.cancelEdit = function (u) {
            u._editing = false;
            u._editName = '';
            u._editEmail = '';
        };
        $scope.saveEdit = function (u) {
            if (!u || !u.id) return;
            const payload = {};
            const name = (u._editName || '').trim();
            const email = (u._editEmail || '').trim();

            if (name && name !== u.name) payload.name = name;
            if (email && email !== u.email) {
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    return setUserStatus('error', '이메일 형식이 올바르지 않습니다.', 2000);
                }
                payload.email = email;
            }
            if (Object.keys(payload).length === 0) return $scope.cancelEdit(u);

            setUserStatus('info', `⏳ 수정 중... (ID: ${u.id})`);
            $http
                .put('/user/' + u.id, payload)
                .then(function (res) {
                    const updated = res.data || {};
                    u.name = updated.name ?? name ?? u.name;
                    u.email = updated.email ?? email ?? u.email;
                    u.created_at = updated.created_at || u.created_at;
                    $scope.cancelEdit(u);
                    setUserStatus('success', `✅ 수정 완료 (ID: ${u.id})`, 1500);
                })
                .catch(function (err) {
                    console.error('수정 오류:', err);
                    setUserStatus('error', '❌ 수정에 실패했습니다.', 2500);
                });
        };
        $scope.deleteUser = function (u) {
            if (!u || !u.id) return;
            if (!confirm(`정말로 삭제할까요? (ID: ${u.id})`)) return;

            $http
                .delete('/user/' + u.id)
                .then(function () {
                    $scope.users = $scope.users.filter((row) => row.id !== u.id);
                    setUserStatus('success', `🗑️ 삭제 완료 (ID: ${u.id})`, 1500);
                })
                .catch(function (err) {
                    console.error('삭제 오류:', err);
                    setUserStatus('error', '❌ 삭제에 실패했습니다.', 2500);
                });
        };

        // 새 사용자 추가 화면으로 이동
        $scope.goToNew = function () {
            $location.path('/users/new');
        };
    });

    // 여러명 한 번에 추가 화면 컨트롤러
    app.controller('UsersNewCtrl', function ($scope, $http, $q, $location) {
        $scope.rows = [{ line: '' }];
        $scope.saving = false;

        $scope.addRow = function () {
            $scope.rows.push({ line: '' });
        };
        $scope.removeRow = function (i) {
            $scope.rows.splice(i, 1);
            if ($scope.rows.length === 0) $scope.rows.push({ line: '' });
        };

        function parse(line) {
            if (!line) return { name: '', email: '' };
            const p = line.split(',');
            return { name: (p[0] || '').trim(), email: (p[1] || '').trim() };
        }
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        $scope._touched = {};
        $scope.touch = function (i) {
            $scope._touched[i] = true;
        };
        $scope.invalid = function (i) {
            const o = parse($scope.rows[i].line);
            return $scope._touched[i] && !(o.name && emailRe.test(o.email));
        };
        $scope.allValid = function () {
            return $scope.rows.every(function (r) {
                const o = parse(r.line);
                return o.name && emailRe.test(o.email);
            });
        };

        $scope.saveAll = function (frm) {
            if (frm.$invalid || !$scope.allValid() || $scope.saving) return;
            $scope.saving = true;

            const tasks = $scope.rows.map(function (r) {
                return $http.post('/user', parse(r.line));
            });

            $q.all(tasks)
                .then(function () {
                    alert('저장 완료!');
                    $location.path('/users');
                })
                .catch(function (e) {
                    console.error(e);
                    alert('일부 저장 실패. 콘솔 확인');
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
