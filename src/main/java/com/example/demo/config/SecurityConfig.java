package com.example.demo.config;                           // 보안 설정 클래스가 위치한 패키지

import org.springframework.context.annotation.Bean;        // @Bean 애너테이션 사용(스프링 빈 등록)
import org.springframework.context.annotation.Configuration;// @Configuration 구성 클래스 표시
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity; // 메서드 수준 보안(@PreAuthorize 등)
import org.springframework.security.config.annotation.web.builders.HttpSecurity; // HTTP 보안 설정용 DSL
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity; // 웹 보안 활성화
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder; // 비밀번호 암호화 구현체
import org.springframework.security.crypto.password.PasswordEncoder; // 비밀번호 인코더 인터페이스
import org.springframework.security.web.SecurityFilterChain; // 시큐리티 필터 체인 빈 타입
import org.springframework.security.web.util.matcher.AntPathRequestMatcher; // 경로/메서드 매칭 유틸

@Configuration                                             // 이 클래스를 스프링 설정(구성) 클래스로 등록
@EnableWebSecurity                                         // Spring Security의 웹 보안 필터 체인 활성화
@EnableMethodSecurity                                      // @PreAuthorize/@PostAuthorize 등 메서드 보안 활성화
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {             // 비밀번호 인코더 빈 등록
        return new BCryptPasswordEncoder();                // BCrypt 해시 사용(권장)
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception { // HTTP 보안 규칙 정의
        http
            // 인가(접근 권한) 규칙
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(                         // 아래 경로들은 인증 없이 허용
                    "/login", "/logout",                  // 로그인/로그아웃 화면 및 엔드포인트
                    "/signup",                            // 회원가입 화면/처리
                    "/error", "/error/**",                // 오류 페이지
                    "/favicon.ico",                       // 파비콘
                    "/css/**", "/js/**", "/images/**",    // 정적 리소스
                    "/lib/**", "/angular-route.js", "/app.js" // 프론트 라이브러리/앱 스크립트
                ).permitAll()

                .requestMatchers("/api/bus/**").permitAll()        // 공개 API: 버스 프록시 등은 무조건 허용

                .requestMatchers("/api/me").authenticated()         // 현재 사용자 조회 API는 로그인 필요
                .requestMatchers("/users/**", "/user/**").authenticated() // ★ DB 사용자 관리 API: 로그인만 필요

                .requestMatchers("/api/roles/**").hasRole("ADMIN")  // ★ 권한 관리 API는 관리자만 접근

                .anyRequest().authenticated()                       // 그 외 모든 요청은 인증 필요
            )

            // 로그인 설정
            .formLogin(form -> form
                .loginPage("/login")                     // 사용자 정의 로그인 페이지(GET)
                .loginProcessingUrl("/login")            // 로그인 처리 URL(POST; 스프링이 가로채서 인증)
                .defaultSuccessUrl("/index.html", true)  // 성공 시 항상 index.html로 이동(true=무조건)
                .failureUrl("/login?error")              // 실패 시 이동할 URL
                .permitAll()                             // 로그인 관련 경로는 모두 허용
            )

            // 로그아웃 설정 (개발 편의상 GET 허용)
            .logout(logout -> logout
                .logoutRequestMatcher(                   // 기본은 POST /logout 이지만
                    new AntPathRequestMatcher("/logout", "GET") // GET /logout 도 허용(개발용)
                )
                .logoutSuccessUrl("/login")              // 로그아웃 성공 후 이동 경로
                .invalidateHttpSession(true)             // 서버 세션 무효화
                .deleteCookies("JSESSIONID")             // 세션 쿠키 삭제
                .permitAll()                             // 로그아웃 엔드포인트 접근 허용
            )

            // CSRF 설정: 개발 편의로 일부 경로만 예외
            .csrf(csrf -> csrf.ignoringRequestMatchers(
                new AntPathRequestMatcher("/api/**"),    // API 요청 전반은 CSRF 검사 제외(실습/개발 편의)
                new AntPathRequestMatcher("/signup"),    // 회원가입 처리 경로 제외
                new AntPathRequestMatcher("/logout"),    // GET 로그아웃 허용 시 CSRF 제외 필요
                new AntPathRequestMatcher("/users/**"),  // DB 사용자 관리(API/페이지) 편의상 제외
                new AntPathRequestMatcher("/user/**")    // 단수 경로도 같이 제외(프런트 호출 대비)
            ));

        return http.build();                              // 구성한 필터 체인을 빈으로 반환
    }
}
