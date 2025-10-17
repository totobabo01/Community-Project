// src/main/java/com/example/demo/dto/UserDTO.java
package com.example.demo.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonProperty.Access;

/**
 * 사용자 DTO
 *
 * DB 스키마
 *  - users(user_id VARCHAR(16), name, phone, email, password)
 *  - users_roles(user_id, role)  // ex) USER, ADMIN
 */
@JsonInclude(JsonInclude.Include.NON_NULL) // null 필드는 응답에서 제외
public class UserDTO {

  /** 내부 표준 필드명은 userId, JSON 직렬화명은 user_id */
  @JsonProperty("user_id")
  @JsonAlias({"userId", "id"}) // 요청으로 들어올 때 이 별칭들도 허용
  private String userId;

  private String name;

  @JsonAlias({"tel", "phoneNumber"})
  private String phone;

  private String email;

  /** password는 요청에서만 받도록 하고 응답에는 절대 포함하지 않음 */
  @JsonProperty(access = Access.WRITE_ONLY)
  private String password;

  /** 조회 시 필요하면 내려주는 권한 목록(예: ["USER","ADMIN"]) */
  private List<String> roles;

  public UserDTO() {}

  public UserDTO(String userId, String name, String phone, String email, List<String> roles) {
    this.userId = userId;
    this.name = name;
    this.phone = phone;
    this.email = email;
    this.roles = roles;
  }

  // ── getters / setters ──────────────────────────────────────────────
  public String getUserId() {
    return userId;
  }
  public void setUserId(String userId) {
    this.userId = userId;
  }

  public String getName() {
    return name;
  }
  public void setName(String name) {
    this.name = name;
  }

  public String getPhone() {
    return phone;
  }
  public void setPhone(String phone) {
    this.phone = phone;
  }

  public String getEmail() {
    return email;
  }
  public void setEmail(String email) {
    this.email = email;
  }

  public String getPassword() {
    return password;
  }
  public void setPassword(String password) {
    this.password = password;
  }

  public List<String> getRoles() {
    return roles;
  }
  public void setRoles(List<String> roles) {
    this.roles = roles;
  }

  @Override
  public String toString() {
    return "UserDTO{" +
        "userId='" + userId + '\'' +
        ", name='" + name + '\'' +
        ", phone='" + phone + '\'' +
        ", email='" + email + '\'' +
        ", roles=" + roles +
        '}';
  }
}
