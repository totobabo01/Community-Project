// src/main/java/com/example/demo/controller/RoleController.java          // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.controller;                                     // 컨트롤러 클래스가 속한 패키지(네임스페이스)

import java.util.List;                                                   // 다건(목록) 반환을 위한 List 컬렉션

import org.springframework.http.ResponseEntity;                          // 상태코드+본문을 함께 담는 응답 래퍼
import org.springframework.jdbc.core.JdbcTemplate;                       // 간단한 SQL 실행을 돕는 스프링 JDBC 유틸
import org.springframework.security.access.prepost.PreAuthorize;         // 메서드 단 권한 체크 애너테이션(@EnableMethodSecurity 필요)
import org.springframework.web.bind.annotation.GetMapping;               // HTTP GET 매핑
import org.springframework.web.bind.annotation.PathVariable;             // URL 경로 변수 바인딩
import org.springframework.web.bind.annotation.PutMapping;               // HTTP PUT 매핑
import org.springframework.web.bind.annotation.RequestBody;              // JSON 본문 → 객체 바인딩
import org.springframework.web.bind.annotation.RequestMapping;           // 클래스 레벨 공통 URL prefix
import org.springframework.web.bind.annotation.RestController;           // @Controller + @ResponseBody (JSON 직렬화)

import com.example.demo.dao.RoleDao;                                     // 권한 관련 조회 DAO
import com.example.demo.dto.RoleRow;                                     // 권한 목록의 한 행을 표현하는 DTO

/**
 * 권한 조회/수정 컨트롤러
 */
@RestController                                                          // JSON 응답을 기본으로 하는 REST 컨트롤러 선언
@RequestMapping("/api/roles")                                            // 이 클래스의 모든 엔드포인트 앞에 "/api/roles" 접두사
public class RoleController {

  private final RoleDao roleDao;                                         // 권한 목록 조회용 DAO 의존성
  private final JdbcTemplate jdbc;                                       // 직접 SQL 업데이트/검증을 위한 JdbcTemplate

  public RoleController(RoleDao roleDao, JdbcTemplate jdbc) {            // 생성자 주입(권장 방식)
    this.roleDao = roleDao;                                              // 주입받은 DAO를 필드에 보관
    this.jdbc = jdbc;                                                    // 주입받은 JdbcTemplate을 필드에 보관
  }

  /** 모든 사용자 + 대표 권한 조회 */
  @GetMapping                                                            // GET /api/roles
  public ResponseEntity<List<RoleRow>> listAll() {                       // 200 OK + List<RoleRow> 반환
    List<RoleRow> rows = roleDao.findAllUserRoles();                     // DAO 호출로 전체 사용자 대표 권한 목록 조회
    return ResponseEntity.ok(rows);                                      // 200 OK와 함께 결과 리스트 반환
  }

  /** 요청 바디 DTO 모델(클래스 내부에 정의) */
  public static class UpdateRoleReq {                                    // PUT 요청에서 받을 JSON을 매핑할 DTO
    public String role;     // "ROLE_USER" | "ROLE_ADMIN"                // 클라이언트가 보낸 권한 문자열(접두어 포함 가정)
    // enabled = “활성화됨/사용 가능함”을 뜻하는 불린( boolean ) 플래그
    public Boolean enabled; // (옵션)                                    // 확장 여지(여기서는 사용하지 않음)
  }

  /** 특정 사용자 대표 권한 변경 (관리자 전용 API) */
  @PutMapping("/{username}")                                             // PUT /api/roles/{username}
  @PreAuthorize("hasRole('ADMIN')")                                      // ADMIN 권한을 가진 사용자만 실행 가능
  public ResponseEntity<?> updateRole(
      @PathVariable String username,                                      // 경로 변수로 사용자 식별자(user_id) 수신
      @RequestBody UpdateRoleReq body                                     // JSON 본문을 UpdateRoleReq로 역직렬화
  ) {
    // 입력 값 1차 검증: username/role 필수
    if (username == null || username.isBlank() || body == null || body.role == null) {
      return ResponseEntity.badRequest().body("username/role 이 필요합니다."); // 400 Bad Request + 메시지
    }

    // 클라이언트는 "ROLE_USER|ROLE_ADMIN" 형태로 보낼 수 있으나
    // DB에는 접두어 없는 "USER|ADMIN"만 저장한다고 가정 → 접두어 제거/정규화
    final String dbRole = body.role.toUpperCase().contains("ADMIN") ? "ADMIN" : "USER";

    // 사용자 존재 확인(없으면 404)
    // queryForObject는 Spring JdbcTemplate/NamedParameterJdbcTemplate가 ‘결과가 정확히 1개’인 조회를 실행할 때 쓰는 메서드
    // “integer(정수)”는 소수점 없는 수
    Integer exists = jdbc.queryForObject(                                 // COUNT(*)로 존재 여부 확인
        "SELECT COUNT(*) FROM users WHERE user_id = ?",
        Integer.class, username
    );
    if (exists == null || exists == 0) {                                  // 조회 결과가 0이면 미존재
      return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다: " + username); // 404 Not Found
    }

    // 대표 권한은 1건만 유지하는 정책: 기존 매핑 제거 후 새 매핑 삽입(치환)
    jdbc.update("DELETE FROM users_roles WHERE user_id = ?", username);   // 기존 권한 모두 삭제
    jdbc.update("INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)",
                username, dbRole);                                        // 새 대표 권한 1건 삽입
    return ResponseEntity.noContent().build();                            // 성공 시 204 No Content(바디 없음)
  }
}
