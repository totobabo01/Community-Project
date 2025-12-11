// src/main/java/com/example/demo/controller/ApiController.java    // 이 파일이 프로젝트 안에서 어디에 위치하는지 알려주는 주석(실제 코드에는 영향 없음)

package com.example.demo.controller;                 // 이 클래스가 속한 패키지 이름 선언. Java는 패키지 경로가 곧 폴더 구조와 연결됨.

// ───────── import 구역: 이 파일에서 사용하는 외부 클래스들 선언 ─────────
import java.net.URLEncoder;                         // 문자열(한글, 특수문자 등)을 URL 쿼리 파라미터에 넣기 위해 퍼센트 인코딩(UTF-8)할 때 사용하는 유틸리티 클래스.
import java.nio.charset.StandardCharsets;           // UTF-8 같은 표준 문자셋 상수를 제공하는 클래스. 인코딩 시 어떤 문자셋을 쓸지 명시할 때 사용.

import org.springframework.beans.factory.annotation.Value;         // application.yml / properties에 정의된 설정값을 필드에 주입해주는 애노테이션 @Value를 사용하기 위해 import.
import org.springframework.http.ResponseEntity;                    // HTTP 응답(상태 코드 + 응답 바디)을 포장하는 스프링 타입. 컨트롤러 메서드 반환 타입으로 자주 사용.
import org.springframework.web.bind.annotation.GetMapping;         // HTTP GET 요청을 특정 메서드와 매핑하기 위한 애노테이션 @GetMapping을 사용하기 위해 import.
import org.springframework.web.bind.annotation.RequestMapping;     // 컨트롤러 전체에 공통 URL prefix를 설정하는 @RequestMapping 애노테이션용 import.
import org.springframework.web.bind.annotation.RequestParam;       // 쿼리스트링(?a=1&b=2)을 메서드 파라미터로 바인딩하는 @RequestParam 애노테이션용 import.
import org.springframework.web.bind.annotation.RestController;     // 이 클래스가 REST API 컨트롤러임을 선언하는 @RestController 애노테이션용 import.
import org.springframework.web.client.RestTemplate;                // 서버에서 다른 HTTP 서버(TAGO API 등)에 요청을 보낼 때 사용하는 스프링 제공 HTTP 클라이언트.

// /**
//  * application.yml 예시
//  *
//  * tago:
//  *   bus:
//  *     station:
//  *       base-url: "https://apis.data.go.kr/1613000/BusSttnInfoInqireService"
//  *       service-key: "정류소정보_디코딩키"
//  *     location:
//  *       base-url: "https://apis.data.go.kr/1613000/BusLcInfoInqireService"
//  *       service-key: "버스위치정보_디코딩키"
//  *     arrival:
//  *       base-url: "https://apis.data.go.kr/1613000/ArvlInfoInqireService"
//  *       service-key: "버스도착정보_디코딩키"
//  */
// 위의 블록 주석은 실제 동작 코드가 아니라, application.yml에 어떤 설정값들을 어떤 구조로 넣어야 하는지 예시를 보여주는 문서용 주석이다.
// 예를 들어, tago.bus.station.base-url 이런 경로로 값을 읽어온다는 것을 사람이 이해하기 쉽게 설명해준다.

// ↑ 위 주석은 application.yml 안에 어떤 설정값을 넣어야 하는지 보여주는 예시.
//   아래 @Value 애노테이션들이 이 경로의 설정 값을 읽어온다.
// 이 한 줄 주석 역시 위의 블록 주석이 단지 “예시”라는 점과, @Value와의 연결 관계를 설명해준다.

@RestController                                  // 이 클래스를 REST 컨트롤러로 등록. 메서드 반환값이 뷰 이름이 아니라 JSON/문자열 그대로 HTTP 응답 바디가 된다.
@RequestMapping("/api/bus")                      // 이 컨트롤러의 모든 메서드 URL 앞에 "/api/bus"가 공통 prefix로 붙게 한다. 예: "/stops" → 실제 "/api/bus/stops".
public class ApiController {                     // ApiController 클래스 정의 시작. 버스 관련 TAGO API를 프론트 대신 호출해주는 중간 API 역할을 한다.

