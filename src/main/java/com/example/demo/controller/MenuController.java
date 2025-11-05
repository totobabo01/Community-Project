// src/main/java/com/example/demo/controller/MenuController.java           // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.controller;                                     // 컨트롤러 클래스가 위치한 패키지(네임스페이스)

import org.springframework.http.HttpStatus;                              // HTTP 상태코드 상수(예: 200, 500 등)
import org.springframework.http.ResponseEntity;                           // 상태코드/헤더/바디를 함께 담아 반환하는 래퍼
import org.springframework.web.bind.annotation.GetMapping;                // HTTP GET 요청을 메서드에 매핑하는 애너테이션
import org.springframework.web.bind.annotation.RequestMapping;            // 클래스 레벨의 공통 URL prefix 지정
import org.springframework.web.bind.annotation.RequestParam;              // 쿼리 파라미터 → 메서드 인자 바인딩
import org.springframework.web.bind.annotation.RestController;            // @Controller + @ResponseBody (JSON 직렬화 컨트롤러)

import com.example.demo.dao.MenuDao;                                      // 메뉴 트리/목록을 조회하는 DAO 의존성

/**
 * 메뉴 조회 컨트롤러
 *
 * - GET /api/menus           : 전체 트리(기본)
 * - GET /api/menus?depth=1   : 특정 depth만 조회
 *
 * ⚠️ 하위 호환을 위해 /api/menu 도 동일하게 매핑.
 */
@RestController                                                           // JSON 응답을 기본으로 하는 REST 컨트롤러 선언
@RequestMapping("/api")                                                   // 클래스 내 모든 엔드포인트 앞에 "/api" 접두사 부여
public class MenuController {

    private final MenuDao dao;                                            // 메뉴 데이터를 제공하는 DAO 필드(불변)

    public MenuController(MenuDao dao) {                                  // 생성자 주입(권장 방식)
        this.dao = dao;                                                   // 주입받은 DAO를 필드에 저장
    }

    @GetMapping(value = {"/menus", "/menu"},                              // 두 경로를 동일 핸들러로 매핑
                produces = "application/json")                            // 응답 콘텐츠 타입을 JSON으로 명시
    public ResponseEntity<?> menus(@RequestParam(required = false)        // 쿼리 파라미터 depth (옵션)
                                   Integer depth) {
        try {
            // depth 파라미터가 없으면 전체 트리, 있으면 해당 depth만 조회
            Object body = (depth == null) ? dao.findTree()                // 전체 메뉴 트리(계층 구조)
                                          : dao.findByDepth(depth);       // 특정 깊이의 노드만
            return ResponseEntity.ok(body);                               // 200 OK + 조회 결과(JSON 직렬화)
        } catch (Exception e) {
            e.printStackTrace();                                          // 간단한 콘솔 로깅(운영에선 로거 사용 권장)
            // 500 Internal Server Error와 사용자 친화적 메시지 반환
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                                 .body("메뉴 데이터를 불러오지 못했습니다."); // 에러 메시지 바디
        }
    }
}
