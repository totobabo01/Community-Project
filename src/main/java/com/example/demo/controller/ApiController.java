// src/main/java/com/example/demo/controller/ApiController.java
package com.example.demo.controller;                 // 이 클래스가 포함된 패키지 이름 (controller 패키지 아래에 존재)

// ───────── import 구역: 이 파일에서 사용하는 외부 클래스들 선언 ─────────
import java.net.URLEncoder;                         // URL 쿼리 파라미터 등에 넣을 문자열을 퍼센트 인코딩(UTF-8)할 때 사용
import java.nio.charset.StandardCharsets;           // UTF-8 같은 문자셋을 타입으로 표현할 때 사용

import org.springframework.beans.factory.annotation.Value;         // application.yml / properties 에 있는 값을 필드에 주입하는 애노테이션
import org.springframework.http.ResponseEntity;                    // HTTP 응답(본문 + 상태코드)을 표현하는 스프링 타입
import org.springframework.web.bind.annotation.GetMapping;         // HTTP GET 요청 URL 과 메서드를 매핑하는 애노테이션
import org.springframework.web.bind.annotation.RequestMapping;     // 컨트롤러 공통 URL prefix 를 지정하는 애노테이션
import org.springframework.web.bind.annotation.RequestParam;       // 쿼리스트링 ?a=1&b=2 같은 값을 메서드 파라미터로 바인딩하는 애노테이션
import org.springframework.web.bind.annotation.RestController;     // 이 클래스를 REST API 컨트롤러로 선언 (JSON 문자열 등 반환)
import org.springframework.web.client.RestTemplate;                // 다른 서버(외부 API)를 호출하기 위한 HTTP 클라이언트

/**
 * application.yml 예시
 *
 * tago:
 *   bus:
 *     station:
 *       base-url: "https://apis.data.go.kr/1613000/BusSttnInfoInqireService"
 *       service-key: "정류소정보_디코딩키"
 *     location:
 *       base-url: "https://apis.data.go.kr/1613000/BusLcInfoInqireService"
 *       service-key: "버스위치정보_디코딩키"
 *     arrival:
 *       base-url: "https://apis.data.go.kr/1613000/ArvlInfoInqireService"
 *       service-key: "버스도착정보_디코딩키"
 */
// ↑ 위 주석은 application.yml 안에 어떤 설정값을 넣어야 하는지 보여주는 예시.
//   아래 @Value 애노테이션들이 이 경로의 설정 값을 읽어온다.
@RestController                                  // 이 클래스가 REST 컨트롤러임을 선언 (각 메서드 return 값이 그대로 HTTP 응답 바디가 됨)
@RequestMapping("/api/bus")                      // 이 컨트롤러 안의 모든 핸들러 URL 앞에 "/api/bus" 가 공통으로 붙는다.
public class ApiController {

    // ───────── TAGO "버스정류소정보 서비스" 설정 (정류장 이름/목록 조회용) ─────────
    @Value("${tago.bus.station.base-url}")       // application.yml 의 tago.bus.station.base-url 값을 주입
    private String stationBaseUrl;               // 정류장 정보 API의 베이스 URL (예: BusSttnInfoInqireService)

    @Value("${tago.bus.station.service-key}")    // application.yml 의 tago.bus.station.service-key 값을 주입
    private String stationServiceKey;            // 정류장 정보 API 호출에 사용할 서비스키(Decoding 키)

    // ───────── TAGO "버스위치정보 조회 서비스" 설정 (노선별 현재 위치용) ─────────
    @Value("${tago.bus.location.base-url}")      // tago.bus.location.base-url 값 주입
    private String locationBaseUrl;              // 버스 위치 정보 API 베이스 URL (BusLcInfoInqireService)

    @Value("${tago.bus.location.service-key}")   // tago.bus.location.service-key 값 주입
    private String locationServiceKey;           // 버스 위치 정보 API의 서비스키(Decoding 키)

    // ───────── TAGO "버스도착정보 조회 서비스" 설정 (정류장별 도착 예정 정보용) ─────────
    @Value("${tago.bus.arrival.base-url}")       // tago.bus.arrival.base-url 값 주입
    private String arrivalBaseUrl;               // 버스 도착 정보 API 베이스 URL (ArvlInfoInqireService)

