// src/main/java/com/example/demo/dto/MeDTO.java            // 표준 Maven/Gradle 소스 경로 + 파일명

package com.example.demo.dto;                               // DTO 클래스가 속한 패키지(네임스페이스)

import java.util.List;                                      // 권한 목록을 표현하기 위한 컬렉션 타입(List)

/**
 * 현재 로그인한 사용자 정보를 API 응답 등으로 전달할 때 쓰는 **표현용 DTO**.
 *  - username  : Authentication.getName() 등에 해당(로그인 식별자)
 *  - roles     : Spring Security 권한 문자열 목록("ROLE_USER", "ROLE_ADMIN" 등)
 *  - admin     : roles 안에 "ROLE_ADMIN"이 포함되어 있는지의 **파생 필드**(캐시)
 */
public class MeDTO {                                        // 간단한 데이터 전달 객체(비즈니스 로직 없음)

  private String username;                                  // 사용자 이름(Principal). 보통 userId나 이메일
  private List<String> roles;                               // 부여된 권한 목록(문자열 권한 표기)
  private boolean admin;                                    // 관리자 여부 플래그(roles로부터 도출)

  public MeDTO(String username, List<String> roles) {       // 필수 필드만 받는 생성자
    this.username = username;                               // 생성자에서 username 세팅
    this.roles = roles;                                     // 생성자에서 roles 세팅
    this.admin = roles.stream()                             // roles 컬렉션을 스트림으로 순회하며
        .anyMatch(r -> r.equals("ROLE_ADMIN"));             // "ROLE_ADMIN"이 하나라도 있으면 true로 설정
                                                            //  - equals 비교: 대소문자/접두어 규약을 엄격히 따름
                                                            //  - 규약이 다르면 equalsIgnoreCase나 접두어 처리 필요
  }

  public String getUsername() { return username; }          // username 게터(불변처럼 사용 권장)
  public List<String> getRoles() { return roles; }          // roles 게터(불변 리스트로 감싸는 것도 고려)
  public boolean isAdmin() { return admin; }                // admin 게터(자바빈 규약: boolean은 isXxx)
}
