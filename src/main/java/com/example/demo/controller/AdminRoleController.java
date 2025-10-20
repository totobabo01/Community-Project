// src/main/java/com/example/demo/controller/AdminRoleController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.RoleDao;
import com.example.demo.dto.RoleRow;

/**
 * 관리자 전용 권한 조회 컨트롤러
 *
 * - GET /api/admin/roles : 모든 사용자에 대한 대표 권한 목록 조회
 *   (SecurityConfig에서 /api/admin/** 에 ROLE_ADMIN만 접근 가능)
 *
 * 저장/수정은 프런트에서 PUT /api/roles/{username} 로 호출하며,
 * 해당 엔드포인트는 RoleController 쪽에서 처리합니다.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminRoleController {

  private final RoleDao roleDao;

  public AdminRoleController(RoleDao roleDao) {
    this.roleDao = roleDao;
  }

  /** 관리자 전용: 권한 목록 조회 */
  @GetMapping("/roles")
  public ResponseEntity<List<RoleRow>> listRoles() {
    List<RoleRow> rows = roleDao.findAllUserRoles();
    return ResponseEntity.ok(rows);
  }

  // 필요 시: 권한 일괄 갱신/추가/삭제 등의 관리자 전용 API를 여기에 추가하세요.
}
