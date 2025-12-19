// =========================================================
// [최종 완성] 대전 트램 2호선 (UserTrace 14구간 + Station 매핑)
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
    { id: 242, section: '1구간', type: 'station', name: '읍내', lat: 36.37191, lng: 127.42863 }, // (1구간 끝과 연결)

    // -------------------------------------------------------
    // [2구간] 읍내(242) ~ 법동(241) ~ 중리(212)
    // -------------------------------------------------------

    // 중간에 법동역 삽입 (경로상 추정 위치)
    { id: 241, section: '2구간', type: 'station', name: '법동', lat: 36.36633, lng: 127.43022 },
    { section: '2구간', type: 'waypoint', lat: 36.35976, lng: 127.43202 },
    { section: '2구간', type: 'waypoint', lat: 36.35913, lng: 127.43211 },
    { id: 212, section: '2구간', type: 'station', name: '중리네거리', lat: 36.35895, lng: 127.42584 },

    // -------------------------------------------------------
    // [3구간] 중리(212) ~ 용전(213) ~ 한남대(214) ~ 오정(215)
    // -------------------------------------------------------
    // *참고: 사용자 데이터에 맞춰 역 위치 매핑
    { id: 213, section: '3구간', type: 'station', name: '용전', lat: 36.35873, lng: 127.41787 },
    { id: 214, section: '3구간', type: 'station', name: '한남대', lat: 36.35815, lng: 127.41002 },
    { section: '3구간', type: 'waypoint', lat: 36.3568, lng: 127.4054 },
    { id: 215, section: '3구간', type: 'station', name: '오정농수산물', lat: 36.35762, lng: 127.40089 },
    { section: '3구간', type: 'waypoint', lat: 36.35765, lng: 127.39524 },

    // -------------------------------------------------------
    // [4구간] 오정 ~ 수정타운(216) ~ 둔산(217) ~ 정부청사(218)
    // -------------------------------------------------------
    { id: 216, section: '4구간', type: 'station', name: '수정타운', lat: 36.35765, lng: 127.39524 },
    { id: 217, section: '4구간', type: 'station', name: '창업진흥원', lat: 36.3577, lng: 127.3875 },
    { section: '4구간', type: 'waypoint', lat: 36.35777, lng: 127.37977 },
    { section: '4구간', type: 'waypoint', lat: 36.35802, lng: 127.37946 },
    { id: 218, section: '4구간', type: 'station', name: '정부청사역', lat: 36.35876, lng: 127.37947 },

    // -------------------------------------------------------
    // [5구간] 청사북문(219) ~ 예전(220) ~ 엑스포(221)
    // -------------------------------------------------------
    { id: 219, section: '5구간', type: 'station', name: '청사북문', lat: 36.365, lng: 127.3795 }, // (직선상 보간)
    { id: 220, section: '5구간', type: 'station', name: '예술의전당', lat: 36.37, lng: 127.3795 }, // (직선상 보간)
    { section: '5구간', type: 'waypoint', lat: 36.37457, lng: 127.37956 },
    { section: '5구간', type: 'waypoint', lat: 36.37461, lng: 127.37931 },
    { id: 221, section: '5구간', type: 'station', name: '엑스포과학공원', lat: 36.37406, lng: 127.37817 },

    // -------------------------------------------------------
    // [6구간] 엑스포 ~ KAIST(222) ~ 유성구청(223)
    // -------------------------------------------------------
    { section: '6구간', type: 'waypoint', lat: 36.37255, lng: 127.37534 },
    { section: '6구간', type: 'waypoint', lat: 36.37171, lng: 127.37388 },
    { id: 222, section: '6구간', type: 'station', name: 'KAIST', lat: 36.37059, lng: 127.37214 },
    { section: '6구간', type: 'waypoint', lat: 36.36947, lng: 127.37046 },
    { id: 223, section: '6구간', type: 'station', name: '유성구청', lat: 36.36641, lng: 127.36592 },
    { section: '6구간', type: 'waypoint', lat: 36.36525, lng: 127.36343 },
    { section: '6구간', type: 'waypoint', lat: 36.36391, lng: 127.36071 },
    { section: '6구간', type: 'waypoint', lat: 36.36275, lng: 127.35895 },
    { section: '6구간', type: 'waypoint', lat: 36.36156, lng: 127.35684 },
    { section: '6구간', type: 'waypoint', lat: 36.36092, lng: 127.35489 },
    { section: '6구간', type: 'waypoint', lat: 36.36044, lng: 127.35335 },
    { section: '6구간', type: 'waypoint', lat: 36.36032, lng: 127.35234 },
    { section: '6구간', type: 'waypoint', lat: 36.36038, lng: 127.35123 },
    { section: '6구간', type: 'waypoint', lat: 36.36064, lng: 127.34984 },
    { section: '6구간', type: 'waypoint', lat: 36.36182, lng: 127.34597 },

    // -------------------------------------------------------
    // [7구간] 충남대(224) ~ 유성온천(225)
    // -------------------------------------------------------
    { id: 224, section: '7구간', type: 'station', name: '충남대', lat: 36.36204, lng: 127.34531 },
    { section: '7구간', type: 'waypoint', lat: 36.36204, lng: 127.34488 },
    { section: '7구간', type: 'waypoint', lat: 36.36187, lng: 127.3446 },
    { id: 225, section: '7구간', type: 'station', name: '유성온천역', lat: 36.35981, lng: 127.3437 },
    { id: 226, section: '7구간', type: 'station', name: '상대', lat: 36.35065, lng: 127.34027 },
    { section: '7구간', type: 'waypoint', lat: 36.3463, lng: 127.34031 },
    { id: 227, section: '7구간', type: 'station', name: '원신흥', lat: 36.34511, lng: 127.34023 },
    { section: '7구간', type: 'waypoint', lat: 36.34318, lng: 127.33958 },
    { section: '7구간', type: 'waypoint', lat: 36.34162, lng: 127.33854 },
    { section: '7구간', type: 'waypoint', lat: 36.33959, lng: 127.33682 },

    // -------------------------------------------------------
    // [8구간] 도안(228~231) ~ 가수원(232)
    // -------------------------------------------------------
    { id: 228, section: '8구간', type: 'station', name: '목원대입구', lat: 36.339, lng: 127.3365 },
    { section: '8구간', type: 'waypoint', lat: 36.33649, lng: 127.33425 },
    { section: '8구간', type: 'waypoint', lat: 36.33471, lng: 127.3332 },
    { id: 229, section: '8구간', type: 'station', name: '도안고', lat: 36.33212, lng: 127.33282 },
    { id: 230, section: '8구간', type: 'station', name: '목원대', lat: 36.326, lng: 127.3328 },
    { id: 231, section: '8구간', type: 'station', name: '용소', lat: 36.31927, lng: 127.33309 },
    { section: '8구간', type: 'waypoint', lat: 36.31779, lng: 127.33377 },
    { section: '8구간', type: 'waypoint', lat: 36.31622, lng: 127.3346 },
    { section: '8구간', type: 'waypoint', lat: 36.31543, lng: 127.33482 },
    { section: '8구간', type: 'waypoint', lat: 36.31441, lng: 127.33501 },
    { id: 232, section: '8구간', type: 'station', name: '가수원네거리', lat: 36.30294, lng: 127.33479 },
    { section: '8구간', type: 'waypoint', lat: 36.30176, lng: 127.33481 },
    { section: '8구간', type: 'waypoint', lat: 36.30153, lng: 127.33504 },
    { section: '8구간', type: 'waypoint', lat: 36.30151, lng: 127.33568 },

    // -------------------------------------------------------
    // [9구간] 진잠(245) V자 ~ 관저(233)
    // -------------------------------------------------------
    { section: '9구간', type: 'waypoint', lat: 36.30157, lng: 127.33324 },
    { section: '9구간', type: 'waypoint', lat: 36.30162, lng: 127.33155 },
    { section: '9구간', type: 'waypoint', lat: 36.30153, lng: 127.33028 },
    { section: '9구간', type: 'waypoint', lat: 36.30102, lng: 127.32863 },
    { section: '9구간', type: 'waypoint', lat: 36.30044, lng: 127.32697 },
    { section: '9구간', type: 'waypoint', lat: 36.29984, lng: 127.32525 },
    { id: 245, section: '9구간', type: 'station', name: '진잠', lat: 36.29932, lng: 127.32423 }, // V자 꼭짓점
    { section: '9구간', type: 'waypoint', lat: 36.29984, lng: 127.32525 },
    { section: '9구간', type: 'waypoint', lat: 36.30044, lng: 127.32697 },
    { section: '9구간', type: 'waypoint', lat: 36.30102, lng: 127.32863 },
    { section: '9구간', type: 'waypoint', lat: 36.30153, lng: 127.33028 },
    { section: '9구간', type: 'waypoint', lat: 36.30162, lng: 127.33155 },
    { section: '9구간', type: 'waypoint', lat: 36.30157, lng: 127.33324 },
    { section: '9구간', type: 'waypoint', lat: 36.30153, lng: 127.33504 },
    { id: 233, section: '9구간', type: 'station', name: '롯데시네마', lat: 36.30151, lng: 127.33547 },
    { section: '9구간', type: 'waypoint', lat: 36.30156, lng: 127.33674 },
    { section: '9구간', type: 'waypoint', lat: 36.30178, lng: 127.33776 },
    { section: '9구간', type: 'waypoint', lat: 36.30221, lng: 127.33966 },
    { section: '9구간', type: 'waypoint', lat: 36.30272, lng: 127.34196 },
    { section: '9구간', type: 'waypoint', lat: 36.3034, lng: 127.34487 },
    { id: 234, section: '9구간', type: 'station', name: '대전가원학교', lat: 36.30357, lng: 127.34618 },
    { section: '9구간', type: 'waypoint', lat: 36.30425, lng: 127.3494 },
    { id: 235, section: '9구간', type: 'station', name: '가수원교회', lat: 36.30551, lng: 127.35484 },
    { section: '9구간', type: 'waypoint', lat: 36.30658, lng: 127.35895 },

    // -------------------------------------------------------
    // [10구간] 건양대(234) ~ 가수원교(235) ~ 정림(236) ~ 도마(237)
    // -------------------------------------------------------
    { section: '10구간', type: 'waypoint', lat: 36.3071, lng: 127.36137 },
    { id: 236, section: '10구간', type: 'station', name: '가수원교', lat: 36.30739, lng: 127.36376 },
    { section: '10구간', type: 'waypoint', lat: 36.30922, lng: 127.36888 },
    { section: '10구간', type: 'waypoint', lat: 36.31035, lng: 127.37353 },
    { section: '10구간', type: 'waypoint', lat: 36.31086, lng: 127.37527 },
    { id: 237, section: '10구간', type: 'station', name: '도마네거리', lat: 36.31268, lng: 127.37919 },

    // -------------------------------------------------------
    // [11구간] 유등교(238) ~ 유천(239)
    // -------------------------------------------------------
    { section: '11구간', type: 'waypoint', lat: 36.31387, lng: 127.38177 },
    { id: 238, section: '11구간', type: 'station', name: '유등교', lat: 36.31507, lng: 127.38455 },
    { section: '11구간', type: 'waypoint', lat: 36.3153, lng: 127.38536 },

    // -------------------------------------------------------
    // [12구간] 오류(240) ~ 서대전(201,202) ~ 대사(203) ~ 부사(204) ~ 인동(205)
    // -------------------------------------------------------
    { id: 239, section: '12구간', type: 'station', name: '유천', lat: 36.31618, lng: 127.38879 },
    { id: 240, section: '12구간', type: 'station', name: '오류', lat: 36.31886, lng: 127.39934 },
    { id: 201, section: '12구간', type: 'station', name: '서대전역', lat: 36.32109, lng: 127.40789 },
    { id: 202, section: '12구간', type: 'station', name: '서대전네거리', lat: 36.32237, lng: 127.41233 },
    { section: '12구간', type: 'waypoint', lat: 36.3223, lng: 127.41269 },
    { section: '12구간', type: 'waypoint', lat: 36.32204, lng: 127.41299 },
    { id: 203, section: '12구간', type: 'station', name: '대사', lat: 36.31822, lng: 127.41782 },
    { section: '12구간', type: 'waypoint', lat: 36.31828, lng: 127.41978 },
    { id: 204, section: '12구간', type: 'station', name: '부사', lat: 36.3178, lng: 127.42145 },
    { section: '12구간', type: 'waypoint', lat: 36.31796, lng: 127.42365 },
    { section: '12구간', type: 'waypoint', lat: 36.31728, lng: 127.42505 },

    // -------------------------------------------------------
    // [13구간] 대전역(206) ~ 대동(207) ~ 신흥(208) ~ 자양(209)
    // -------------------------------------------------------
    { section: '13구간', type: 'waypoint', lat: 36.31713, lng: 127.42564 },
    { id: 205, section: '13구간', type: 'station', name: '인동', lat: 36.32067, lng: 127.43509 },
    { section: '13구간', type: 'waypoint', lat: 36.3213, lng: 127.43642 },
    { section: '13구간', type: 'waypoint', lat: 36.32164, lng: 127.43767 },
    { section: '13구간', type: 'waypoint', lat: 36.32176, lng: 127.43777 },
    { section: '13구간', type: 'waypoint', lat: 36.32588, lng: 127.43566 },
    { id: 206, section: '13구간', type: 'station', name: '대전역', lat: 36.33093, lng: 127.43276 },
    { section: '13구간', type: 'waypoint', lat: 36.33118, lng: 127.43262 },
    { section: '13구간', type: 'waypoint', lat: 36.33246, lng: 127.43633 },
    { section: '13구간', type: 'waypoint', lat: 36.33327, lng: 127.43803 },
    { id: 207, section: '13구간', type: 'station', name: '중앙동 행정 복지 센터', lat: 36.33354, lng: 127.43925 },
    { section: '13구간', type: 'waypoint', lat: 36.33355, lng: 127.43943 },
    { section: '13구간', type: 'waypoint', lat: 36.33348, lng: 127.43964 },
    { section: '13구간', type: 'waypoint', lat: 36.33258, lng: 127.43997 },
    { section: '13구간', type: 'waypoint', lat: 36.33214, lng: 127.44017 },
    { section: '13구간', type: 'waypoint', lat: 36.33186, lng: 127.44038 },
    { section: '13구간', type: 'waypoint', lat: 36.3309, lng: 127.44117 },
    { section: '13구간', type: 'waypoint', lat: 36.33053, lng: 127.44167 },
    { section: '13구간', type: 'waypoint', lat: 36.32963, lng: 127.44272 },
    { section: '13구간', type: 'waypoint', lat: 36.32954, lng: 127.44294 },
    { section: '13구간', type: 'waypoint', lat: 36.32967, lng: 127.4431 },
    { id: 208, section: '13구간', type: 'station', name: '신흥', lat: 36.32985, lng: 127.44323 },
    { section: '13구간', type: 'waypoint', lat: 36.33092, lng: 127.4439 },
    { section: '13구간', type: 'waypoint', lat: 36.33627, lng: 127.44722 },
    { section: '13구간', type: 'waypoint', lat: 36.33893, lng: 127.44872 },
    { section: '13구간', type: 'waypoint', lat: 36.33996, lng: 127.4489 },
    { id: 209, section: '13구간', type: 'station', name: '우송대(자양)', lat: 36.34068, lng: 127.44887 },

    // -------------------------------------------------------
    // [14구간] 가양(210) ~ 동부(211) ~ 중리(212, 순환끝)
    // -------------------------------------------------------
    { section: '14구간', type: 'waypoint', lat: 36.34121, lng: 127.44881 },
    { section: '14구간', type: 'waypoint', lat: 36.34161, lng: 127.44861 },
    { section: '14구간', type: 'waypoint', lat: 36.34248, lng: 127.44801 },
    { section: '14구간', type: 'waypoint', lat: 36.34557, lng: 127.44569 },
    { id: 210, section: '14구간', type: 'station', name: '동부네거리', lat: 36.35111, lng: 127.44206 },
    { section: '14구간', type: 'waypoint', lat: 36.35819, lng: 127.43355 },
    { id: 211, section: '14구간', type: 'station', name: '동부네거리', lat: 36.35823, lng: 127.43355 },
    { section: '14구간', type: 'waypoint', lat: 36.35913, lng: 127.43211 }, // 순환 완성 (2구간 시작과 만남)
];

window.TRAM_STATIONS = window.TRAM_ROUTE_FULL_HD;
