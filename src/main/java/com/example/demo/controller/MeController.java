// src/main/java/com/example/demo/controller/MeController.java
package com.example.demo.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 현재 로그인한 사용자 정보를 내려주는 컨트롤러.
 * - 미인증/익명: 401
 * - 인증됨: { username, authorities[], admin } JSON
 */
@RestController
public class MeController {

    /** 응답 DTO (Java 16+ record; 구버전이면 일반 클래스 사용) */
    public static record MeResponse(
            String username,
            List<String> authorities,
            boolean admin
    ) {}

    @GetMapping("/api/me")
    public ResponseEntity<?> me(Authentication auth) {
        // (1) 인증 객체가 없거나 (2) 인증되지 않았거나 (3) 익명 토큰이면 401
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(401).build();
        }

        // 권한 문자열 목록 추출 (예: ["ROLE_USER"], ["ROLE_USER", "ROLE_ADMIN"])
        List<String> authorities = auth.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

        boolean isAdmin = authorities.contains("ROLE_ADMIN");

        // 200 OK + JSON
        return ResponseEntity.ok(new MeResponse(
                auth.getName(),
                authorities,
                isAdmin
        ));
    }
}
