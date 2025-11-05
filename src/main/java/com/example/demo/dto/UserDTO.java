// src/main/java/com/example/demo/dto/UserDTO.java                 // 표준 Maven/Gradle 소스 경로 + 파일명

package com.example.demo.dto;                                      // DTO 클래스가 속한 패키지(네임스페이스)

import java.util.List;                                             // 권한 목록 표현용 컬렉션 인터페이스(List)

import com.fasterxml.jackson.annotation.JsonAlias;                 // JSON 필드의 **대체 이름(별칭)**을 지정하는 애너테이션
import com.fasterxml.jackson.annotation.JsonInclude;               // 직렬화 시 **null 필드 제외/포함** 정책 지정
import com.fasterxml.jackson.annotation.JsonProperty;              // JSON 필드명/접근 제어를 지정하는 애너테이션
import com.fasterxml.jackson.annotation.JsonProperty.Access;       // @JsonProperty에 쓰이는 **읽기/쓰기 접근 레벨** enum

/**
 * 사용자 DTO (Data Transfer Object)
 *
 * DB 스키마(예시)
 *  - users(user_id VARCHAR(16), name, phone, email, password)
 *  - users_roles(user_id, role)  // ex) USER, ADMIN (ROLE_ 접두어 없이 저장 가정)
 *
 * DTO의 목적:
 *  - 컨트롤러 ↔ 서비스 레이어 사이에서 데이터를 **안전하고 의도된 구조로** 전달
 *  - 엔티티(User)와 분리해 응답 노출 정책(예: 비밀번호 숨김)을 명확히 제어
 */
@JsonInclude(JsonInclude.Include.NON_NULL)                         // 직렬화 시 null 값인 필드는 JSON에서 **자동 제외**
public class UserDTO {                                             // 표현/전송 전용 객체(비즈니스 로직 최소화)

  /** 내부 표준 필드명은 userId, JSON 직렬화명은 user_id */
  @JsonProperty("user_id")                                         // JSON 출력/입력 시 키 이름을 **user_id**로 고정
  @JsonAlias({"userId", "id"})                                     // 입력(JSON→객체) 시 **userId**, **id**도 허용
  private String userId;                                           // 내부에선 카멜케이스 유지(자바 관례)

  private String name;                                             // 사용자 이름

  @JsonAlias({"tel", "phoneNumber"})                               // 입력 시 tel / phoneNumber 도 **phone**으로 매핑
  private String phone;                                            // 전화번호

  private String email;                                            // 이메일(로그인/중복검사에 사용)

  /** password는 요청에서만 받고, 응답에는 절대 포함하지 않음 */
  @JsonProperty(access = Access.WRITE_ONLY)                        // **쓰기 전용**: JSON 입력에만 사용, 출력 시 제외
  private String password;                                         // 평문 금지, 서비스에서 해시 처리한 값만 저장

  /** 조회 시 필요하면 내려주는 권한 목록(예: ["USER","ADMIN"]) */
  private List<String> roles;                                      // 사용자 권한 리스트(선택적 응답 필드)

  public UserDTO() {}                                              // 기본 생성자(직렬화/프레임워크 바인딩용)

  public UserDTO(String userId, String name, String phone, String email, List<String> roles) {
    this.userId = userId;                                          // 필드 일괄 초기화
    this.name = name;
    this.phone = phone;
    this.email = email;
    this.roles = roles;
  }

  // ── getters / setters ──────────────────────────────────────────────
  public String getUserId() {                                      // userId 게터
    return userId;
  }
  public void setUserId(String userId) {                           // userId 세터
    this.userId = userId;
  }

  public String getName() { return name; }                         // name 게터
  public void setName(String name) { this.name = name; }           // name 세터

  public String getPhone() { return phone; }                       // phone 게터
  public void setPhone(String phone) { this.phone = phone; }       // phone 세터

  public String getEmail() { return email; }                       // email 게터
  public void setEmail(String email) { this.email = email; }       // email 세터

  public String getPassword() { return password; }                 // password 게터(WRITE_ONLY라 **응답엔 안 나감**)
  public void setPassword(String password) { this.password = password; } // password 세터(서비스에서 해시 처리 전제)

  public List<String> getRoles() { return roles; }                 // roles 게터
  public void setRoles(List<String> roles) { this.roles = roles; } // roles 세터

  @Override
  public String toString() {                                       // 디버깅용 문자열(비밀번호는 고의로 제외)
    return "UserDTO{" +
        "userId='" + userId + '\'' +
        ", name='" + name + '\'' +
        ", phone='" + phone + '\'' +
        ", email='" + email + '\'' +
        ", roles=" + roles +
        '}';                                                       // password 미포함 → 로그 유출 방지
  }
}
