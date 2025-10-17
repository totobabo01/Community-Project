// 도메인(엔티티) 클래스: users 테이블 1행을 표현하는 순수 POJO
package com.example.demo.domain;

/**
 * 현재 DB 스키마 기준
 *  users(
 *    user_id  VARCHAR(16) PK,
 *    name     VARCHAR(..),
 *    phone    VARCHAR(..) NULL,
 *    email    VARCHAR(..) UNIQUE,
 *    password VARCHAR(..) NOT NULL
 *  )
 */
public class User {

  // ── fields ────────────────────────────────────────────────────────────────
  private String userId;    // PK: VARCHAR(16)
  private String name;      // 이름
  private String phone;     // 연락처(선택)
  private String email;     // 이메일(UNIQUE)
  private String password;  // 비밀번호 해시(응답으로 노출 금지 권장)

  // ── constructors ─────────────────────────────────────────────────────────
  public User() {}

  public User(String userId, String name, String phone, String email, String password) {
    this.userId = userId;
    this.name = name;
    this.phone = phone;
    this.email = email;
    this.password = password;
  }

  // ── getters / setters ────────────────────────────────────────────────────
  public String getUserId() { return userId; }
  public void setUserId(String userId) { this.userId = userId; }

  public String getName() { return name; }
  public void setName(String name) { this.name = name; }

  public String getPhone() { return phone; }
  public void setPhone(String phone) { this.phone = phone; }

  public String getEmail() { return email; }
  public void setEmail(String email) { this.email = email; }

  public String getPassword() { return password; }
  public void setPassword(String password) { this.password = password; }

  // ── equals / hashCode: PK(userId) 기준 ───────────────────────────────────
  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof User)) return false;
    User other = (User) o;
    return userId != null && userId.equals(other.userId);
  }

  @Override
  public int hashCode() {
    return userId == null ? 0 : userId.hashCode();
  }

  // ── toString (password는 포함하지 않음) ─────────────────────────────────
  @Override
  public String toString() {
    return "User{" +
        "userId='" + userId + '\'' +
        ", name='" + name + '\'' +
        ", phone='" + phone + '\'' +
        ", email='" + email + '\'' +
        '}';
  }
}
