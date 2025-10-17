// REST 컨트롤러: /user 경로로 사용자 CRUD API를 노출
package com.example.demo.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dto.UserDTO;
import com.example.demo.service.user.IUserService;
import com.example.demo.service.user.impl.UserServiceImpl;

@RestController
@RequestMapping("/user") // 예: GET /user, POST /user, GET /user/{userId}
public class UserController {

  private final IUserService userService;

  public UserController(@Qualifier(UserServiceImpl.BEAN_QUALIFIER) IUserService userService) {
    this.userService = userService;
  }

  // 헬스체크
  @GetMapping(value = "/ping", produces = "text/plain")
  public String ping() { return "ok"; }

  // 전체 조회
  @GetMapping(produces = "application/json")
  public ResponseEntity<List<UserDTO>> list() {
    return ResponseEntity.ok(userService.getUsers());
  }

  // 단건 조회 (PK: user_id = String)
  @GetMapping(value = "/{userId}", produces = "application/json")
  public ResponseEntity<?> one(@PathVariable String userId) {
    return userService.getUser(userId)
        .<ResponseEntity<?>>map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.status(404).body("user not found"));
  }

  // 생성
  @PostMapping(consumes = "application/json", produces = "application/json")
  public ResponseEntity<?> create(@RequestBody UserDTO in) {
    return userService.create(in)
        .<ResponseEntity<?>>map(dto -> ResponseEntity.status(201).body(dto))
        .orElseGet(() -> ResponseEntity.badRequest().body("insert failed"));
  }

  // 부분 업데이트 (null 필드는 유지, COALESCE 전략)
  @PutMapping(value = "/{userId}", consumes = "application/json")
  public ResponseEntity<?> update(@PathVariable String userId, @RequestBody UserDTO in) {
    return userService.update(userId, in)
        ? ResponseEntity.ok().build()
        : ResponseEntity.status(404).body("user not found");
  }

  // 삭제
  @DeleteMapping("/{userId}")
  public ResponseEntity<?> delete(@PathVariable String userId) {
    return userService.delete(userId)
        ? ResponseEntity.noContent().build()
        : ResponseEntity.status(404).body("user not found");
  }
}