    @Value("${tago.bus.arrival.service-key}")    // tago.bus.arrival.service-key 값 주입
    private String arrivalServiceKey;            // 버스 도착 정보 API의 서비스키(Decoding 키)

    // 외부 API 호출용 HTTP 클라이언트
    private final RestTemplate rt = new RestTemplate();
    // ↑ RestTemplate 인스턴스를 하나 만들어 두고,
    //   아래 메서드들에서 TAGO API 를 호출할 때 재사용한다.

    // ─────────────────────────────────────────────
    // 1) 정류장 이름으로 정류소 목록 조회(도시 전체 목록 받아오고, 이름 필터는 프론트에서)
    //    - TAGO 엔드포인트:
    //      BusSttnInfoInqireService/getSttnNoList
    //
    //    호출 예시(대전):
    //      GET /api/bus/stops?cityCode=25&keyword=정부청사&pageNo=1&numOfRows=500
    //
    //    keyword 파라미터는 "프론트에서 쓰려고" 받기만 하고,
    //    TAGO 호출에는 넘기지 않는다. (nodeNm 미사용)
    // ─────────────────────────────────────────────
    @GetMapping("/stops")    // "/api/bus/stops" 경로로 들어오는 HTTP GET 요청과 이 메서드를 매핑
    public ResponseEntity<?> searchStops(
            @RequestParam("cityCode") String cityCode,                 // 쿼리스트링 cityCode 값을 cityCode 파라미터로 받음 (예: "25")
            @RequestParam(value = "keyword", required = false) String keyword, // 쿼리스트링 keyword 값 (프론트 필터용, TAGO 요청에는 직접 사용 안 함)
            @RequestParam(defaultValue = "1") int pageNo,              // 쿼리파라미터 pageNo, 없으면 기본값 1
            @RequestParam(defaultValue = "500") int numOfRows          // 쿼리파라미터 numOfRows, 없으면 기본값 500
    ) {
        // 쿼리 파라미터들을 URL-safe 하게 인코딩
        String serviceKey      = URLEncoder.encode(stationServiceKey, StandardCharsets.UTF_8);
        // ↑ stationServiceKey 안에 +, =, / 같은 문자가 있을 수 있으므로 URLEncoder 로 UTF-8 인코딩
        String encodedCityCode = URLEncoder.encode(cityCode,       StandardCharsets.UTF_8);
        // ↑ cityCode 도 혹시 모르니 UTF-8 URL 인코딩

        // TAGO 정류소 목록 조회 URL 조립
        //  🔥 nodeNm(정류장이름)은 넘기지 않는다 → 도시 전체 목록을 받아서
        //  프론트에서 name으로 필터링하는 전략
        String url = String.format(
                "%s/getSttnNoList?serviceKey=%s&cityCode=%s&pageNo=%d&numOfRows=%d&_type=json",
                stationBaseUrl,   // %s → base-url (정류장 조회 서비스 주소)
                serviceKey,       // %s → URL 인코딩된 서비스키
                encodedCityCode,  // %s → URL 인코딩된 cityCode
                pageNo,           // %d → 페이지 번호
                numOfRows         // %d → 한 번에 가져올 행 수
        );

        // 디버그 로그: 어떤 URL 로 TAGO 를 호출하는지와 keyword 를 콘솔에 출력
        System.out.println("[TAGO 정류장검색] URL = " + url + " (keyword=" + keyword + ")");

        // 외부 API 호출
        String body = rt.getForObject(url, String.class);
        // ↑ RestTemplate 을 이용해 GET 요청을 보내고,
        //   응답 바디 전체를 String 형태로 받는다 (JSON 텍스트 그대로).

        // 프론트로 그대로 반환 (JSON 문자열)
        return ResponseEntity.ok(body);
        // ↑ HTTP 200 OK 상태코드와 함께 body 문자열을 그대로 클라이언트에 돌려준다.
        //   프론트(Angular)에서 res.data 로 이 JSON 텍스트를 받아서 파싱/사용한다.
    }

