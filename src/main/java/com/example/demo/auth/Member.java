package com.example.demo.auth;                 // 패키지 경로

/**
 * ✅ 변경 요약
 * - DB가 `user_name`을 PK로 사용하고 `id` 컬럼이 삭제됨.
 * - 따라서 엔티티에서도 `id` 필드를 제거하고, username(=user_name)을 식별자로 사용.
 */
public class Member {                          // 도메인(엔티티/모델) 객체: accounts 테이블 한 행을 담는 POJO

    // ❌ 삭제: private Long id;  // 더 이상 사용하지 않음 (DB에 id 컬럼 없음)

    private String username;                   // 로그인 아이디(= DB의 user_name, PK)
    private String password;                   // 비밀번호 해시(예: BCrypt)
    private String role;                       // 권한: "ROLE_USER", "ROLE_ADMIN" 등
    private boolean enabled;                   // 계정 활성화 여부

    // --- getters / setters ---

    public String getUsername() {              // username 읽기
        return username;
    }
    public void setUsername(String username) { // username 쓰기
        this.username = username;
    }

    public String getPassword() {              // password 읽기 (외부로 노출 금지)
        return password;
    }
    public void setPassword(String password) { // password 쓰기 (저장 전 반드시 해시)
        this.password = password;
    }

    public String getRole() {                  // role 읽기
        return role;
    }
    public void setRole(String role) {         // role 쓰기
        this.role = role;
    }

    public boolean isEnabled() {               // enabled 읽기 (boolean 관례: isXxx)
        return enabled;
    }
    public void setEnabled(boolean enabled) {  // enabled 쓰기
        this.enabled = enabled;
    }
}
