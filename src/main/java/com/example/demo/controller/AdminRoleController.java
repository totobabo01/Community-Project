// src/main/java/com/example/demo/controller/AdminRoleController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.RoleDao;
import com.example.demo.dto.RoleRow;

@RestController
@RequestMapping("/api/admin")
public class AdminRoleController {
  private final RoleDao roleDao;
  public AdminRoleController(RoleDao roleDao) { this.roleDao = roleDao; }

  @GetMapping("/roles")
  public List<RoleRow> listRoles() {
    return roleDao.findAllUserRoles(); // 관리자만 접근하도록 시큐리티에서 막음
  }

  // (옵션) 권한 변경/추가/삭제 등의 엔드포인트도 여기로 추가
}
