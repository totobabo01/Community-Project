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
                } else {
                    roots.push(map.get(r.uuid));
                }
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
        $locationProvider.hashPrefix('!');
        $routeProvider
            .when('/users', { template: '<div></div>' })
            .when('/users/new', { templateUrl: '/users-new.html', controller: 'UsersNewCtrl' })
            .when('/board/bus', { templateUrl: '/tpl/board/bus.html', controller: 'BoardBusCtrl' })
            .when('/board/normal', { templateUrl: '/tpl/board/normal.html', controller: 'BoardNormalCtrl' })
            .when('/roles', { templateUrl: '/roles.html', controller: 'RolesCtrl' })
            .when('/db-users', { templateUrl: '/db-users.html', controller: 'DbUsersCtrl' })
            .otherwise({ redirectTo: '/users' });
    });

    // ───────────────── Root (버스 탭은 ?tab=bus로 제어) + 메뉴 열림 제어 개선 ─────────────────
    app.controller('RootCtrl', function ($scope, $location, $document, $timeout, AuthService, MenuService) {
        $scope.me = null;
        $scope.menus = [];
        $scope.location = $location;

        // /users에 tab 파라미터가 없으면 기본으로 bus 부여
        function ensureDefaultUsersTab() {
            if ($location.path() === '/users' && !$location.search().tab) {
                $location.search('tab', 'bus');
            }
        }

        function syncBusTab() {
            ensureDefaultUsersTab();
            $scope.showBusTab = $location.path() === '/users' && $location.search().tab === 'bus';
        }
        syncBusTab();

        $scope.goBusTab = function () {
            if ($location.path() !== '/users') $location.path('/users');
            $location.search('tab', 'bus');
            syncBusTab();
        };

        $scope.$on('$locationChangeSuccess', syncBusTab);
        $scope.$on('$routeChangeSuccess', function () {
            ensureDefaultUsersTab();
            if ($location.path() !== '/users' && $location.search().tab) {
                $location.search('tab', null);
            }
            syncBusTab();
            // 라우트 이동시 드롭다운 강제 닫기
            closeAllMenus();
        });

        $scope.isListView = function () {
            const p = $location.path();
            return p === '/users' || p === '' || p === '/';
        };

        AuthService.loadMe().finally(() => {
            $scope.me = AuthService.getMe();
        });

        // 메뉴 열림/닫힘 안정화: hover-intent + click-toggle + 바깥 클릭 닫기
        function decorateMenuNode(n) {
            n._open = false;
            n._hover = false;
            n._closing = null; // timeout id
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
            m._hover = true;
            if (m._closing) {
                $timeout.cancel(m._closing);
                m._closing = null;
            }
            $timeout(() => {
                m._open = true;
            }, 60);
        };
        $scope.onMenuLeave = function (m) {
            m._hover = false;
            m._closing = $timeout(() => {
                if (!m._hover) m._open = false;
                m._closing = null;
            }, 180);
        };
        $scope.onMenuClick = function (m, $event) {
            m._open = !m._open;
            if (m._open) {
                ($scope.menus || []).forEach((root) => {
                    if (root !== m) root._open = false;
                });
            }
            if ($event) $event.stopPropagation();
        };

        const offDocClick = $document.on('click', function () {
            $scope.$applyAsync(() => closeAllMenus());
        });
        $scope.$on('$destroy', function () {
            if (offDocClick && offDocClick.off) offDocClick.off();
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

    // ───────────────── Bus + Users ─────────────────
    app.controller('BusController', function ($scope, $http, $timeout, $location, $q) {
        // 버스
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

        // 사용자/권한
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
            (roleRows || []).forEach((r) => {
                buildKeySet(r).forEach((k) => idx.set(k, { role: r.role }));
            });
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

    // ───────────────── 게시판 ─────────────────
    app.controller('BoardBaseCtrl', function ($scope, $http, AuthService) {
        $scope.posts = [];
        $scope.loading = false;
        $scope.newPost = { title: '', content: '' };

        // 로그인 정보(버튼 노출 + 클라이언트 가드)
        AuthService.loadMe().finally(() => {
            $scope.me = AuthService.getMe();
        });

        const isNum = (v) => typeof v === 'number' && isFinite(v);
        const isNonEmptyStr = (s) => typeof s === 'string' && s.trim().length > 0;

        // 권한 체크(클라 가드 — 서버에서도 반드시 검증됨)
        function canEditPost(p) {
            if (!$scope.me) return false;
            return $scope.me.isAdmin || $scope.me.username === p.writerId;
        }
        function canEditComment(c) {
            if (!$scope.me) return false;
            return $scope.me.isAdmin || $scope.me.username === c.writerId;
        }

        function resolvePostKey(p) {
            if (isNum(p.postId)) return { type: 'num', key: p.postId };
            const candidates = [p.postKey, p.postIdStr, p.post_uuid, p.postUuid, p.uuid, p.id, p.key].filter(isNonEmptyStr);
            if (candidates.length) return { type: 'str', key: candidates[0] };
            return { type: 'none', key: null };
        }

        function makePostUid(p, idx) {
            const cand = [isNum(p.postId) ? String(p.postId) : null, isNum(p.id) ? String(p.id) : null, p.post_uuid, p.postUuid, p.uuid, p.idStr, p.postIdStr, p.key, p._key != null ? String(p._key) : null].filter(isNonEmptyStr);
            if (cand.length) return cand[0];
            return 'tmp-' + Date.now() + '-' + (idx == null ? Math.random().toString(36).slice(2) : idx);
        }

        $scope.loadPosts = function () {
            if (!$scope.boardCode) return;
            $scope.loading = true;
            $http
                .get('/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts')
                .then((res) => {
                    const list = Array.isArray(res.data) ? res.data : [];
                    $scope.posts = list.map((p, i) => {
                        const r = resolvePostKey(p);
                        p._keyType = r.type;
                        p._key = r.key;
                        p._uid = makePostUid(p, i);
                        return p;
                    });
                })
                .finally(() => {
                    $scope.loading = false;
                });
        };

        $scope.createPost = function () {
            const t = ($scope.newPost.title || '').trim();
            const c = ($scope.newPost.content || '').trim();
            if (!t || !c) return;
            $http
                .post('/api/boards/' + encodeURIComponent($scope.boardCode) + '/posts', { title: t, content: c })
                .then((res) => {
                    const created = res.data || {};
                    const r = resolvePostKey(created);
                    created._keyType = r.type;
                    created._key = r.key;
                    created._uid = makePostUid(created);
                    $scope.posts.unshift(created);
                    $scope.newPost = { title: '', content: '' };
                })
                .catch((err) => {
                    alert((err && err.data && (err.data.message || err.data.error)) || '등록 실패');
                });
        };

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

        $scope.savePost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 수정할 수 있습니다.');
            const payload = { title: (p._editTitle || '').trim(), content: (p._editContent || '').trim() };
            if (!payload.title || !payload.content) return;

            const onOk = () => {
                p.title = payload.title;
                p.content = payload.content;
                $scope.cancelEditPost(p);
            };
            const onErr = (err, msg) => {
                if (err && err.status === 403) alert('본인이 쓴 글만 수정할 수 있습니다.');
                else alert(msg);
            };

            if (p._keyType === 'num') {
                $http
                    .put('/api/posts/' + encodeURIComponent(p._key), payload)
                    .then(onOk)
                    .catch((e) => onErr(e, '수정 실패'));
            } else if (p._keyType === 'str') {
                $http
                    .put('/api/posts/key/' + encodeURIComponent(p._key), payload)
                    .then(onOk)
                    .catch((e) => onErr(e, '수정 실패(키)'));
            } else {
                alert('이 게시글은 수정 키 정보를 알 수 없어 수정할 수 없습니다.');
            }
        };

        $scope.deletePost = function (p) {
            if (!canEditPost(p)) return alert('본인이 쓴 글만 삭제할 수 있습니다.');
            if (!confirm('이 게시글을 삭제할까요?')) return;

            const onOk = () => {
                $scope.posts = $scope.posts.filter((x) => x !== p);
            };
            const tryDeleteByNumericId = () => {
                const numId = typeof p.postId === 'number' && isFinite(p.postId) ? p.postId : typeof p.id === 'number' && isFinite(p.id) ? p.id : null;
                if (numId == null) return Promise.reject();
                return $http.delete('/api/posts/' + encodeURIComponent(numId)).then(onOk);
            };
            const onErr = (err, msg) => {
                if (err && err.status === 403) alert('본인이 쓴 글만 삭제할 수 있습니다.');
                else alert(msg);
            };

            if (p._keyType === 'num') {
                $http
                    .delete('/api/posts/' + encodeURIComponent(p._key))
                    .then(onOk)
                    .catch((e) => onErr(e, '삭제 실패'));
            } else if (p._keyType === 'str') {
                // 1차: key로 삭제, 실패하면 숫자 ID로 폴백 시도
                $http
                    .delete('/api/posts/key/' + encodeURIComponent(p._key))
                    .then(onOk)
                    .catch(() => tryDeleteByNumericId().catch((e2) => onErr(e2, '삭제 실패(키/ID 모두 실패)')));
            } else {
                // 키 정보 모르면 혹시 숫자 ID 있나 시도
                tryDeleteByNumericId().catch((e) => onErr(e, '이 게시글은 삭제 키/ID 정보를 알 수 없어 삭제할 수 없습니다.'));
            }
        };

        $scope.toggleComments = function (p) {
            p._showComments = !p._showComments;
            if (p._showComments && !p._commentsLoaded) $scope.loadComments(p);
        };

        function decorateComments(arr) {
            const baseTs = Date.now();
            return (arr || []).map((c, i) => {
                if (!c) return c;
                c._uid = (c.uuid && 'c-' + c.uuid) || (typeof c.commentId === 'number' && isFinite(c.commentId) && 'c-' + c.commentId) || 'c-tmp-' + baseTs + '-' + i;
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

        // ───────── 댓글 수정/삭제(본인만) ─────────
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

        // ★ 댓글 삭제: uuid 우선, 없으면 숫자 PK로 호환
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
    });

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

    // ───────────────── Roles / DbUsers ─────────────────
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
                .catch((err) => {
                    notify('error', err && err.data ? err.data : '저장 중 오류가 발생했습니다.', 2500);
                })
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
                    // ✅ 저장 후 DB 사용자 관리로 이동
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
            // ✅ 뒤로가기 시에도 DB 사용자 관리로 이동
            $location.path('/db-users');
        };
    });

    // 데모
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
