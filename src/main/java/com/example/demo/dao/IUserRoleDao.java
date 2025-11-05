// src/main/java/com/example/demo/dao/IUserRoleDao.java                // 표준 Maven/Gradle 경로 + 파일명

// users_roles 테이블 DAO 인터페이스                                  // 이 파일이 다루는 대상(역할 매핑 테이블)을 설명
package com.example.demo.dao;                                          // DAO 인터페이스가 속한 패키지(네임스페이스)

import java.util.List;                                                 // 다건 결과(역할 목록) 반환을 위한 컬렉션 타입

/**
 * users_roles 매핑 테이블 DAO 계약.                                  // 영속 계층 계약(Port) 정의부
 *
 * 스키마(외래키 미사용):                                            // 예시 스키마(실제 DB 제약은 구현체/DDL에 따름)
 *   users_roles(
 *     user_id VARCHAR(16) NOT NULL,                                  // 사용자 식별자(애플리케이션에서 String)
 *     role_id VARCHAR(32) NOT NULL,                                   // 역할 식별자("USER"/"ADMIN" 또는 "ROLE_*")
 *     PRIMARY KEY (user_id, role_id)                                  // (user, role) 복합 PK로 중복 부여 방지
 *   )
 *
 * 관례:                                                              // 사용 시 유의해야 할 컨벤션
 *  - 중복 부여 시 DB PK 제약으로 실패(예외)하거나 0 반환(구현에 따름) // DuplicateKey → 예외 or 영향 행 0
 *  - 역할 표기는 'ADMIN'/'USER' 또는 'ROLE_ADMIN'/'ROLE_USER' 둘 중 하나로 통일
 *    (서비스 계층에서 ROLE_ 접두어를 보정해도 됨)                    // 한쪽에서 일관성 맞추는 것을 권장
 */
public interface IUserRoleDao {                                         // 역할 매핑에 대한 기능 계약(구현은 별도 클래스)

  /** 사용자에게 역할 1개 부여 */                                      // INSERT 1건 예상
  int insertUserRole(String userId, String roleId);                     // 성공: 1, 중복/제약 위반: 0 또는 예외

  /** 특정 사용자의 모든 역할 삭제 */                                  // DELETE 다건 가능
  int deleteUserRolesByUserId(String userId);                           // 반환: 영향 행 수(0~N)

  /** 특정 사용자에게서 특정 역할만 제거 */                            // DELETE 1건 예상
  int deleteOneRole(String userId, String roleId);                      // 성공: 1, 대상 없음: 0

  /** 특정 사용자의 보유 역할 목록 */                                  // SELECT role_id ... WHERE user_id=?
  List<String> findRolesByUserId(String userId);                        // 예: ["USER"], ["USER","ADMIN"]

  /** 이메일로 사용자의 보유 역할 목록 조회 (users 조인) */              // SELECT ... FROM users_roles JOIN users
  List<String> findRolesByEmail(String email);                          // 로그인 시 이메일 기반 권한 적재 등에 유용
}
