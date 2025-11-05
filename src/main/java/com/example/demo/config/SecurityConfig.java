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
      .authorizeHttpRequests(auth -> auth
        // 0) CORS 프리플라이트 허용(필요 시)
        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()

        // 1) 정적 리소스/SPA 템플릿은 모두 공개
        .requestMatchers(HttpMethod.GET,
          "/", "/index.html",
          "/login", "/signup",
          "/error", "/error/**", "/favicon.ico",
          "/css/**", "/js/**", "/images/**", "/lib/**",
          "/app.js",
          "/users-new.html", "/roles.html", "/db-users.html",
          "/tpl/**" // Angular partial templates
        ).permitAll()

        // 2) 공개 API
        .requestMatchers("/api/bus/**").permitAll()

        // 3) 댓글 목록 GET만 공개(쓰기/수정/삭제는 인증 필요)
        .requestMatchers(HttpMethod.GET,
          "/api/posts/*/comments",
          "/api/posts/key/*/comments"
        ).permitAll()

        // 4) 관리자 전용 API
        .requestMatchers("/api/admin/**", "/api/roles", "/api/roles/**").hasRole("ADMIN")

        // 5) 나머지 API는 인증 필요
        .requestMatchers("/api/me").authenticated()
        .requestMatchers(HttpMethod.GET, "/api/menus").authenticated()
        .requestMatchers("/api/boards/**", "/api/posts/**", "/api/comments/**").authenticated()
        .requestMatchers("/api/users/**", "/users/**", "/user/**").authenticated()

        // 6) 그 외 전부 인증
        .anyRequest().authenticated()
      )

      // /api/** 미인증 → 401(JSON API에 적합)
      .exceptionHandling(ex -> ex.defaultAuthenticationEntryPointFor(
        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED),
        new AntPathRequestMatcher("/api/**")
      ))

      // 폼 로그인
      .formLogin(form -> form
        .loginPage("/login")
        .loginProcessingUrl("/login")
        .usernameParameter("username")
        .passwordParameter("password")
        .defaultSuccessUrl("/index.html", true)
        .failureUrl("/login?error")
        .permitAll()
      )

      // 로그아웃 (연습 편의상 GET 허용)
      .logout(logout -> logout
        .logoutRequestMatcher(new AntPathRequestMatcher("/logout", "GET"))
        .logoutSuccessUrl("/login")
        .invalidateHttpSession(true)
        .deleteCookies("JSESSIONID")
        .permitAll()
      )

      // CSRF: 연습 환경에서는 API/로그아웃 등만 예외 처리
      .csrf(csrf -> csrf.ignoringRequestMatchers(
        new AntPathRequestMatcher("/logout"),
        new AntPathRequestMatcher("/user/**"),
        new AntPathRequestMatcher("/users/**"),
        new AntPathRequestMatcher("/api/**")
      ));

    return http.build();
  }
}
