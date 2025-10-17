// src/main/java/com/example/demo/config/SecurityConfig.java
package com.example.demo.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
      // 1) 인가 규칙
      .authorizeHttpRequests(auth -> auth
        // 정적 리소스 & 공개 페이지(라우트 이동은 누구나 가능)
        .requestMatchers(
          "/", "/index.html",
          "/login", "/signup", "/logout",
          "/error", "/error/**", "/favicon.ico",
          "/css/**", "/js/**", "/images/**", "/lib/**",
          "/angular-route.js", "/app.js",
          // Angular 템플릿(예: roles/db-users 같은 라우트 파일)
          "/users-new.html", "/roles.html", "/db-users.html"
        ).permitAll()

        // 외부 공개 API(예: 버스 조회)
        .requestMatchers("/api/bus/**").permitAll()

        // 로그인 필요 리소스
        .requestMatchers("/api/me").authenticated()
        .requestMatchers("/api/users/**", "/users/**", "/user/**").authenticated()

        // 권한 API 정책
        // - GET /api/roles : 로그인 사용자(권한 뱃지 표시 용도)
        .requestMatchers(HttpMethod.GET, "/api/roles").authenticated()
        // - 그 외 /api/roles/** (POST/PUT/DELETE 등)와 /api/admin/** : 관리자만
        .requestMatchers("/api/roles/**", "/api/admin/**").hasRole("ADMIN")

        // 그 외 전부 공개(라우트/HTML 등). 필요 시 authenticated()로 조정 가능
        .anyRequest().permitAll()
      )

      // 2) 폼 로그인
      .formLogin(form -> form
        .loginPage("/login")                     // GET: 로그인 페이지
        .loginProcessingUrl("/login")            // POST: 스프링이 처리
        .usernameParameter("username")
        .passwordParameter("password")
        .defaultSuccessUrl("/index.html", true)  // 로그인 성공 시 항상 index로
        .failureUrl("/login?error")
        .permitAll()
      )

      // 3) 로그아웃 (개발 편의상 GET 허용)
      .logout(logout -> logout
        .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "GET"))
        .logoutSuccessUrl("/login")
        .invalidateHttpSession(true)
        .deleteCookies("JSESSIONID")
        .permitAll()
      )

      // 4) CSRF
      // API(특히 Angular에서 호출하는 쓰기 엔드포인트)는 CSRF 예외 처리
      .csrf(csrf -> csrf.ignoringRequestMatchers(
        new AntPathRequestMatcher("/signup"),
        new AntPathRequestMatcher("/logout"),
        new AntPathRequestMatcher("/user/**"),
        new AntPathRequestMatcher("/users/**"),
        new AntPathRequestMatcher("/api/**") // 전체 API를 예외로(버스/기타 포함)
      ));

    return http.build();
  }
}
