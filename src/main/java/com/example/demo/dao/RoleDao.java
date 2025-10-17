// src/main/java/com/example/demo/dao/RoleDao.java
package com.example.demo.dao;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.RoleRow;

/**
 * 권한 조회 DAO
 *
 * - users / users_roles 기준으로 사용자별 대표 권한을 계산해 한 줄로 반환합니다.
 * - ADMIN이 하나라도 있으면 ROLE_ADMIN, 아니면 ROLE_USER 로 표시합니다.
 * - DataSource(Spring Boot의 spring.datasource)로 생성된 JdbcTemplate을 사용하여
 *   애플리케이션 전반에서 동일한 DB 커넥션 설정을 공유합니다.
 */
@Repository
public class RoleDao {

  private final JdbcTemplate jdbc;

  public RoleDao(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * 모든 사용자와 대표 권한을 반환합니다.
   * @return List<RoleRow> (username, role)
   */
  public List<RoleRow> findAllUserRoles() {
    final String sql =
        "SELECT u.user_id AS username, \n" +
        "       CASE \n" +
        "         WHEN MAX(CASE WHEN UPPER(COALESCE(ur.role_id, '')) LIKE '%ADMIN%' THEN 1 ELSE 0 END) = 1 \n" +
        "              THEN 'ROLE_ADMIN' \n" +
        "         ELSE 'ROLE_USER' \n" +
        "       END AS role \n" +
        "  FROM users u \n" +
        "  LEFT JOIN users_roles ur ON ur.user_id = u.user_id \n" +
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
