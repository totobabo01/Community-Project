// src/main/java/com/example/demo/auth/AuthService.java                       // 프로젝트 내 물리적 파일 경로(표준 Maven/Gradle 구조)

package com.example.demo.auth;                                              // 이 클래스가 속한 패키지 선언(네임스페이스 역할)

// ─────────────────────────────────────────────────────────────────────────────
// 스프링/시큐리티/트랜잭션 및 도메인 의존성 임포트
// ─────────────────────────────────────────────────────────────────────────────
import org.springframework.security.crypto.password.PasswordEncoder;         // 비밀번호 해시/검증을 위한 인터페이스(구현체: BCrypt 등)
import org.springframework.stereotype.Service;                               // 서비스 레이어 컴포넌트 표시(컴포넌트 스캔 대상)
import org.springframework.transaction.annotation.Transactional;             // 트랜잭션 경계 설정 애너테이션

import com.example.demo.dao.IUserDao;                                        // 사용자 CRUD/조회/중복 체크 DAO 인터페이스
import com.example.demo.dao.IUserRoleDao;                                    // 사용자-권한 매핑 DAO 인터페이스
import com.example.demo.domain.User;                                         // 사용자 도메인 엔티티(테이블 레코드 대응 객체)

// ─────────────────────────────────────────────────────────────────────────────
// 서비스 클래스 선언부
// ─────────────────────────────────────────────────────────────────────────────
@Service                                                                      // 스프링 컨테이너가 이 클래스를 Service 빈으로 등록
public class AuthService {

  // 의존성 필드들: 생성자 주입을 통해 불변(final) 보장 → NPE/순환참조 예방, 테스트 용이
  private final IUserDao userDao;                                             // 사용자 테이블 접근용 DAO
  private final IUserRoleDao userRoleDao;                                     // 사용자-권한 매핑 테이블 접근용 DAO
  private final PasswordEncoder encoder;                                      // 비밀번호 해시화를 위한 인코더(BCrypt 등)

  // ───────────────────────────────────────────────────────────────────────────
  // 생성자 주입(권장 방식): 스프링이 알맞은 빈을 찾아 주입
  // ───────────────────────────────────────────────────────────────────────────
  public AuthService(IUserDao userDao,                                        // 사용자 DAO
                     IUserRoleDao userRoleDao,                                // 권한 매핑 DAO
                     PasswordEncoder encoder) {                               // 비밀번호 인코더
    this.userDao = userDao;                                                   // 필드에 대입
    this.userRoleDao = userRoleDao;                                           // 필드에 대입
    this.encoder = encoder;                                                   // 필드에 대입
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 회원가입 유스케이스: 입력 검증 → 중복 검사 → 비번 해시 → INSERT → 기본권한 부여
  // 트랜잭션: 메서드 전체를 하나의 트랜잭션으로 처리(런타임 예외 시 롤백)
  // ───────────────────────────────────────────────────────────────────────────
  /** 회원가입 */
  @Transactional                                                              // 스프링 트랜잭션 AOP가 프록시로 경계를 관리
  public boolean signup(String userId, String rawPassword, String name,
                        String email, String phone) {                          // 컨트롤러에서 전달받는 가입 파라미터들
    // ── 1) 입력값 1차 유효성 검사 ───────────────────────────────────────────
    // userId: null 금지, 공백 문자열 금지, 최대 길이 16
    // String#isBlank(): Java 11+, 비어있거나 공백만 있을 때 true
    if (userId == null || userId.isBlank() || userId.length() > 16) return false;

    // 비밀번호: null/공백 금지 (강도/복잡도 정책은 별도 적용 가능)
    if (rawPassword == null || rawPassword.isBlank()) return false;

    // 이름: null/공백 금지
    if (name == null || name.isBlank()) return false;

    // 이메일: null/공백 금지 (형식 검증은 별도 Regex/라이브러리로 강화 가능)
    if (email == null || email.isBlank()) return false;

    // ── 2) 중복 체크(비즈니스 레벨) ──────────────────────────────────────────
    // 동일 userId가 이미 있으면 가입 불가
    if (userDao.existsById(userId)) return false;
    // 동일 email이 이미 있으면 가입 불가
    if (userDao.existsByEmail(email)) return false;

    // ── 3) 도메인 엔티티 구성 + 비밀번호 해시 ────────────────────────────────
    User u = new User();                                                      // 빈 엔티티 생성
    u.setUserId(userId);                                                      // 로그인 아이디(또는 PK)
    u.setName(name);                                                          // 사용자 이름
    u.setPhone(phone);                                                        // 전화번호(옵션)
    u.setEmail(email);                                                        // 이메일
    u.setPassword(encoder.encode(rawPassword));                               // 평문 비번을 안전한 해시로 저장(복호화 불가)

    // ── 4) INSERT 수행 ──────────────────────────────────────────────────────
    // 설계 상: 성공 시 생성된 user_id(문자열) 반환, 실패 시 null 반환
    String created = userDao.insert(u);                                       // DB 반영 시도
    if (created == null) return false;                                        // 저장 실패 시 즉시 종료(false)

    // ── 5) 후처리: 기본 권한(USER) 부여 ─────────────────────────────────────
    // 정책상: 권한 부여 실패가 가입 자체를 무효화하진 않음 → 예외 삼킴
    try {
      userRoleDao.insertUserRole(created, "USER");                            // 권한 매핑 테이블에 1줄 추가
    } catch (Exception ignore) {                                              // 실패해도 가입은 성공으로 간주(로그 권장)
      // 로깅 권장: logger.warn("권한 부여 실패", ignore);
    }

    // ── 6) 정상 완료 ─────────────────────────────────────────────────────────
    return true;                                                              // 주요 절차 성공
  }
}
