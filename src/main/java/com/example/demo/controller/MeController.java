// src/main/java/com/example/demo/controller/MeController.java // 소스 파일 경로(패키지 구조와 일치해야 IDE/빌드가 정상 인식).

package com.example.demo.controller;                      // 컨트롤러가 속한 패키지. 컴포넌트 스캔/임포트 기준.

import java.util.Map;           // HTTP 상태코드+본문을 함께 반환하는 래퍼 타입.

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;   // 현재 인증 주체(Principal)와 권한, 인증여부 등을 담는 인터페이스.
import org.springframework.security.core.Authentication; // HTTP GET 요청 매핑 애너테이션.
import org.springframework.web.bind.annotation.GetMapping; // @Controller + @ResponseBody (JSON 반환) 합친 스테레오타입.
import org.springframework.web.bind.annotation.RestController;                                     // 간단한 키-값 JSON 응답 생성을 위해 사용(Map.of).

@RestController                                           // 이 클래스를 REST 컨트롤러로 등록(메서드 반환값을 JSON으로 직렬화).
public class MeController {

    @GetMapping("/api/me")                                // GET /api/me 요청을 이 메서드에 매핑.
    public ResponseEntity<?> me(Authentication auth) {    // 스프링이 시큐리티 컨텍스트에서 Authentication을 주입.
                                                          // 반환 타입은 ResponseEntity<?>: 상황에 따라 다른 상태/본문을 유연하게 반환.
        if (auth == null                                  // (1) 인증 객체가 아예 없거나
            || !auth.isAuthenticated()                    // (2) 인증 플래그가 false이거나
            || auth instanceof AnonymousAuthenticationToken) { // (3) 익명 토큰(로그인 안 한 상태)이면
            return ResponseEntity.status(401).build();    // 본문 없이 401 Unauthorized 반환. (인증 필요)
        }
        return ResponseEntity.ok(Map.of(                  // 위 조건이 아니면 정상 인증된 사용자 → 200 OK + JSON 응답.
                "username", auth.getName()                // 현재 인증 주체의 이름(대개 username)을 JSON으로 전달.
        ));
    }
}
