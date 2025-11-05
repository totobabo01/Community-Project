// src/main/java/com/example/demo/controller/ViewController.java
package com.example.demo.controller;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 뷰 전용 컨트롤러
 * - "/"      → 정적 index.html 로 리다이렉트
 * - "/login" → 로그인 템플릿 렌더(실패 배너는 ?error, 가입 배너는 Flash Attr)
 */
@Controller
public class ViewController {

    /** 루트 → 정적 index.html */
    @GetMapping("/")
    public String root() {
        return "redirect:/index.html";
        // or: return "forward:/index.html";  // 필요 시 forward
    }

    /**
     * 로그인 화면
     * - 실패 배너:  /login?error  (스프링 시큐리티 실패 시 자동 추가)
     * - 가입 배너:  RedirectAttributes.addFlashAttribute("justRegistered", true) 로만 표시
     * - 두 값이 동시에 있으면 error 우선
     */
    @GetMapping("/login")
    public String loginPage(
            @RequestParam(value = "error", required = false) String errorParam,
            Model model
    ) {
        // 1) 실패 여부 (쿼리 파라미터 기반)
        final boolean hasError = (errorParam != null);

        // 2) 플래시 속성에서 justRegistered 꺼내기 (없으면 null)
        Object jr = model.asMap().get("justRegistered");
        boolean justRegistered = (jr instanceof Boolean)
                ? (Boolean) jr
                : (jr != null && "true".equalsIgnoreCase(jr.toString()));

        // 3) 에러가 없을 때만 가입 배너 표시
        final boolean showRegistered = !hasError && justRegistered;

        // 4) 템플릿에 플래그 바인딩
        model.addAttribute("error", hasError);            // th:if="${error}"
        model.addAttribute("registered", showRegistered); // th:if="${registered}"

        return "login"; // templates/login.html
    }
}
