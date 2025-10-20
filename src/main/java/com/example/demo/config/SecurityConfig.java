// src/main/java/com/example/demo/config/SecurityConfig.java
package com.example.demo.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
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
      // ───────────────── 인가 규칙 ─────────────────
      .authorizeHttpRequests(auth -> auth
        // 정적 리소스 & 공개 페이지
        .requestMatchers(
          "/", "/index.html",
          "/login", "/signup", "/logout",
          "/error", "/error/**", "/favicon.ico"
        ).permitAll()
        .requestMatchers(
          "/css/**", "/js/**", "/images/**", "/lib/**",
          // SPA 템플릿(Angular partials)
          "/users-new.html", "/roles.html", "/db-users.html", "/tpl/**",
          // 앱 스크립트(경로에 맞춰 유지)
          "/app.js"
        ).permitAll()

        // 외부 공개 API (버스 조회는 누구나)
        .requestMatchers("/api/bus/**").permitAll()

        // 인증 필요 API
        .requestMatchers("/api/me").authenticated()
        .requestMatchers(HttpMethod.GET, "/api/menus").authenticated()
        .requestMatchers("/api/boards/**", "/api/posts/**", "/api/comments/**").authenticated()
        .requestMatchers("/api/users/**", "/users/**", "/user/**").authenticated()
        .requestMatchers(HttpMethod.GET, "/api/roles").authenticated()

        // 관리자 전용
        .requestMatchers("/api/roles/**", "/api/admin/**").hasRole("ADMIN")

        // 그 외는 인증 요구 (원치 않으면 .permitAll() 로 완화)
        .anyRequest().authenticated()
      )

      // ───────────────── 인증 진입점: /api/** 미인증 시 401 ─────────────────
      .exceptionHandling(ex -> ex
        .defaultAuthenticationEntryPointFor(
          new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
          new AntPathRequestMatcher("/api/**"))
      )

      // ───────────────── 폼 로그인 ─────────────────
      .formLogin(form -> form
        .loginPage("/login")
        .loginProcessingUrl("/login")
        .usernameParameter("username")
        .passwordParameter("password")
        .defaultSuccessUrl("/index.html", true) // 로그인 후 SPA 진입
        .failureUrl("/login?error")
        .permitAll()
      )

      // ───────────────── 로그아웃 (개발 편의상 GET 허용) ─────────────────
      .logout(logout -> logout
        .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "GET"))
        .logoutSuccessUrl("/login")
        .invalidateHttpSession(true)
        .deleteCookies("JSESSIONID")
        .permitAll()
      )

      // ───────────────── CSRF: API는 제외 ─────────────────
      .csrf(csrf -> csrf.ignoringRequestMatchers(
        new AntPathRequestMatcher("/signup"),
        new AntPathRequestMatcher("/logout"),
        new AntPathRequestMatcher("/user/**"),
        new AntPathRequestMatcher("/users/**"),
        new AntPathRequestMatcher("/api/**")
      ));

    return http.build();
  }
}