    // ───────── TAGO "버스정류소정보 서비스" 설정 (정류장 이름/목록 조회용) ─────────
    @Value("${tago.bus.station.base-url}")       // application.yml에서 tago.bus.station.base-url 키에 해당하는 값을 주입받는다.
    private String stationBaseUrl;               // 정류장 정보 조회 서비스의 기본 URL을 저장하는 필드. 예: BusSttnInfoInqireService 경로까지 포함된 베이스 URL.

    @Value("${tago.bus.station.service-key}")    // application.yml의 tago.bus.station.service-key 값(디코딩 서비스키)을 주입받는다.
    private String stationServiceKey;            // 정류장 정보 조회 API 호출에 사용할 서비스키(디코딩 키)를 저장하는 필드.

    // ───────── TAGO "버스위치정보 조회 서비스" 설정 (노선별 현재 위치용) ─────────
    @Value("${tago.bus.location.base-url}")      // tago.bus.location.base-url 키에서 값을 읽어와 주입한다.
    private String locationBaseUrl;              // 버스 위치 정보 서비스의 베이스 URL. BusLcInfoInqireService와 관련된 API 엔드포인트 앞부분.

    @Value("${tago.bus.location.service-key}")   // tago.bus.location.service-key에서 디코딩 서비스키를 읽어온다.
    private String locationServiceKey;           // 버스 위치 정보 API에 사용할 디코딩 서비스키를 저장하는 필드.

    // ───────── TAGO "버스도착정보 조회 서비스" 설정 (정류장별 도착 예정 정보용) ─────────
    @Value("${tago.bus.arrival.base-url}")       // tago.bus.arrival.base-url 설정값을 주입받는다.
    private String arrivalBaseUrl;               // 버스 도착 정보 조회 서비스의 베이스 URL. ArvlInfoInqireService 관련 엔드포인트 앞부분.

    @Value("${tago.bus.arrival.service-key}")    // tago.bus.arrival.service-key 설정값을 주입받는다.
    private String arrivalServiceKey;            // 버스 도착 정보 조회에 사용할 디코딩 서비스키를 저장하는 필드.

    // 외부 API 호출용 HTTP 클라이언트
    private final RestTemplate rt = new RestTemplate(); // RestTemplate 인스턴스를 하나 생성. 아래 메서드들에서 TAGO API 호출에 공통으로 재사용한다.
    // ↑ RestTemplate 인스턴스를 하나 만들어 두고,
    //   아래 메서드들에서 TAGO API 를 호출할 때 재사용한다.
    // RestTemplate는 스레드 세이프하므로 필드 하나 만들어 계속 쓰는 패턴이 일반적이다.

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
    // 위 블록 주석은 이 아래 메서드(searchStops)가 어떤 역할을 하는지 전체 흐름을 설명한다.
    // 도시코드 기준으로 정류소 목록을 TAGO에서 받아오고, 정류장 이름 검색(keyword)은 백엔드가 아닌 프론트에서 필터링한다는 전략을 기록해 둔 것이다.

