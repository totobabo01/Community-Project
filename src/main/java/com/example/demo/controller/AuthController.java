package com.example.demo.controller;                        // 이 컨트롤러 클래스가 속한 패키지. 컴포넌트 스캔/임포트 경로 기준.

import org.springframework.stereotype.Controller;                 // 회원 비즈니스 로직(가입 등)을 담당하는 서비스 의존성.
import org.springframework.ui.Model;           // 스프링 MVC 컨트롤러 컴포넌트 애너테이션.
import org.springframework.web.bind.annotation.GetMapping;                        // 뷰에 데이터(Model attribute)를 전달하기 위한 모델 객체.
import org.springframework.web.bind.annotation.PostMapping;           // @GetMapping, @PostMapping, @RequestParam 등 웹 바인딩 애너테이션 모음.
import org.springframework.web.bind.annotation.RequestParam;

import com.example.demo.auth.MemberService;

@Controller                                                // 이 클래스를 MVC 컨트롤러로 등록(뷰 이름 반환 방식 사용).
public class AuthController {

    private final MemberService memberService;              // 회원가입 기능을 사용할 서비스 필드(불변).

    public AuthController(MemberService memberService) {    // 생성자 주입. 테스트 용이/순환참조 방지/불변성 장점.
        this.memberService = memberService;                 // 전달받은 서비스 인스턴스를 필드에 저장.
    }

    // 회원가입 폼
    @GetMapping("/signup")                                  // GET /signup 요청을 이 메서드로 매핑(회원가입 화면 보여주기).
    public String signupForm(@RequestParam(value = "error", required = false) String error,
                                                                 // 쿼리파라미터 error를 선택적으로 받음(예: /signup?error=duplicate).
                             Model model) {                        // 뷰로 값을 전달할 Model 객체(키-값 저장소).
        model.addAttribute("error", error);                 // 뷰에서 사용할 "error" 모델 속성으로 전달(템플릿에서 분기 표시).
        return "signup";                                    // 뷰 이름 반환. (예: templates/signup.html 렌더링)
    }

    // 회원가입 처리
    @PostMapping("/signup")                                 // POST /signup 요청을 처리(폼 전송/회원가입 실제 수행).
    public String doSignup(@RequestParam String username,   // 폼 필드 name="username" 값을 문자열로 바인딩.
                           @RequestParam String password) { // 폼 필드 name="password" 값을 문자열로 바인딩.
        try {
            memberService.register(username, password);     // 서비스 계층에 가입 위임: 유효성, 중복 체크, 비번 해시, 저장 등.
            return "redirect:/login?registered";            // 성공 시 로그인 페이지로 리다이렉트(+ "registered" 플래그).
        } catch (IllegalStateException dup) {               // 서비스에서 "이미 존재" 상황에 던진 예외 처리.
            return "redirect:/signup?error=duplicate";      // 중복 에러 코드로 다시 가입 폼으로 리다이렉트.
        } catch (IllegalArgumentException bad) {            // 잘못된 입력(공백 아이디/짧은 비번 등) 예외 처리.
            return "redirect:/signup?error=invalid";        // invalid 에러 코드로 폼 리다이렉트 → 메시지 표시 가능.
        } catch (Exception e) {                             // 그 외 예기치 못한 서버 측 오류(DB 장애 등) 포괄 처리.
            return "redirect:/signup?error=server";         // 일반 서버 오류 코드로 폼 리다이렉트.
        }
    }
}
