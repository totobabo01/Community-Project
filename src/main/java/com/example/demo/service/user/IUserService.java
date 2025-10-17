// src/main/java/com/example/demo/service/user/IUserService.java
package com.example.demo.service.user;

import java.util.List;
import java.util.Optional;

import com.example.demo.dto.UserDTO;

public interface IUserService {
  List<UserDTO> getUsers();
  Optional<UserDTO> getUser(String userId);
  Optional<UserDTO> create(UserDTO in);      // 필요하다면 DTO에 userId 포함
  boolean update(String userId, UserDTO in);
  boolean delete(String userId);
}