    @GetMapping("/stops")    // "/api/bus/stops" 경로로 들어오는 HTTP GET 요청을 이 메서드에 매핑한다.
    public ResponseEntity<?> searchStops(        // searchStops 메서드 정의. 다양한 타입 응답을 포장할 수 있도록 ResponseEntity<?>를 반환 타입으로 사용한다.
            @RequestParam("cityCode") String cityCode,                 // 쿼리스트링에서 반드시 있어야 하는 cityCode 파라미터를 문자열로 받는다. 예: "25".
            @RequestParam(value = "keyword", required = false) String keyword, // keyword 파라미터는 선택(optional). 프론트에서 필터용으로 사용할 뿐 TAGO 요청에는 직접 쓰지 않는다.
            @RequestParam(defaultValue = "1") int pageNo,              // pageNo 쿼리 파라미터를 받는다. 없으면 기본값 1로 처리해 TAGO의 pageNo에 전달.
            @RequestParam(defaultValue = "500") int numOfRows          // numOfRows 쿼리 파라미터를 받는다. 없으면 기본값 500. 한 번에 가져올 정류장 수.
    ) {                                                               // 메서드 파라미터 선언부 끝, 메서드 본문 시작.

        // 쿼리 파라미터들을 URL-safe 하게 인코딩
        String serviceKey      = URLEncoder.encode(stationServiceKey, StandardCharsets.UTF_8); // 디코딩 서비스키를 URL에 넣기 위해 UTF-8로 퍼센트 인코딩한다.
        // ↑ stationServiceKey 안에 +, =, / 같은 문자가 있을 수 있으므로 URLEncoder 로 UTF-8 인코딩
        // 서비스키는 길고 특수문자가 많기 때문에 반드시 인코딩해서 URL에 붙이는 것이 안전하다.

        String encodedCityCode = URLEncoder.encode(cityCode,       StandardCharsets.UTF_8);     // cityCode도 문자열이므로 방어적으로 UTF-8로 인코딩해준다.
        // ↑ cityCode 도 혹시 모르니 UTF-8 URL 인코딩
        // 현재는 숫자지만, 규격이 바뀌거나 다른 값을 쓰더라도 깨지지 않도록 처리.

        // TAGO 정류소 목록 조회 URL 조립
        //  🔥 nodeNm(정류장이름)은 넘기지 않는다 → 도시 전체 목록을 받아서
        //  프론트에서 name으로 필터링하는 전략
        // 여기서 nodeNm을 안 쓰는 이유: API 설계 상, 백엔드에서는 최대치로 받아오고 프론트에서 사용자 입력 기준으로 필터링하게 하기 위해서다.
        String url = String.format(                                                                       // String.format으로 URL을 보기 좋게 포맷팅해서 조립한다.
                "%s/getSttnNoList?serviceKey=%s&cityCode=%s&pageNo=%d&numOfRows=%d&_type=json",           // 실제 요청에 사용할 쿼리 문자열 템플릿. %s, %d 자리에 아래 인자들이 들어간다.
                stationBaseUrl,   // %s → base-url (정류장 조회 서비스 주소). application.yml에서 주입받은 정류장 정보 서비스 베이스 URL.
                serviceKey,       // %s → URL 인코딩된 서비스키. 위에서 URLEncoder.encode로 처리한 값.
                encodedCityCode,  // %s → URL 인코딩된 cityCode. 도시 코드.
                pageNo,           // %d → 페이지 번호. 클라이언트 요청 또는 기본값 1.
                numOfRows         // %d → 한 번에 가져올 행 수. 기본값 500 혹은 사용자가 넘긴 값.
        );

        // 디버그 로그: 어떤 URL 로 TAGO 를 호출하는지와 keyword 를 콘솔에 출력
        System.out.println("[TAGO 정류장검색] URL = " + url + " (keyword=" + keyword + ")"); // 서버 콘솔에 호출 URL과 함께 프론트에서 받은 keyword를 출력해서 디버깅에 사용.

        // 외부 API 호출
        String body = rt.getForObject(url, String.class); // RestTemplate의 getForObject 메서드로 앞에서 만든 URL에 GET 요청을 보내고, 응답 바디를 String으로 받는다.
        // ↑ RestTemplate 을 이용해 GET 요청을 보내고,
        //   응답 바디 전체를 String 형태로 받는다 (JSON 텍스트 그대로).
        // TAGO API가 JSON을 문자열로 주기 때문에 이 문자열을 그대로 프론트로 전달할 수 있다.

        // 프론트로 그대로 반환 (JSON 문자열)
        return ResponseEntity.ok(body);                   // HTTP 200 OK 상태코드를 설정하고, 응답 바디로 body 문자열(JSON 텍스트)을 그대로 돌려준다.
        // ↑ HTTP 200 OK 상태코드와 함께 body 문자열을 그대로 클라이언트에 돌려준다.
        //   프론트(Angular)에서 res.data 로 이 JSON 텍스트를 받아서 파싱/사용한다.
    }                                                     // searchStops 메서드 끝.

