// =========================================================
// [최종 완성/안정화] 대전 트램 2호선 (UserTrace 14구간 + Station 매핑)
// - 안전한 좌표 필터링(isFinite)
// - 검색/필터 호환: kind/type/nodeId 추가
// - 전역 접근 통일(window.*)
// =========================================================

(function () {
    'use strict';

    // =========================================================
    // ✅ 원본 경로 데이터
    // =========================================================
    window.TRAM_ROUTE_FULL_HD = [
        // -------------------------------------------------------
        // [1구간] 연축(244) ~ 회덕(243)
        // -------------------------------------------------------
        { id: 244, section: '1구간', type: 'station', name: '연축(차량기지)', lat: 36.39229, lng: 127.42084 },
        { section: '1구간', type: 'waypoint', lat: 36.3919, lng: 127.4207 },
        { section: '1구간', type: 'waypoint', lat: 36.39125, lng: 127.42077 },
        { section: '1구간', type: 'waypoint', lat: 36.39057, lng: 127.42084 },
        { section: '1구간', type: 'waypoint', lat: 36.38953, lng: 127.42125 },
        { section: '1구간', type: 'waypoint', lat: 36.38871, lng: 127.42169 },
        { section: '1구간', type: 'waypoint', lat: 36.38803, lng: 127.4223 },
        { section: '1구간', type: 'waypoint', lat: 36.38719, lng: 127.42321 },
        { section: '1구간', type: 'waypoint', lat: 36.38582, lng: 127.42468 },
        { section: '1구간', type: 'waypoint', lat: 36.38537, lng: 127.42512 },
        { section: '1구간', type: 'waypoint', lat: 36.38483, lng: 127.42537 },
        { section: '1구간', type: 'waypoint', lat: 36.38353, lng: 127.42571 },
        { section: '1구간', type: 'waypoint', lat: 36.38214, lng: 127.42599 },
        { id: 243, section: '1구간', type: 'station', name: '회덕', lat: 36.37892, lng: 127.42668 },
        { section: '1구간', type: 'waypoint', lat: 36.37191, lng: 127.42863 },
        { id: 242, section: '1구간', type: 'station', name: '읍내', lat: 36.37191, lng: 127.42863 },

        // -------------------------------------------------------
        // [2구간] 읍내 ~ 법동 ~ 중리
        // -------------------------------------------------------
        { id: 241, section: '2구간', type: 'station', name: '법동', lat: 36.36633, lng: 127.43022 },
        { section: '2구간', type: 'waypoint', lat: 36.35976, lng: 127.43202 },
        { section: '2구간', type: 'waypoint', lat: 36.35913, lng: 127.43211 },
        { id: 212, section: '2구간', type: 'station', name: '중리네거리', lat: 36.35895, lng: 127.42584 },

        // -------------------------------------------------------
        // [3구간] 중리 ~ 용전 ~ 한남대 ~ 오정
        // -------------------------------------------------------
        { id: 213, section: '3구간', type: 'station', name: '용전', lat: 36.35873, lng: 127.41787 },
        { id: 214, section: '3구간', type: 'station', name: '한남대', lat: 36.35815, lng: 127.41002 },
        { section: '3구간', type: 'waypoint', lat: 36.3568, lng: 127.4054 },
        { id: 215, section: '3구간', type: 'station', name: '오정농수산물', lat: 36.35762, lng: 127.40089 },

        // -------------------------------------------------------
        // [4구간] 오정 ~ 둔산 ~ 정부청사
        // -------------------------------------------------------
        { id: 216, section: '4구간', type: 'station', name: '수정타운', lat: 36.35765, lng: 127.39524 },
        { id: 217, section: '4구간', type: 'station', name: '창업진흥원', lat: 36.3577, lng: 127.3875 },
        { id: 218, section: '4구간', type: 'station', name: '정부청사역', lat: 36.35876, lng: 127.37947 },

        // -------------------------------------------------------
        // [5/6구간] 엑스포 ~ KAIST ~ 유성
        // -------------------------------------------------------
        { id: 221, section: '5구간', type: 'station', name: '엑스포과학공원', lat: 36.37406, lng: 127.37817 },
        { id: 222, section: '6구간', type: 'station', name: 'KAIST', lat: 36.37059, lng: 127.37214 },
        { id: 223, section: '6구간', type: 'station', name: '유성구청', lat: 36.36641, lng: 127.36592 },

        // -------------------------------------------------------
        // [기타 구간들]
        // -------------------------------------------------------
    ];

    // =========================================================
    // ✅ 유틸: 안전한 숫자/문자 변환
    // =========================================================
    function toStr(v) {
        return String(v == null ? '' : v).trim();
    }
    function toNum(v) {
        var n = Number(v);
        return isFinite(n) ? n : NaN;
    }
    function hasFiniteLatLng(p) {
        var lat = toNum(p && p.lat);
        var lng = toNum(p && p.lng);
        return isFinite(lat) && isFinite(lng);
    }

    // =========================================================
    // ✅ [중요] 최단경로 / 검색용 트램 정류장 목록
    //    → Bus 정류장과 완전히 동일하게 "kind/type/nodeId"까지 맞춤
    // =========================================================
    window.TRAM_STOPS = (window.TRAM_ROUTE_FULL_HD || [])
        .filter(function (p) {
            if (!p) return false;
            if (p.type !== 'station') return false;

            // id는 0일 가능성 거의 없지만, 그래도 안전하게 검사
            var id = toStr(p.id);
            if (!id) return false;

            // ✅ lat/lng는 0도 포함 가능하므로 truthy 체크 금지
            return hasFiniteLatLng(p);
        })
        .map(function (p) {
            var id = toStr(p.id);
            var name = toStr(p.name);
            var lat = toNum(p.lat);
            var lng = toNum(p.lng);

            return {
                // ✅ 버스 쪽과 최대한 호환
                stopId: id,
                id: id,
                nodeId: id, // app.js에서 nodeId를 쓰는 경우 대비
                name: name || 'TRAM-' + id,

                // 좌표
                lat: lat,
                lng: lng,

                // 표시용
                section: toStr(p.section),
                mode: 'TRAM',

                // ✅ 너 UI 필터가 (s.kind||s.type)로 보니까 둘 다 제공
                kind: 'TRAM',
                type: 'TRAM',
            };
        });

    // =========================================================
    // 검색 / 최단경로 / UI 공통 호환
    // =========================================================
    window.TRAM_STATIONS = window.TRAM_STOPS;
    window.tramStops = window.TRAM_STOPS;

    // =========================================================
    // 디버그 확인용
    // =========================================================
    console.log('[TRAM] stops loaded:', (window.TRAM_STOPS || []).length);
    console.log('[TRAM] example:', (window.TRAM_STOPS || [])[0]);
})();
