package com.example.demo.auth;                                // 이 서비스가 속한 패키지. import 경로와 스캔 범위 결정.

import org.springframework.security.crypto.password.PasswordEncoder; // 비밀번호 해시/검증을 위한 스프링 시큐리티 인터페이스.
import org.springframework.stereotype.Service;                        // 스프링 서비스 컴포넌트(비즈니스 로직 계층) 표시용 애너테이션.
import org.springframework.transaction.annotation.Transactional;     // 트랜잭션 경계를 선언하기 위한 애너테이션.

@Service                                                            // 스프링 컨테이너가 이 클래스를 서비스 빈으로 등록.
public class MemberService {                                        // 회원 관련 비즈니스 규칙을 담는 서비스 클래스.

    private final MemberDao memberDao;                              // 영속성 접근 계층(DAO). DB 조회/저장을 담당.
    private final PasswordEncoder encoder;                          // 비밀번호를 해시(encode)하는 전략. (예: BCrypt)

    public MemberService(MemberDao memberDao, PasswordEncoder encoder) { // 생성자 주입: 테스트 용이/불변성 보장.
        this.memberDao = memberDao;                                 // 주입받은 DAO를 필드에 저장.
        this.encoder = encoder;                                     // 주입받은 패스워드 인코더를 필드에 저장.
    }

    @Transactional                                                  // 메서드 전체를 단일 트랜잭션으로 실행(실패 시 롤백).
    public Member register(String username, String rawPassword) {   // 사용자명/평문 비밀번호로 회원을 등록하는 유스케이스.
        // String.isBlank()는 문자열이 비어 있거나 공백 문자만으로 이루어졌는지를 검사하는 Java 11 메서드
        if (username == null || username.isBlank()) {               // 1차 유효성 검사: null/공백 문자열 거르기.
            throw new IllegalArgumentException("username required");// 잘못된 입력에 대한 400 계열(도메인 관점) 예외.
        }
        if (rawPassword == null || rawPassword.length() < 4) {      // 비밀번호 길이 최소 기준(예시: 4자) 검증.
            throw new IllegalArgumentException("password too short");// 정책 위반 시 예외.
        }
        if (memberDao.existsByUsername(username)) {                 // 중복 사용자명 여부를 DB에서 확인.
            throw new IllegalStateException("duplicate");           // 비즈니스 상태 예외(이미 존재함).
        }

        Member m = new Member();                                    // 새 도메인 객체(POJO) 생성.
        m.setUsername(username.trim());                             // 앞뒤 공백 제거 후 사용자명 설정(입력 정규화).
        m.setPassword(encoder.encode(rawPassword)); // BCrypt 해시     // 평문 → 해시로 변환하여 저장(절대 평문 저장 금지).
        m.setRole("ROLE_USER");                                     // 기본 권한 부여(스프링 시큐리티 관례: "ROLE_*").
        m.setEnabled(true);                                         // 가입 직후 활성 상태로 설정(정책에 따라 이메일 인증 등 가능).
        return memberDao.save(m);                                   // DAO를 통해 INSERT 수행, 생성된 id 채워진 Member 반환.
    }
}
