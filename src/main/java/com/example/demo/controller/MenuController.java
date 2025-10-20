// src/main/java/com/example/demo/controller/MenuController.java
package com.example.demo.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.MenuDao;

/**
 * 메뉴 조회 컨트롤러
 *
 * - GET /api/menus           : 전체 트리(기본)
 * - GET /api/menus?depth=1   : 특정 depth 만
 *
 * ⚠️ 호환성 유지를 위해 /api/menu 도 동일하게 매핑합니다.
 */
@RestController
@RequestMapping("/api")
public class MenuController {

    private final MenuDao dao;

    public MenuController(MenuDao dao) {
        this.dao = dao;
    }

    @GetMapping(value = {"/menus", "/menu"}, produces = "application/json")
    public ResponseEntity<?> menus(@RequestParam(required = false) Integer depth) {
        try {
            Object body = (depth == null) ? dao.findTree() : dao.findByDepth(depth);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            // 문제 상황 디버깅용 간단한 메시지 반환(로그는 서버 콘솔로)
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                 .body("메뉴 데이터를 불러오지 못했습니다.");
        }
    }
}
