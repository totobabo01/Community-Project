package com.example.demo.auth;                 // 이 파일이 속한 패키지. 폴더 구조와 매핑되며 컴포넌트 스캔/접근 제어에 영향.

public class Member {                          // 도메인(엔티티/모델) 객체: accounts 테이블의 한 행을 담는 용도(POJO)

    private Long id;                           // PK 컬럼 매핑: 자동 증가(BIGINT)로 생성되는 식별자
    private String username;                   // 로그인 아이디(고유). DB에 UNIQUE 제약 조건을 두는 것이 일반적
    private String password;   // BCrypt 해시    // 비밀번호는 평문이 아닌 해시(예: BCrypt)로 저장해야 함
    private String role;       // ROLE_USER...   // 권한 문자열(예: "ROLE_USER", "ROLE_ADMIN") — 스프링 시큐리티 관례
    private boolean enabled;                   // 계정 활성화 여부. false면 로그인 차단 등 정책에 사용

    public Long getId() { return id; }         // id 읽기(getter). 프레임워크/직렬화/템플릿 엔진이 호출 가능
    public void setId(Long id) { this.id = id; } // id 쓰기(setter). INSERT 후 생성된 키를 주입할 때 사용

    public String getUsername() { return username; } // username 읽기
    public void setUsername(String username) { this.username = username; } // username 쓰기

    public String getPassword() { return password; } // password 읽기(주의: DTO로 외부 전송 금지!)
    public void setPassword(String password) { this.password = password; } // password 쓰기(저장 전 반드시 해시 적용)

    public String getRole() { return role; }   // role 읽기
    public void setRole(String role) { this.role = role; } // role 쓰기 (유효값: "ROLE_USER" 등)

    public boolean isEnabled() { return enabled; } // boolean 필드의 관례적 getter 이름은 isXxx()
    public void setEnabled(boolean enabled) { this.enabled = enabled; } // enabled 쓰기
}
