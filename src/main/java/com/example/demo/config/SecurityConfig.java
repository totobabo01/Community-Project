package com.example.demo.config;                                  // 보안 설정 클래스의 패키지 경로. @ComponentScan/임포트 경로 기준.

import org.springframework.context.annotation.Bean;               // @Bean 애너테이션(스프링 빈 등록)을 사용하기 위한 임포트.
import org.springframework.context.annotation.Configuration;       // @Configuration(자바 기반 구성 클래스 표시) 애너테이션 임포트.
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity; // WebSecurity 활성화 스위치.
import org.springframework.security.config.annotation.web.builders.HttpSecurity;            // http 보안 정책을 정의하는 핵심 빌더.
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;                    // BCrypt 해시 구현체.
import org.springframework.security.crypto.password.PasswordEncoder;                       // 패스워드 해시 전략 인터페이스.
import org.springframework.security.web.SecurityFilterChain;       // 시큐리티 필터 체인 빈 타입(스프링 시큐리티 6 표준).
import org.springframework.security.web.util.matcher.AntPathRequestMatcher; // 경로/HTTP 메서드 매칭 유틸(로그아웃 GET 허용 등).
// @Configuration은 “자바 코드로 스프링 설정을 적겠다”는 표시
@Configuration                                                     // 이 클래스가 스프링 설정(구성) 클래스임을 선언.
// @EnableWebSecurity는 스프링 애플리케이션에 Spring Security를 켜는 스위치
@EnableWebSecurity                                                 // 웹 시큐리티 필터 체인을 활성화. (스프링 부트는 자동 활성화되지만 명시적 선언 OK)
public class SecurityConfig {

    /** 비밀번호 해시 */                                           // PasswordEncoder 빈 정의 섹션 설명용 주석.
    @Bean                                                          // 스프링 컨테이너에 PasswordEncoder 빈 등록.
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();                        // BCrypt 해시 사용(추천). strength 기본값(10) 사용.
    }

    /**
     * 보안 정책
     * - 공개: /login, /signup, /error, 파비콘, 정적 리소스
     * - 공개(API): /api/bus/** (외부공공데이터 프록시용)
     * - 인증 필요(API): /api/me  (로그인 사용자명 조회)
     * - 나머지 전체 인증 필요(예: /, /index.html)
     * - 로그인 성공 시 항상 /index.html 로 이동
     * - 개발 편의: GET /logout 허용(운영에선 POST 권장)
     * - 개발 편의: /api/**, /signup, /logout 은 CSRF 제외
     */                                                             // 전체 정책 개요 주석(문서화).
    @Bean                                                          // SecurityFilterChain을 빈으로 등록(스프링 시큐리티 6의 표준 진입점).
    // SecurityFilterChain은 **Spring Security가 HTTP 요청을 처리할 때 거쳐 가는 ‘보안 필터들의 묶음
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http                                                       // HttpSecurity DSL 체이닝 시작.
            .authorizeHttpRequests(auth -> auth                    // 인가(접근 권한) 규칙 블록.
                .requestMatchers(                                  // 특정 경로들을 선정하여
                    "/login", "/logout",                           // 로그인 페이지 및 로그아웃 엔드포인트는
                    "/signup",                                     // 회원가입 페이지
                    "/error", "/error/**",                         // 오류 페이지/하위 경로
                    "/favicon.ico",                                // 파비콘
                    "/css/**", "/js/**", "/images/**",             // 정적 리소스(CSS/JS/이미지)
                    "/lib/**", "/angular-route.js", "/app.js"      // 라이브러리 및 앱 스크립트(AngularJS 등)
                    // permitAll()은 해당 요청 경로를 인증 없이 모두에게 허용하라는 Spring Security 설정
                ).permitAll()                                      // 위 경로들은 모두 인증 없이 접근 허용.

                // 공개 API (버스 데이터 프록시)
                .requestMatchers("/api/bus/**").permitAll()        // 외부 공공데이터 프록시 API는 공개(비로그인 접근 허용).

                // 로그인 사용자 정보는 인증 필요
                // authenticated() 는 해당 요청은 “로그인한 사용자만” 접근 허용하라는 Spring Security 규칙
                .requestMatchers("/api/me").authenticated()        // /api/me는 반드시 인증된 사용자만 접근 가능.

                // 그 외 전부 인증
                .anyRequest().authenticated()                      // 명시되지 않은 나머지 모든 요청은 인증 요구.
            )
            .formLogin(form -> form                                // 폼 로그인 설정 블록(UsernamePasswordAuthenticationFilter 경로 등).
                .loginPage("/login")                               // 커스텀 로그인 페이지 경로(GET). 실패 시 리다이렉트 대상도 여기 기준.
                .loginProcessingUrl("/login")                      // 로그인 처리 POST URL(스프링이 가로채 인증 수행).
                .defaultSuccessUrl("/index.html", true)            // 인증 성공 후 항상 지정 경로로 이동(두 번째 인자 true=항상 강제).
                .failureUrl("/login?error")                        // 인증 실패 시 이동할 경로(쿼리 파라미터로 상태 전달).
                .permitAll()                                       // 로그인 관련 경로 자체는 누구나 접근 가능.
            )
            .logout(logout -> logout                               // 로그아웃 설정 블록.
                // 정적 페이지에서의 편의 로그아웃(GET). 운영 전환 시 POST 권장.
                .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "GET"))
                                                                    // 기본은 POST /logout이지만, 개발 편의를 위해 GET 허용.
                                                                    // CSRF 보호 관점에서 운영환경에선 POST + CSRF 토큰 사용 권장.
                .logoutSuccessUrl("/login")                        // 로그아웃 성공 후 이동 경로.
                .invalidateHttpSession(true)                       // 세션 무효화(JSESSIONID에 담긴 서버 세션 제거).
                .deleteCookies("JSESSIONID")                       // 브라우저 쿠키도 삭제(세션 식별자 제거).
                .permitAll()                                       // 로그아웃 엔드포인트 접근 허용.
            )
            // 개발 단계: API/회원가입/로그아웃은 CSRF 제외
            // ignoringRequestMatchers는(보통 web.ignoring().requestMatchers(...) 형태) 지정한 경로를 아예 Spring Security 필터 체인 밖으로 빼버리는 설정
            // .csrf(...)는 Spring Security에서 CSRF 보호 설정을 다루는 DSL
            .csrf(csrf -> csrf.ignoringRequestMatchers("/api/**", "/signup", "/logout"));
                                                                    // CSRF 보호 예외 경로 지정.
                                                                    // REST API(/api/**), 회원가입 폼(/signup), 로그아웃(/logout)을 CSRF 검사 제외.
                                                                    // 주의: 운영환경에서는 가능한 POST/PUT/DELETE에만 제한적으로 예외를 주거나 토큰 사용을 고려.
        return http.build();                                        // 구성 완료된 SecurityFilterChain을 빈으로 리턴.
    }
}
