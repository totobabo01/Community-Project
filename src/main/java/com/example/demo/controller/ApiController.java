package com.example.demo.controller;                 // 이 클래스가 속한 패키지 선언. 패키지명은 보통 도메인 역순+프로젝트 구조로 구성.

import org.springframework.beans.factory.annotation.Value;         // application.yml(또는 properties) 값 주입에 사용하는 애너테이션 @Value
import org.springframework.http.ResponseEntity;                    // HTTP 응답 본문/상태코드 등을 표현하는 스프링 타입
import org.springframework.web.bind.annotation.GetMapping;         // HTTP GET 요청을 매핑하는 애너테이션
import org.springframework.web.bind.annotation.RequestMapping;     // 클래스 레벨에서 공통 URL 경로를 매핑하는 애너테이션
import org.springframework.web.bind.annotation.RequestParam;        // 쿼리 파라미터를 메서드 인자로 바인딩하는 애너테이션
import org.springframework.web.bind.annotation.RestController;      // REST API 컨트롤러를 의미. @Controller + @ResponseBody 조합과 동일
import org.springframework.web.client.RestTemplate;                 // 외부 HTTP API를 호출하기 위한 동기식 클라이언트
// @RestController : Spring MVC에서 사용하는 애너테이션으로, 이 클래스를 REST API 전용 컨트롤러로 등록
// 애너테이션: 자바에서 애너테이션(Annotation) 은 클래스, 메서드, 변수, 파라미터 등에 “메타데이터(부가 정보)”를 달아주는 문법

@RestController                              // 해당 클래스를 REST 컨트롤러로 등록(스프링 빈 + JSON 반환 기본)
// @RequestMapping : Spring MVC에서 제공하는 애너테이션으로, 클라이언트의 요청 URL을 특정 컨트롤러 메서드와 연결(매핑)시켜준다.
@RequestMapping("/api/bus")                  // 이 컨트롤러의 모든 핸들러 메서드는 "/api/bus" 경로 하위로 매핑됨
public class ApiController {                 // 버스 관련 API 엔드포인트를 제공하는 컨트롤러 클래스
    // @Value: 스프링이 관리하는 객체에 외부 값(설정, 환경변수 등)을 자동으로 주입해주는 도구
    @Value("${daegu.base-url}")              // application.yml의 daegu.base-url 값을 주입
    private String baseUrl;                  // 대구 공공데이터 API의 기본 URL (예: getBasic02 같은 엔드포인트)

    @Value("${daegu.service-key}")           // application.yml의 daegu.service-key 값을 주입
    private String serviceKey;               // 공공데이터 포털에서 발급받은 서비스 키 (이미 URL-인코딩된 형태라고 가정)
    // RestTemplate: 자바 코드에서 외부 REST API 서버와 HTTP 요청·응답을 주고받을 수 있게 도와주는 도구
    private final RestTemplate rt = new RestTemplate(); // 간단 사용을 위해 RestTemplate 인스턴스를 직접 생성(프로덕션에선 Bean 주입 권장)
    // @GetMapping: Spring MVC에서 제공하는 애너테이션으로, HTTP GET 요청을 특정 메서드와 매핑 해주는 역할
    @GetMapping("/stops")                    // GET /api/bus/stops 요청을 이 메서드로 라우팅
    // ResponseEntity = HTTP 응답을 더 세밀하게 제어하는 클래스
    // <?> = 제네릭에서 모든 타입을 받아들일 수 있는 와일드카드
    public ResponseEntity<?> getStops(       // 반환 타입은 ResponseEntity<?> : 어떤 타입이든 담을 수 있는 HTTP 응답 래퍼
            // pageNo → 클라이언트(브라우저나 앱)가 몇 번째 페이지를 요청했는지 나타내는 값 
            // numOfRows → 컨트롤러 메서드 안에서 한 페이지에 몇 개의 데이터를 가져올지를 정하는 변수
            // @RequestParam = HTTP 요청 파라미터 값을 자바 메서드 변수로 바인딩하는 애너테이션
            @RequestParam(defaultValue = "1") int pageNo,      // 쿼리 파라미터 pageNo (없으면 기본값 1)
            @RequestParam(defaultValue = "500") int numOfRows  // 쿼리 파라미터 numOfRows (없으면 기본값 500)
    ) {
        // ✅ Encoding 없이 그대로 사용
        // 위에서 serviceKey가 "이미 URL-인코딩된 키"라고 가정하므로, 여기서 다시 인코딩하면 안 됨(이중 인코딩 위험).
        // 아래 String.format으로 최종 호출 URL을 조립.
        String url = String.format(
                "%s?serviceKey=%s&_type=json&pageNo=%d&numOfRows=%d",  // _type=json: 응답 형식을 JSON으로 요청
                baseUrl, serviceKey, pageNo, numOfRows                  // 자리표시자(%s, %d)에 실제 값 삽입
        );

        // 외부 API 호출
        // rt.getForObject(url, String.class) = URL로 GET 요청 보내고, 응답 body를 String으로 반환
        String body = rt.getForObject(url, String.class);   // RestTemplate로 GET 호출 후, 응답 본문을 String으로 수신(에러면 예외 발생)

        // 디버그 로그
        System.out.println("최종 호출 URL: " + url);        // 실제 최종적으로 호출된 URL을 콘솔에 출력(디버깅용)
        System.out.println("API 응답: " + body);            // 응답 본문을 콘솔에 출력(개발 단계에서 확인용)

        return ResponseEntity.ok(body);                     // HTTP 200 OK로 수신한 본문을 그대로 클라이언트에게 반환
    }
}