    // ─────────────────────────────────────────────
    // 2) 노선별 현재 버스 위치 조회
    //    - TAGO 엔드포인트:
    //      BusLcInfoInqireService/getRouteAcctoBusLcList
    //
    //    호출 예시:
    //      GET /api/bus/location?cityCode=25&routeId=DJB30300039&pageNo=1&numOfRows=100
    //
    //    기존 "/pos" 도 계속 지원하려고 두 경로를 모두 매핑
    // ─────────────────────────────────────────────
    // 이 블록 주석은 아래 getBusPos 메서드가 하는 역할과, TAGO에서 어떤 엔드포인트를 호출하는지, 그리고 옛 URL(/pos)도 같이 매핑한다는 점을 정리해 둔 것이다.

    @GetMapping({"/pos", "/location"})   // "/api/bus/pos"와 "/api/bus/location" 두 URL 패턴의 GET 요청을 이 한 메서드로 처리한다(두 경로를 alias처럼 공유).
    public ResponseEntity<?> getBusPos(  // 노선별 현재 버스 위치 정보를 반환하는 메서드. ResponseEntity<?>로 어떤 타입이든 감싸서 리턴 가능.
            @RequestParam("cityCode") String cityCode,  // 필수 파라미터 cityCode. 예: "25" (대전). TAGO에 그대로 전달.
            @RequestParam("routeId") String routeId,    // 필수 파라미터 routeId. TAGO에서 정의한 버스 노선 ID 값(DJB30300039 등)을 받는다.
            @RequestParam(defaultValue = "1") int pageNo,           // pageNo 파라미터. 없으면 1. TAGO의 pageNo에 그대로 사용.
            @RequestParam(defaultValue = "100") int numOfRows       // numOfRows 파라미터. 없으면 100. 한 번에 가져올 버스 위치 데이터 개수.
    ) {                                                             // getBusPos 메서드 본문 시작.

        // 서비스키, cityCode, routeId 를 URL 에 넣기 위해 각각 UTF-8 인코딩
        String serviceKey      = URLEncoder.encode(locationServiceKey, StandardCharsets.UTF_8); // 위치 정보용 서비스키를 URL에 안전하게 넣기 위해 인코딩.
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);   // cityCode를 UTF-8로 인코딩.
        String encodedRouteId  = URLEncoder.encode(routeId,          StandardCharsets.UTF_8);   // routeId를 UTF-8로 인코딩.

        // TAGO 노선-현재위치 조회 URL 조립
        String url = String.format(                                                                        // String.format을 사용해 가독성 좋은 방식으로 URL을 조립한다.
                "%s/getRouteAcctoBusLcList?serviceKey=%s&cityCode=%s&routeId=%s&pageNo=%d&numOfRows=%d&_type=json", // 노선별 버스 위치 조회 엔드포인트 경로 및 쿼리 템플릿.
                locationBaseUrl,   // %s → 버스 위치 정보 서비스 베이스 URL. application.yml에서 주입받은 값.
                serviceKey,        // %s → 인코딩된 위치 정보 서비스키.
                encodedCityCode,   // %s → 인코딩된 cityCode.
                encodedRouteId,    // %s → 인코딩된 routeId.
                pageNo,            // %d → 페이지 번호.
                numOfRows          // %d → 한 번에 가져올 데이터 개수.
        );

        // TAGO API 호출 → 응답을 문자열로 받음
        String body = rt.getForObject(url, String.class); // RestTemplate으로 위에서 만든 URL로 GET 요청을 보내고, 응답 바디를 String(JSON 텍스트)로 받는다.

        // 어떤 URL 로 호출했는지 로그 출력 (디버깅용)
        System.out.println("[TAGO 노선 위치] URL = " + url); // 실제 호출된 URL을 서버 로그에 찍어, 문제가 생길 때 어떤 파라미터로 호출했는지 확인할 수 있게 한다.
        // System.out.println("[TAGO 노선 위치] 응답 = " + body);
        // ↑ 필요하면 응답 전체를 찍어서 디버깅할 때 사용 (현재는 주석 처리)
        // 응답 바디까지 찍으면 로그가 너무 길어질 수 있어서, 필요할 때만 주석을 풀어 확인하는 용도로 남겨둔 코드.

