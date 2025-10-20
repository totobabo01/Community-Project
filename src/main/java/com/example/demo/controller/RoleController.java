// src/main/java/com/example/demo/controller/RoleController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;  // ✅ GetMapping / PutMapping / PathVariable / RequestBody 등
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.RoleDao;
import com.example.demo.dto.RoleRow;

/**
 * 권한 조회/수정 컨트롤러
 */
@RestController
@RequestMapping("/api/roles")
public class RoleController {

  private final RoleDao roleDao;
  private final JdbcTemplate jdbc;

  public RoleController(RoleDao roleDao, JdbcTemplate jdbc) {
    this.roleDao = roleDao;
    this.jdbc = jdbc;
  }

  /** 모든 사용자 + 대표 권한 조회 */
  @GetMapping
  public ResponseEntity<List<RoleRow>> listAll() {
    List<RoleRow> rows = roleDao.findAllUserRoles();
    return ResponseEntity.ok(rows);
  }

  /** 요청 바디 DTO */
  public static class UpdateRoleReq {
    public String role;     // "ROLE_USER" | "ROLE_ADMIN"
    public Boolean enabled; // (옵션)
  }

  /** 특정 사용자 대표 권한 변경 (관리자 전용) */
  @PutMapping("/{username}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<?> updateRole(
      @PathVariable String username,
      @RequestBody UpdateRoleReq body
  ) {
    if (username == null || username.isBlank() || body == null || body.role == null) {
      return ResponseEntity.badRequest().body("username/role 이 필요합니다.");
    }

    // "ROLE_USER|ROLE_ADMIN" -> "USER|ADMIN"
    final String dbRole = body.role.toUpperCase().contains("ADMIN") ? "ADMIN" : "USER";

    // 사용자 존재 확인
    Integer exists = jdbc.queryForObject(
        "SELECT COUNT(*) FROM users WHERE user_id = ?",
        Integer.class, username
    );
    if (exists == null || exists == 0) {
      return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다: " + username);
    }

    // 대표 권한 1건만 유지
    jdbc.update("DELETE FROM users_roles WHERE user_id = ?", username);
    jdbc.update("INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)", username, dbRole);

    return ResponseEntity.noContent().build(); // 204
  }
}
