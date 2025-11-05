// src/main/java/com/example/demo/controller/UserController.java           // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.controller;                                      // 컨트롤러 클래스가 속한 패키지(네임스페이스)

import java.util.List;                                                    // 다건(목록) 결과를 담는 컬렉션 타입

import org.springframework.beans.factory.annotation.Qualifier;            // 특정 구현체 빈을 골라 주입할 때 사용하는 애너테이션
import org.springframework.http.ResponseEntity;                           // HTTP 상태코드/헤더/바디를 함께 반환하는 래퍼
import org.springframework.web.bind.annotation.DeleteMapping;             // HTTP DELETE 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.GetMapping;                // HTTP GET 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.PathVariable;              // URL 경로 변수 → 메서드 인자 바인딩
import org.springframework.web.bind.annotation.PostMapping;               // HTTP POST 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.PutMapping;                // HTTP PUT 요청을 메서드에 매핑
import org.springframework.web.bind.annotation.RequestBody;               // 요청 본문(JSON) → 객체 바인딩
import org.springframework.web.bind.annotation.RequestMapping;            // 클래스 레벨 공통 URL 접두사 매핑
import org.springframework.web.bind.annotation.RestController;            // @Controller + @ResponseBody (JSON 직렬화 컨트롤러)

import com.example.demo.dto.UserDTO;                                      // 컨트롤러↔서비스 사이에서 사용하는 사용자 DTO
import com.example.demo.service.user.IUserService;                        // 사용자 도메인의 비즈니스 로직 인터페이스
import com.example.demo.service.user.impl.UserServiceImpl;                // 구현체(qualifier 상수 보유 가정)

@RestController                                                           // 이 클래스를 REST 컨트롤러로 등록(반환값을 JSON 등으로 직렬화)
@RequestMapping("/user") // 예: GET /user, POST /user, GET /user/{userId}  // 클래스 내 모든 핸들러에 "/user" 접두사 적용
public class UserController {

  private final IUserService userService;                                 // 사용자 비즈니스 로직 의존성

  public UserController(@Qualifier(UserServiceImpl.BEAN_QUALIFIER)        // 동일 타입 빈이 여럿일 때 특정 구현을 지목
                        IUserService userService) {
    this.userService = userService;                                       // 생성자 주입으로 필드 초기화(불변성 보장)
  }

  // 헬스체크(간단 상태 확인용)
  @GetMapping(value = "/ping", produces = "text/plain")                   // GET /user/ping → text/plain 응답
  public String ping() { return "ok"; }                                   // 간단 문자열 반환(컨테이너/라우팅 점검용)

  // 전체 조회
  @GetMapping(produces = "application/json")                              // GET /user → JSON 목록 반환
  public ResponseEntity<List<UserDTO>> list() {                           // 반환형: 200 OK + List<UserDTO>
    return ResponseEntity.ok(userService.getUsers());                     // 서비스에서 모든 사용자 조회
  }

  // 단건 조회 (PK: user_id = String)
  @GetMapping(value = "/{userId}", produces = "application/json")         // GET /user/{userId}
  public ResponseEntity<?> one(@PathVariable String userId) {             // 경로 변수 userId를 인자로 받음
    return userService.getUser(userId)                                    // Optional<UserDTO>를 돌려준다고 가정
        .<ResponseEntity<?>>map(ResponseEntity::ok)                       // 존재하면 200 OK + 바디(UserDTO)
        .orElseGet(() -> ResponseEntity.status(404).body("user not found")); // 없으면 404 + 메시지
  }

  // 생성
  @PostMapping(consumes = "application/json", produces = "application/json") // POST /user (입력/출력 모두 JSON)
  public ResponseEntity<?> create(@RequestBody UserDTO in) {              // 요청 본문을 UserDTO로 역직렬화
    return userService.create(in)                                         // Optional<UserDTO>(생성 결과 DTO)
        .<ResponseEntity<?>>map(dto -> ResponseEntity.status(201).body(dto)) // 생성 성공 → 201 Created + 생성 DTO
        .orElseGet(() -> ResponseEntity.badRequest().body("insert failed"));  // 실패(검증/중복 등) → 400 Bad Request
  }

  // 부분 업데이트 (null 필드는 유지, COALESCE 전략 가정)
  @PutMapping(value = "/{userId}", consumes = "application/json")         // PUT /user/{userId}
  public ResponseEntity<?> update(@PathVariable String userId,            // 어떤 사용자인지 식별
                                  @RequestBody UserDTO in) {              // 변경할 필드만 담긴 DTO(부분 업데이트)
    return userService.update(userId, in)                                 // true: 갱신됨 / false: 대상 없음
        ? ResponseEntity.ok().build()                                     // 성공 → 200 OK(본문 없음)
        : ResponseEntity.status(404).body("user not found");              // 실패 → 404 Not Found
  }

  // 삭제
  @DeleteMapping("/{userId}")                                             // DELETE /user/{userId}
  public ResponseEntity<?> delete(@PathVariable String userId) {          // 경로 변수에서 userId 수신
    return userService.delete(userId)                                     // true: 삭제됨 / false: 대상 없음
        ? ResponseEntity.noContent().build()                               // 성공 → 204 No Content(본문 없음)
        : ResponseEntity.status(404).body("user not found");              // 실패 → 404 Not Found
  }
}
