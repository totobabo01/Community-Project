// src/main/java/com/example/demo/dto/RoleRow.java          // 표준 Maven/Gradle 소스 경로 + 파일명

package com.example.demo.dto;                               // DTO 클래스가 속한 패키지(네임스페이스)

/**
 * 사용자 한 명의 "대표 권한"을 담는 초간단 DTO.
 * - username : users.user_id (사용자 식별자)
 * - role     : 스프링 관례의 권한 문자열("ROLE_ADMIN" 또는 "ROLE_USER")
 *
 * 용도 예:
 *  - 관리자 화면의 사용자-대표권한 목록 테이블
 *  - /api/roles, /api/admin/roles 같은 리스트 응답의 한 행 모델
 */
public class RoleRow {                                      // 표현(전송) 전용 객체 — 비즈니스 로직 없음

  private String username; // user_id                       // 사용자 식별자(= DB users.user_id)
  private String role;     // ROLE_ADMIN / ROLE_USER        // 대표 권한(항상 ROLE_ 접두어로 통일)

  public RoleRow() {}                                       // 기본 생성자(직렬화/프레임워크 바인딩용)

  public RoleRow(String username, String role) {            // 모든 필드를 한 번에 세팅하는 생성자
    this.username = username;                               // 사용자 아이디 저장
    this.role = role;                                       // 대표 권한 저장
  }

  public String getUsername() { return username; }          // username 게터(읽기)
  public void setUsername(String username) { this.username = username; } // username 세터(쓰기)

  public String getRole() { return role; }                  // role 게터(읽기)
  public void setRole(String role) { this.role = role; }    // role 세터(쓰기)
}
