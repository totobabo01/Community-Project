// src/main/java/com/example/demo/dao/RoleDao.java
package com.example.demo.dao;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.RoleRow;

/**
 * 권한 조회 DAO
 *
 * - users / users_roles 를 조인하여 사용자별 대표 권한을 한 줄로 계산합니다.
 * - ADMIN 이 하나라도 있으면 ROLE_ADMIN, 아니면 ROLE_USER 로 표시합니다.
 * - 조인 키의 컬레이션 충돌(Illegal mix of collations 1267) 방지를 위해
 *   양쪽 컬럼에 동일한 COLLATE 를 명시합니다.
 */
@Repository
public class RoleDao {

  private final JdbcTemplate jdbc;

  public RoleDao(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** DB에서 사용할 공통 컬레이션 이름
   *  - MySQL 8 기본(권장): "utf8mb4_uca1400_ai_ci"
   *  - 환경에 따라 "utf8mb4_0900_ai_ci" 또는 "utf8mb4_general_ci" 를 써야 할 수도 있습니다.
   *  - 1267 에러가 계속 나면 아래 값을 해당 DB의 기본 컬레이션으로 바꿔주세요.
   */
  private static final String C = "utf8mb4_uca1400_ai_ci";

  /**
   * 모든 사용자와 대표 권한을 반환합니다.
   * @return List<RoleRow> (username, role)
   */
  public List<RoleRow> findAllUserRoles() {
    // 양쪽 비교 대상(u.user_id / ur.user_id)에 동일 COLLATE 강제
    final String sql =
        "SELECT u.user_id AS username, \n" +
        "       CASE \n" +
        "         WHEN MAX(CASE \n" +
        "                   WHEN UPPER(COALESCE(ur.role_id, '')) LIKE '%ADMIN%'\n" +
        "                   THEN 1 ELSE 0 \n" +
        "                 END) = 1 \n" +
        "           THEN 'ROLE_ADMIN' \n" +
        "         ELSE 'ROLE_USER' \n" +
        "       END AS role \n" +
        "  FROM users u \n" +
        "  LEFT JOIN users_roles ur \n" +
        "    ON u.user_id COLLATE " + C + " = ur.user_id COLLATE " + C + " \n" +
        " GROUP BY u.user_id \n" +
        " ORDER BY u.user_id";

    return jdbc.query(
        sql,
        (rs, i) -> new RoleRow(
            rs.getString("username"),
            rs.getString("role")
        )
    );
  }
}
