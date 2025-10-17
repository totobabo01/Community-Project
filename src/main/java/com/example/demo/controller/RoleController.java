// src/main/java/com/example/demo/controller/RoleController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.RoleDao;
import com.example.demo.dto.RoleRow;

/**
 * 권한 조회 전용 컨트롤러.
 * - GET /api/roles : 모든 사용자에 대한 대표 역할(ROLE_ADMIN / ROLE_USER) 목록을 반환
 *   (SecurityConfig에서 GET은 로그인 사용자에게 허용)
 *
 * 주의: 수정/등록/삭제 엔드포인트가 필요하면 별도로 추가하고, 보안은 ADMIN으로 제한하세요.
 */
@RestController
@RequestMapping("/api/roles")
public class RoleController {

  private final RoleDao roleDao;

  public RoleController(RoleDao roleDao) {
    this.roleDao = roleDao;
  }

  /** 모든 사용자 + 대표 역할 조회 */
  @GetMapping
  public ResponseEntity<List<RoleRow>> listAll() {
    try {
      List<RoleRow> rows = roleDao.findAllUserRoles();
      return ResponseEntity.ok(rows);
    } catch (Exception e) {
      // 예외 발생 시 500 반환(프론트에서는 권한 뱃지 표시는 생략됨)
      return ResponseEntity.internalServerError().build();
    }
  }
}
