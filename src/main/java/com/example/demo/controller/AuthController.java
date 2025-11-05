// src/main/java/com/example/demo/controller/AuthController.java
package com.example.demo.controller;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import com.example.demo.auth.AuthService;

/**
 * 회원가입 화면 + 처리 컨트롤러
 *
 * 스키마(요약)
 *  - users(user_id VARCHAR(16) PK, name, phone NULL, email UNIQUE, password)
 *  - users_roles(user_id, role_id) — 가입 시 기본 ROLE_USER 부여
 *
 * 보안
 *  - SecurityConfig에서 "/signup"은 permitAll (CSRF는 그대로 사용: Thymeleaf 폼에 CSRF hidden 포함)
 */
@Controller
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 회원가입 폼 */
    @GetMapping("/signup")
    public String signupForm(
            @RequestParam(value = "error", required = false) String error,
            Model model
    ) {
        model.addAttribute("error", error); // 템플릿에서 th:if="${error}"
        return "signup";                    // templates/signup.html
    }

    /**
     * 회원가입 처리 (application/x-www-form-urlencoded)
     */
    @PostMapping(value = "/signup")
    public String doSignup(
            // required=false로 두고 널/공백을 직접 검증(폼 누락 시 400 방지용)
            @RequestParam(value = "userId",   required = false) String userId,
            @RequestParam(value = "password", required = false) String password,
            @RequestParam(value = "name",     required = false) String name,
            @RequestParam(value = "email",    required = false) String email,
            @RequestParam(value = "phone",    required = false) String phone,
            RedirectAttributes redirect // ✅ 성공 안내는 Flash Attribute 로 전달
    ) {
        try {
            // ── 입력 정규화 ──
            final String uid = trimOrNull(userId);
            final String nm  = trimOrNull(name);
            final String em  = toLowerOrNull(trimOrNull(email)); // 이메일은 소문자 보정(대소문자 중복 방지)
            final String ph  = trimOrNull(phone);
            final String pw  = password; // 비밀번호는 공백도 허용할지 정책에 따라. 여기선 뒤에서 검증.

            // ── 최소 검증 ──
            if (isEmpty(uid) || uid.length() > 16) {
                return "redirect:/signup?error=invalid_userId";
            }
            if (isEmpty(pw) || lenLessThan(pw, 4)) { // JDK8 호환: isBlank() 대신 수동 체크
                return "redirect:/signup?error=invalid_password";
            }
            if (isEmpty(nm)) {
                return "redirect:/signup?error=invalid_name";
            }
            if (isEmpty(em) || !em.contains("@")) { // 간단 체크(정규식 강화는 선택)
                return "redirect:/signup?error=invalid_email";
            }

            // ── 비즈니스 처리: BCrypt 인코딩, 중복 검사, 기본 ROLE_USER 매핑 ──
            boolean ok = authService.signup(uid, pw, nm, em, ph);

            if (!ok) { // 중복(user_id/email) 등으로 실패 시
                return "redirect:/signup?error=conflict";
            }

            // ✅ 성공 시: URL 파라미터 대신 Flash Attribute 로 “가입 완료” 전달
            redirect.addFlashAttribute("justRegistered", true);
            return "redirect:/login";

        } catch (IllegalArgumentException bad) {
            return "redirect:/signup?error=invalid";
        } catch (DataIntegrityViolationException dup) { // DB 유니크 제약 위반 등
            return "redirect:/signup?error=conflict";
        } catch (Exception e) {
            return "redirect:/signup?error=server";
        }
    }

    // ───────────────────────── 헬퍼들 ─────────────────────────

    private static String trimOrNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static boolean isEmpty(String s) {
        return s == null || s.trim().isEmpty(); // JDK8 호환
    }

    private static boolean lenLessThan(String s, int minLen) {
        return s == null || s.length() < minLen;
    }

    private static String toLowerOrNull(String s) {
        return s == null ? null : s.toLowerCase();
    }
}
