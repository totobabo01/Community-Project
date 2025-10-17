// users_roles 테이블 DAO 인터페이스
package com.example.demo.dao;

import java.util.List;

/**
 * users_roles 매핑 테이블 DAO 계약.
 *
 * 스키마(외래키 미사용):
 *   users_roles(
 *     user_id VARCHAR(16) NOT NULL,
 *     role_id VARCHAR(32) NOT NULL,
 *     PRIMARY KEY (user_id, role_id)
 *   )
 *
 * 관례:
 *  - 중복 부여 시 DB PK 제약으로 실패(예외)하거나 0 반환(구현에 따름)
 *  - 역할 표기는 'ADMIN'/'USER' 또는 'ROLE_ADMIN'/'ROLE_USER' 둘 중 하나로 통일
 *    (서비스 계층에서 ROLE_ 접두어를 보정해도 됨)
 */
public interface IUserRoleDao {

  /** 사용자에게 역할 1개 부여 */
  int insertUserRole(String userId, String roleId);

  /** 특정 사용자의 모든 역할 삭제 */
  int deleteUserRolesByUserId(String userId);

  /** 특정 사용자에게서 특정 역할만 제거 */
  int deleteOneRole(String userId, String roleId);

  /** 특정 사용자의 보유 역할 목록 */
  List<String> findRolesByUserId(String userId);

  /** 이메일로 사용자의 보유 역할 목록 조회 (users 조인) */
  List<String> findRolesByEmail(String email);
}
