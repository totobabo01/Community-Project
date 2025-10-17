package com.example.demo.controller; // MVC 컨트롤러 패키지

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.example.demo.auth.AuthService; // 회원가입 비즈니스(BCrypt, 기본 권한 부여)

/**
 * 회원가입 화면 + 처리 컨트롤러
 *
 * 스키마 요약
 *  - users(user_id VARCHAR(16) PK, name, phone NULL, email UNIQUE, password)
 *  - users_roles(user_id, role_id) — 기본 ROLE_USER 부여
 *
 * 보안 설정
 *  - SecurityConfig 에서 "/signup" 은 permitAll 이고 CSRF 예외로 등록되어 있어야 함.
 */
@Controller
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 회원가입 폼 */
    @GetMapping("/signup")
    public String signupForm(@RequestParam(value = "error", required = false) String error,
                             Model model) {
        model.addAttribute("error", error);
        return "signup"; // templates/signup.html
    }

    /**
     * 회원가입 처리
     * - form-urlencoded POST를 가정
     */
    @PostMapping(value = "/signup")
    public String doSignup(@RequestParam("userId") String userId,
                           @RequestParam("password") String password,
                           @RequestParam("name") String name,
                           @RequestParam("email") String email,
                           @RequestParam(value = "phone", required = false) String phone) {
        try {
            // ── 서버측 최소 검증 ───────────────────────────────────────
            String uid = userId == null ? null : userId.trim();
            String nm  = name   == null ? null : name.trim();
            String em  = email  == null ? null : email.trim();
            String ph  = phone  == null ? null : phone.trim();

            if (uid == null || uid.isEmpty() || uid.length() > 16) {
                return "redirect:/signup?error=invalid_userId";
            }
            if (password == null || password.isBlank() || password.length() < 4) {
                return "redirect:/signup?error=invalid_password";
            }
            if (nm == null || nm.isEmpty()) {
                return "redirect:/signup?error=invalid_name";
            }
            if (em == null || em.isEmpty() || !em.contains("@")) {
                return "redirect:/signup?error=invalid_email";
            }

            // ── 비즈니스 처리(BCrypt 인코딩 + 기본 ROLE_USER 매핑) ────
            boolean ok = authService.signup(uid, password, nm, em, ph);

            // 중복(user_id / email) 등으로 실패한 경우
            if (!ok) {
                return "redirect:/signup?error=conflict";
            }

            // 성공 시 로그인 페이지로 안내
            return "redirect:/login?registered";

        } catch (IllegalArgumentException bad) {
            // 서비스에서 던진 입력 오류
            return "redirect:/signup?error=invalid";
        } catch (Exception e) {
            // 그 외 서버 오류
            return "redirect:/signup?error=server";
        }
    }
}