        // 응답 문자열을 그대로 클라이언트에 전달
        return ResponseEntity.ok(body);           // HTTP 200 OK와 함께 TAGO에서 받은 JSON 문자열을 그대로 프론트엔드에 반환한다.
    }                                             // getBusPos 메서드 끝.

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
    // 이 블록 주석은 아래 getArrival 메서드가 TAGO의 도착 정보 서비스(ArvlInfoInqireService)를 호출하며,
    // 정류장별로 아직 도착하지 않은 버스들의 예정 정보를 가져오는 역할을 한다는 것을 설명한다.

    @GetMapping("/arrival")  // "/api/bus/arrival" 경로의 HTTP GET 요청을 이 메서드에 매핑한다.
    public ResponseEntity<?> getArrival(          // 정류장별 도착 예정 정보를 반환하는 메서드 정의. ResponseEntity<?>로 응답을 포장한다.
            @RequestParam("cityCode") String cityCode,  // 필수 파라미터 cityCode. 어떤 도시의 정류장인지 나타낸다(예: "25").
            @RequestParam("nodeId") String nodeId,      // 필수 파라미터 nodeId. TAGO가 사용하는 정류장 고유 ID.
            @RequestParam(defaultValue = "50") int numOfRows, // 선택 파라미터 numOfRows. 없으면 50개까지 도착 정보를 가져온다.
            @RequestParam(defaultValue = "1") int pageNo      // 선택 파라미터 pageNo. 없으면 1페이지를 요청한다.
    ) {                                                       // getArrival 메서드 본문 시작.

        // 서비스키, cityCode, nodeId 를 URL 에 넣기 위해 각각 UTF-8 인코딩
        String serviceKey      = URLEncoder.encode(arrivalServiceKey, StandardCharsets.UTF_8); // 도착 정보용 디코딩 서비스키를 URL에 넣기 위한 인코딩.
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);  // cityCode를 UTF-8로 인코딩.
        String encodedNodeId   = URLEncoder.encode(nodeId,           StandardCharsets.UTF_8);  // nodeId(정류장 ID)를 UTF-8로 인코딩.

        // TAGO 정류장별 도착정보 조회 URL 조립
        String url = String.format(                                                                         // String.format으로 도착 정보 API 호출 URL을 조립한다.
                "%s/getSttnAcctoArvlPrearngeInfoList?serviceKey=%s&cityCode=%s&nodeId=%s&numOfRows=%d&pageNo=%d&_type=json",
                arrivalBaseUrl,   // %s → 버스 도착 정보 서비스 베이스 URL. application.yml에서 주입받은 값.
                serviceKey,       // %s → 인코딩된 도착 정보 서비스키.
                encodedCityCode,  // %s → 인코딩된 cityCode.
                encodedNodeId,    // %s → 인코딩된 nodeId.
                numOfRows,        // %d → 한 번에 가져올 도착 정보 개수.
                pageNo            // %d → 페이지 번호.
        );

        // TAGO API 호출 → 응답을 문자열로 받음
        String body = rt.getForObject(url, String.class); // RestTemplate을 사용해 위 URL로 GET 요청을 보내고, 응답 바디(JSON 문자열)를 String으로 받는다.

        // 어떤 URL 로 호출했는지 로그 출력 (디버깅용)
        System.out.println("[TAGO 도착정보] URL = " + url); // 실제 호출한 URL을 서버 콘솔에 찍어서, 문제가 생길 경우 파라미터를 확인할 수 있게 한다.
        // System.out.println("[TAGO 도착정보] 응답 = " + body);
        // ↑ 필요하면 응답 전체를 찍어서 디버깅할 때 사용
        // 응답(body)까지 출력하면 로그가 너무 길어질 수 있기에, 필요할 때만 주석을 풀고 확인하도록 한다.

        // 응답 문자열을 그대로 클라이언트에 전달
        return ResponseEntity.ok(body);      // HTTP 200 OK와 함께 TAGO에서 받은 JSON 문자열을 프론트엔드로 그대로 반환한다.
    }                                        // getArrival 메서드 끝.
}                                            // ApiController 클래스 정의 끝.
