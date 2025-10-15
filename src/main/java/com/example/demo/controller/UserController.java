// REST 컨트롤러: /user 경로로 사용자 CRUD API를 노출
package com.example.demo.controller;                     // 이 파일의 패키지 경로(스프링 컴포넌트 스캔/네임스페이스 기준)

import java.util.List;                                   // 목록 반환 시 사용할 List 인터페이스

import org.springframework.beans.factory.annotation.Qualifier; // 동일 타입 빈 여러 개일 때 특정 빈을 지목해 주입하기 위한 애너테이션
import org.springframework.http.ResponseEntity;                 // HTTP 응답 본문 + 상태코드를 함께 다루는 래퍼 타입
import org.springframework.web.bind.annotation.DeleteMapping;   // HTTP DELETE 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.GetMapping;      // HTTP GET 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.PathVariable;    // URL 경로의 {변수} 값을 파라미터로 바인딩
import org.springframework.web.bind.annotation.PostMapping;     // HTTP POST 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.PutMapping;      // HTTP PUT 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.RequestBody;     // HTTP 요청 본문(JSON 등)을 자바 객체로 역직렬화해 파라미터로 주입
import org.springframework.web.bind.annotation.RequestMapping;   // 클래스 레벨 공통 URL prefix 지정
import org.springframework.web.bind.annotation.RestController;   // @Controller + @ResponseBody: 반환값을 그대로 HTTP 응답 본문으로 직렬화

import com.example.demo.dto.UserDTO;                            // 컨트롤러 입출력에 사용할 사용자 DTO
import com.example.demo.service.user.IUserService;              // 사용자 비즈니스 로직을 추상화한 서비스 인터페이스
import com.example.demo.service.user.impl.UserServiceImpl;      // 실제 구현체(빈 이름 상수 사용을 위해 import)

// 이 클래스가 REST 컨트롤러임을 선언(메서드 반환값이 곧 HTTP 응답 본문)
@RestController
// 이 컨트롤러의 모든 메서드는 /user를 prefix로 갖는 엔드포인트로 노출됨(예: GET /user, POST /user, GET /user/{id})
@RequestMapping("/user") // 예: GET /user, POST /user, GET /user/{id} ...
public class UserController {

  private final IUserService userService;                       // 생성자 주입 받을 서비스 의존성(인터페이스로 프로그래밍)

  // 생성자: UserServiceImpl에 선언된 BEAN_QUALIFIER 이름을 가진 구현체를 주입
  public UserController(@Qualifier(UserServiceImpl.BEAN_QUALIFIER) IUserService userService) {
    this.userService = userService;                              // 주입된 서비스 인스턴스를 필드에 저장(불변)
  }

  // 단순 헬스체크용 엔드포인트: 서버/라우팅이 살아있는지 확인
  @GetMapping(value = "/ping", produces = "text/plain")          // GET /user/ping, 응답 콘텐츠 타입은 text/plain
  public String ping() { return "ok"; }                          // 본문에 "ok" 문자열 그대로 반환(상태코드 200 OK 기본)

  // 사용자 전체 목록 조회
  @GetMapping(produces = "application/json")                     // GET /user, JSON으로 응답
  public ResponseEntity<List<UserDTO>> list() {
    return ResponseEntity.ok(userService.getUsers());            // 서비스에서 목록을 받아 200 OK + JSON(List<UserDTO>)로 반환
  }

  // 사용자 단건 조회
  @GetMapping(value = "/{id}", produces = "application/json")    // GET /user/{id}, 경로 변수 id 사용
  public ResponseEntity<?> one(@PathVariable Long id) {          // @PathVariable로 URL의 {id}를 Long 타입으로 바인딩
    return userService.getUser(id)                               // 서비스에서 Optional<UserDTO>를 반환한다고 가정
        .<ResponseEntity<?>>map(ResponseEntity::ok)              // 값이 있으면 200 OK + 본문(UserDTO)
        .orElseGet(() -> ResponseEntity                          // 값이 없으면 404 Not Found + 메시지
            .status(404).body("user not found"));
  }

  // 사용자 생성
  @PostMapping(consumes = "application/json", produces = "application/json") // POST /user, 요청/응답 모두 JSON
  public ResponseEntity<?> create(@RequestBody UserDTO in) {     // 요청 본문 JSON → UserDTO 역직렬화되어 in으로 주입
    // created_at은 서비스 계층에서 기본값(현재시각 등) 보장 → 컨트롤러에서 강제 세팅 불필요(계층 분리)
    return userService.create(in)                                 // 서비스가 Optional<UserDTO>로 성공/실패를 표현
        .<ResponseEntity<?>>map(u -> ResponseEntity              // 성공 시
            .status(201).body(u))                                // 201 Created + 생성된 리소스 표현(UserDTO)을 본문으로
        .orElseGet(() -> ResponseEntity                          // 실패 시(유효성 실패/DB 제약 등)
            .badRequest().body("insert failed"));                // 400 Bad Request + 에러 메시지
  }

  // 사용자 수정(부분 업데이트: null 필드는 기존 값 유지)
  @PutMapping(value = "/{id}", consumes = "application/json")    // PUT /user/{id}, 요청 본문 JSON
  public ResponseEntity<?> update(@PathVariable Long id, @RequestBody UserDTO in) {
    return userService.update(id, in)                             // 서비스가 boolean으로 성공/실패 반환(존재/권한/검증 등)
        ? ResponseEntity.ok().build()                             // true → 200 OK (본문 없이 상태만)
        : ResponseEntity.status(404).body("user not found");      // false → 대상 없음: 404 Not Found
  }

  // 사용자 삭제
  @DeleteMapping("/{id}")                                        // DELETE /user/{id}
  public ResponseEntity<?> delete(@PathVariable Long id) {
    return userService.delete(id)                                 // 서비스가 boolean으로 삭제 성공/실패 반환
        ? ResponseEntity.noContent().build()                      // 성공 → 204 No Content(본문 없음이 관례)
        : ResponseEntity.status(404).body("user not found");      // 실패(대상 없음) → 404 Not Found
  }
}
