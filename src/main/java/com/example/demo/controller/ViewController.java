package com.example.demo.controller;                 // 이 컨트롤러 클래스가 속한 패키지. 컴포넌트 스캔/임포트 경로 기준.

import org.springframework.stereotype.Controller;    // 스프링 MVC의 뷰 컨트롤러(뷰 이름을 반환) 스테레오타입 애너테이션.
import org.springframework.web.bind.annotation.GetMapping; // HTTP GET 요청을 메서드와 매핑하는 애너테이션.

/**
 * 뷰 전용 컨트롤러
 *
 * 현재 흐름
 * - 정적 대시보드:  /index.html  (src/main/resources/static/index.html)
 * - 로그인 화면:   /login       (src/main/resources/templates/login.html)
 * - 회원가입 화면: /signup      (AuthController에서 처리)
 *
 * 루트("/")로 오면 정적 index.html로 리다이렉트합니다.
 */                                                   // 클래스 목적과 라우팅 흐름을 문서화한 주석. 유지보수 시 매우 유용.
@Controller                                          // 이 클래스를 Spring MVC 컨트롤러로 등록(뷰 이름 반환 방식 사용).
public class ViewController {

    /** 루트 → 정적 index.html */                     // "/" 요청을 정적 대시보드로 보내는 역할 설명.
    @GetMapping("/")                                  // HTTP GET / 요청을 아래 메서드와 매핑.
    public String root() {                            // 반환 타입이 String이면 "뷰 이름" 또는 "redirect:" 규칙을 의미.
        return "redirect:/index.html";                // 브라우저에 302 리다이렉트 명령. 정적 파일(static/index.html)로 이동.
    }

    /** 로그인 화면 (Thymeleaf 템플릿) */               // /login은 템플릿(서버 렌더링)으로 응답한다는 설명.
    @GetMapping("/login")                             // HTTP GET /login 요청을 아래 메서드와 매핑.
    public String login() {                           // 뷰 이름을 반환하는 핸들러(모델 데이터 필요 없으므로 파라미터 없음).
        return "login";                               // 뷰 이름 "login" → 보통 templates/login.html 을 찾아 렌더링(Thymeleaf 등).
    }

    // ⚠️ /signup 은 AuthController가 담당하므로 여기서는 제거!  // 중복 매핑 방지 안내. /signup은 AuthController의 GET/POST가 처리.
}
