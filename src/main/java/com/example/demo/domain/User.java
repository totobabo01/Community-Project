// src/main/java/com/example/demo/domain/User.java                // 표준 Maven/Gradle 경로 + 파일명

// 도메인(엔티티) 클래스: users 테이블 1행을 표현하는 순수 POJO
package com.example.demo.domain;                                 // 엔티티 클래스가 속한 패키지(네임스페이스)

/**
 * 현재 DB 스키마 기준(예시)
 *  users(
 *    user_id  VARCHAR(16) PK,     // 문자열 기본키(로그인 아이디 등으로 재사용 가능)
 *    name     VARCHAR(..),        // 사용자 이름(표시용)
 *    phone    VARCHAR(..) NULL,   // 연락처(옵션)
 *    email    VARCHAR(..) UNIQUE, // 로그인/중복검사에 쓰는 유니크 컬럼
 *    password VARCHAR(..) NOT NULL// 비밀번호 해시(평문 저장 금지)
 *  )
 *
 * 이 클래스는 JPA 애너테이션 없이도 사용할 수 있는 순수 POJO입니다.
 * - JDBC/스프링 JDBC: RowMapper에서 ResultSet → User로 매핑.
 * - MyBatis: <resultMap> 또는 어노테이션 기반 매핑.
 * - JPA를 쓸 땐 @Entity, @Id 등 애너테이션을 추가하면 됩니다.
 */
public class User {                                              // users 테이블 한 레코드를 담는 단순 자바 객체(POJO)

  // ── fields ────────────────────────────────────────────────────────────────
  private String userId;    // PK: VARCHAR(16) — 도메인 식별자(동등성 판단의 기준)
  private String name;      // 사용자 이름(표시용)
  private String phone;     // 연락처(옵션: NULL 허용)
  private String email;     // 이메일(UNIQUE 제약; 로그인 식별자로도 활용 가능)
  private String password;  // 비밀번호 해시(BCrypt 등; 절대 평문/응답 노출 금지)

  // ── constructors ─────────────────────────────────────────────────────────
  public User() {}                                              // 기본 생성자(프레임워크/리플렉션/직렬화용)

  public User(String userId, String name, String phone, String email, String password) {
    // 모든 필드를 한 번에 세팅하는 편의 생성자(테스트/팩토리 사용에 유용)
    this.userId = userId;
    this.name = name;
    this.phone = phone;
    this.email = email;
    this.password = password;
  }

  // ── getters / setters ────────────────────────────────────────────────────
  public String getUserId() { return userId; }                  // userId 읽기
  public void setUserId(String userId) { this.userId = userId; } // userId 쓰기(변경 가능성에 유의)

  public String getName() { return name; }                      // name 읽기
  public void setName(String name) { this.name = name; }        // name 쓰기

  public String getPhone() { return phone; }                    // phone 읽기
  public void setPhone(String phone) { this.phone = phone; }    // phone 쓰기(널 허용)

  public String getEmail() { return email; }                    // email 읽기
  public void setEmail(String email) { this.email = email; }    // email 쓰기(중복/형식 검증은 서비스/DAO에서)

  public String getPassword() { return password; }              // password 읽기(주의: 외부로 반환하지 말 것)
  public void setPassword(String password) { this.password = password; } // password 쓰기(해시만 저장)

  // ── equals / hashCode: PK(userId) 기준 ───────────────────────────────────
  @Override
  public boolean equals(Object o) {                             // 동등성: 같은 userId면 같은 사용자로 간주
    if (this == o) return true;                                 // 동일 객체 참조면 true
    if (!(o instanceof User)) return false;                     // 타입 다르면 false
    User other = (User) o;                                      // 안전한 다운캐스팅
    return userId != null && userId.equals(other.userId);       // userId 둘 다 null 아님 + 값 동일 → 동등
  }

  @Override
  public int hashCode() {                                       // 해시코드도 userId 기반으로 일관성 유지
    return userId == null ? 0 : userId.hashCode();              // null 안전 처리(0 또는 해시)
  }

  // ── toString (password는 포함하지 않음) ─────────────────────────────────
  @Override
  public String toString() {                                    // 로깅/디버깅용 문자열 표현
    // 보안상 password는 의도적으로 누락(로그 유출 위험 방지)
    return "User{" +
        "userId='" + userId + '\'' +
        ", name='" + name + '\'' +
        ", phone='" + phone + '\'' +
        ", email='" + email + '\'' +
        '}';                                                    // password 미포함
  }
}