    // ─────────────────────────────────────────────
    // 2) 노선별 현재 버스 위치 조회
    //    - TAGO 엔드포인트:
    //      BusLcInfoInqireService/getRouteAcctoBusLcList
    //
    //    호출 예시:
    //      GET /api/bus/pos?cityCode=25&routeId=3030001
    // ─────────────────────────────────────────────
    @GetMapping("/pos")      // "/api/bus/pos" 경로의 HTTP GET 요청을 이 메서드에 매핑
    public ResponseEntity<?> getBusPos(
            @RequestParam("cityCode") String cityCode,  // 도시 코드 (예: "25")
            @RequestParam("routeId") String routeId,    // 노선 ID (TAGO 에서 사용하는 routeId)
            @RequestParam(defaultValue = "100") int numOfRows
            // ↑ 한 번에 가져올 데이터 개수, 쿼리스트링에 없으면 기본값 100
    ) {
        // 서비스키, cityCode, routeId 를 URL 에 넣기 위해 각각 UTF-8 인코딩
        String serviceKey      = URLEncoder.encode(locationServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);
        String encodedRouteId  = URLEncoder.encode(routeId,          StandardCharsets.UTF_8);

        // TAGO 노선-현재위치 조회 URL 조립
        String url = String.format(
                "%s/getRouteAcctoBusLcList?serviceKey=%s&cityCode=%s&routeId=%s&numOfRows=%d&_type=json",
                locationBaseUrl,   // %s → 버스 위치 정보 서비스 베이스 URL
                serviceKey,        // %s → 인코딩된 서비스키
                encodedCityCode,   // %s → 인코딩된 cityCode
                encodedRouteId,    // %s → 인코딩된 routeId
                numOfRows          // %d → 한 번에 가져올 개수
        );

        // TAGO API 호출 → 응답을 문자열로 받음
        String body = rt.getForObject(url, String.class);

        // 어떤 URL 로 호출했는지 로그 출력 (디버깅용)
        System.out.println("[TAGO 노선 위치] URL = " + url);
        // System.out.println("[TAGO 노선 위치] 응답 = " + body);
        // ↑ 필요하면 응답 전체를 찍어서 디버깅할 때 사용 (현재는 주석 처리)

        // 응답 문자열을 그대로 클라이언트에 전달
        return ResponseEntity.ok(body);
    }

    // ─────────────────────────────────────────────
    // 3) 정류장별 버스 도착 정보 조회
    //    - TAGO 엔드포인트:
    //      ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList
    //
    //    호출 예시(대전):
    //      GET /api/bus/arrival?cityCode=25&nodeId=DJB800123&numOfRows=50&pageNo=1
    //
    //    프론트에서는:
    //      /api/bus/arrival?cityCode=25&nodeId=선택한정류장.nodeId
    // ─────────────────────────────────────────────
    @GetMapping("/arrival")  // "/api/bus/arrival" 경로의 HTTP GET 요청을 이 메서드에 매핑
    public ResponseEntity<?> getArrival(
            @RequestParam("cityCode") String cityCode,  // 도시 코드 (예: "25")
            @RequestParam("nodeId") String nodeId,      // 정류장 ID (TAGO 에서 사용하는 nodeId)
            @RequestParam(defaultValue = "50") int numOfRows, // 한 번에 가져올 행 수
            @RequestParam(defaultValue = "1") int pageNo      // 페이지 번호
    ) {
        // 서비스키, cityCode, nodeId 를 URL 에 넣기 위해 각각 UTF-8 인코딩
        String serviceKey      = URLEncoder.encode(arrivalServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);
        String encodedNodeId   = URLEncoder.encode(nodeId,           StandardCharsets.UTF_8);

        // TAGO 정류장별 도착정보 조회 URL 조립
        String url = String.format(
                "%s/getSttnAcctoArvlPrearngeInfoList?serviceKey=%s&cityCode=%s&nodeId=%s&numOfRows=%d&pageNo=%d&_type=json",
                arrivalBaseUrl,   // %s → 버스 도착 정보 서비스 베이스 URL
                serviceKey,       // %s → 인코딩된 서비스키
                encodedCityCode,  // %s → 인코딩된 cityCode
                encodedNodeId,    // %s → 인코딩된 nodeId
                numOfRows,        // %d → 한 번에 가져올 개수
                pageNo            // %d → 페이지 번호
        );

        // TAGO API 호출 → 응답을 문자열로 받음
        String body = rt.getForObject(url, String.class);

        // 어떤 URL 로 호출했는지 로그 출력 (디버깅용)
        System.out.println("[TAGO 도착정보] URL = " + url);
        // System.out.println("[TAGO 도착정보] 응답 = " + body);

        // 응답 문자열을 그대로 클라이언트에 전달
        return ResponseEntity.ok(body);
    }
}
