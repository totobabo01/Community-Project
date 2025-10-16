// src/main/java/com/example/demo/controller/MeController.java  // 소스 파일 경로(패키지 구조와 일치해야 IDE/빌드가 정상 인식).

package com.example.demo.controller;                           // 컨트롤러가 속한 패키지. 컴포넌트 스캔/임포트 기준.

import java.util.List;                                         // List 컬렉션(권한 목록 전달용).
import java.util.Map;                                          // 간단한 키-값 JSON 응답 생성을 위해 사용(Map.of).
import java.util.stream.Collectors;                            // 스트림 -> 컬렉션 변환(권한 문자열 추출에 사용).

import org.springframework.http.ResponseEntity;                // HTTP 상태코드+본문을 함께 반환하는 래퍼 타입.
import org.springframework.security.authentication.AnonymousAuthenticationToken; // 익명 인증 토큰 타입.
import org.springframework.security.core.Authentication;       // 현재 인증 주체(Principal)와 권한, 인증여부 등을 담는 인터페이스.
import org.springframework.security.core.GrantedAuthority;     // 권한 한 건을 표현하는 인터페이스.
import org.springframework.web.bind.annotation.GetMapping;     // HTTP GET 요청 매핑 애너테이션.
import org.springframework.web.bind.annotation.RestController;  // @Controller + @ResponseBody (JSON 반환) 합친 스테레오타입.

@RestController                                                // 이 클래스를 REST 컨트롤러로 등록(메서드 반환값을 JSON으로 직렬화).
public class MeController {

    /**
     * 로그인한 사용자의 기본 정보 조회 엔드포인트
     * - 미인증: 401 반환
     * - 인증됨: { username, authorities[], isAdmin } JSON 반환
     *
     * 프론트에서는:
     *  - username: 화면 우측 상단 인사말 표시에 사용
     *  - authorities: 권한 배열(예: ["ROLE_USER", "ROLE_ADMIN"])
     *  - isAdmin: true/false (권한 탭 노출 여부 판단에 바로 사용 가능)
     */
    @GetMapping("/api/me")                                     // GET /api/me 요청을 이 메서드에 매핑.
    public ResponseEntity<?> me(Authentication auth) {         // 스프링이 시큐리티 컨텍스트에서 Authentication을 주입.
        // (1) 인증 객체가 없거나 (2) 인증 플래그가 false 이거나 (3) 익명 토큰이면 → 401
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(401).build();         // 본문 없이 401 Unauthorized 반환(인증 필요).
        }

        // 권한 문자열 목록 추출 (예: ["ROLE_USER"] 또는 ["ROLE_USER","ROLE_ADMIN"])
        List<String> authorities = auth.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)           // 각 권한 객체 → 문자열로
                .collect(Collectors.toList());

        // 관리자 여부 편의 플래그
        boolean isAdmin = authorities.contains("ROLE_ADMIN");

        // 200 OK + JSON 응답
        return ResponseEntity.ok(Map.of(
                "username", auth.getName(),                    // 현재 인증 주체의 이름(대개 user_name)
                "authorities", authorities,                    // 권한 목록
                "isAdmin", isAdmin                             // 관리자 여부(프론트에서 탭 노출 제어에 사용)
        ));
    }
}
