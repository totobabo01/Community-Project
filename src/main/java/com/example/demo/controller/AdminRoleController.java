// src/main/java/com/example/demo/controller/AdminRoleController.java      // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.controller;                                      // 컨트롤러 클래스의 패키지 경로(네임스페이스)

// ───────────────────────────────────────────────────────────────────────
// JDK & Spring Web 임포트
// ───────────────────────────────────────────────────────────────────────
import java.util.List;                                                    // 다건(목록) 응답을 위한 List 컬렉션

import org.springframework.http.ResponseEntity;                           // HTTP 상태코드/헤더/본문을 담는 응답 래퍼
import org.springframework.web.bind.annotation.GetMapping;                // HTTP GET 요청을 메서드에 매핑하는 애너테이션
import org.springframework.web.bind.annotation.RequestMapping;            // 공통 URL prefix를 클래스에 부여
import org.springframework.web.bind.annotation.RestController;            // @Controller + @ResponseBody: JSON 직렬화 컨트롤러

import com.example.demo.dao.RoleDao;                                      // 권한(roles) 조회를 담당하는 DAO
import com.example.demo.dto.RoleRow;                                      // 권한 목록의 한 행을 표현하는 DTO(뷰 모델)

// ───────────────────────────────────────────────────────────────────────
// 컨트롤러 설명
// ───────────────────────────────────────────────────────────────────────
/**
 * 관리자 전용 권한 조회 컨트롤러
 *
 * - GET /api/admin/roles : 모든 사용자에 대한 대표 권한 목록 조회
 *   (SecurityConfig에서 /api/admin/** 에 ROLE_ADMIN만 접근 가능)
 *
 * 저장/수정은 프런트에서 PUT /api/roles/{username} 로 호출하며,
 * 해당 엔드포인트는 RoleController 쪽에서 처리합니다.
 */
@RestController                                                           // 이 클래스를 JSON 기반 REST 컨트롤러로 등록
@RequestMapping("/api/admin")                                             // 클래스 내 모든 핸들러에 /api/admin 접두사 적용
public class AdminRoleController {                                        // 관리자 영역의 권한 관련 API 묶음

  private final RoleDao roleDao;                                          // 권한 데이터를 DB에서 읽어오는 DAO 의존성

  public AdminRoleController(RoleDao roleDao) {                           // 생성자 주입(권장): 스프링이 RoleDao 빈을 주입
    this.roleDao = roleDao;                                               // 주입받은 DAO를 필드에 보관(불변성 보장)
  }

  /** 관리자 전용: 권한 목록 조회 */
  @GetMapping("/roles")                                                   // GET /api/admin/roles 요청을 이 메서드로 매핑
  public ResponseEntity<List<RoleRow>> listRoles() {                      // 공개 메서드이고, HTTP 응답(ResponseEntity) 으로 RoleRow 객체 목록(List<RoleRow>) 을 JSON 바디에 담아 돌려줌.
    List<RoleRow> rows = roleDao.findAllUserRoles();                      // DAO 호출로 전체 사용자-권한 요약 목록 조회
    return ResponseEntity.ok(rows);                                       // 200 OK와 함께 조회 결과를 응답 바디로 반환
  }

  // 필요 시: 권한 일괄 갱신/추가/삭제 등의 관리자 전용 API를 여기에 추가하세요.
}
