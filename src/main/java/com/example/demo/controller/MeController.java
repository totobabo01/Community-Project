// src/main/java/com/example/demo/controller/MeController.java            // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.controller;                                     // 컨트롤러 클래스가 속한 패키지(네임스페이스)

// ───────────────────────────────────────────────────────────────────────
// JDK & Stream
// ───────────────────────────────────────────────────────────────────────
import java.util.List;                                                    // 권한 목록 등 다건 데이터 표현용 컬렉션
import java.util.stream.Collectors;                                       // Stream → List 변환을 위한 collect(…)

import org.springframework.http.ResponseEntity;                           // 상태코드/헤더/바디를 함께 전달하는 응답 래퍼
import org.springframework.security.authentication.AnonymousAuthenticationToken; // 익명 사용자 토큰 타입
import org.springframework.security.core.Authentication;                  // 현재 인증 주체/권한을 담는 컨테이너
import org.springframework.security.core.GrantedAuthority;                // "ROLE_XYZ" 같은 권한 표현 인터페이스
import org.springframework.web.bind.annotation.GetMapping;                // HTTP GET 요청 매핑
import org.springframework.web.bind.annotation.RestController;            // @Controller + @ResponseBody = JSON 컨트롤러

/**
 * 현재 로그인한 사용자 정보를 내려주는 컨트롤러.
 * - 미인증/익명: 401
 * - 인증됨: { username, authorities[], admin } JSON
 */
@RestController                                                           // JSON 바디를 기본 반환하는 REST 컨트롤러 선언
public class MeController {

    /** 응답 DTO (Java 16+ record; 구버전이면 일반 static class로 작성) */
    // record는 자바(정식: Java 16+)의 데이터 전용 불변 클래스를 만드는 키워드
    public static record MeResponse(                                      // 간결한 불변 DTO 선언
            String username,                                              // 사용자명(Principal; Authentication.getName())
            // authorities는 Spring Security에서 사용자에게 부여된 권한 목록
            List<String> authorities,                                     // 권한 문자열 목록(예: ["ROLE_USER","ROLE_ADMIN"])
            boolean admin                                                 // 관리자 여부(true if ROLE_ADMIN)
    ) {}                                                                  // record 본문 끝

    @GetMapping("/api/me")                                                // GET /api/me 엔드포인트 매핑
    public ResponseEntity<?> me(Authentication auth) {                    // 스프링이 현재 Authentication을 주입
        // (1) 인증 객체가 없거나 (2) 인증되지 않았거나 (3) 익명 토큰이면 401 처리
        // isAuthenticated()는 “지금 요청한 사용자(주체)가 익명(anonymous)이 아니라면 true” 를 의미
        if (auth == null || !auth.isAuthenticated()                       // 인증 자체가 안 됐거나
        // AnonymousAuthenticationToken는 “로그인 안 한 사용자(익명 사용자)”를 표준화해서 담아두는 Spring Security의 Authentication 구현체
                || auth instanceof AnonymousAuthenticationToken) {         // 익명 사용자인 경우
            // build()는 Builder 패턴에서 “설정 끝! 이제 실제 객체를 만들어줘” 라는 마지막 단계 메서드
            return ResponseEntity.status(401).build();                    // 401 Unauthorized(본문 없음)
        }

        // 현재 사용자 권한 컬렉션에서 문자열만 추출
        // getAuthorities()는 Spring Security에서 현재 주체(사용자)가 가진 권한 목록을 가져오는 메서드
        List<String> authorities = auth.getAuthorities()                   // Collection<? extends GrantedAuthority>
                .stream()                                                 // 스트림으로 변환
                .map(GrantedAuthority::getAuthority)                      // "ROLE_XYZ" 문자열로 매핑
                .collect(Collectors.toList());                            // List<String>으로 수집

        boolean isAdmin = authorities.contains("ROLE_ADMIN");             // 관리자 권한 포함 여부 체크

        // 200 OK로 MeResponse JSON 반환
        return ResponseEntity.ok(new MeResponse(                          // 바디에 DTO 넣어 성공 응답
                auth.getName(),                                           // principal 이름(userId 또는 email; 설정에 따름)
                authorities,                                              // 권한 리스트
                isAdmin                                                   // 관리자 플래그
        ));
    }
}
