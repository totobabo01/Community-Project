// src/main/java/com/example/demo/service/user/impl/UserServiceImpl.java
package com.example.demo.service.user.impl;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import com.example.demo.dao.IUserDao;
import com.example.demo.dao.UserDao;
import com.example.demo.domain.User;
import com.example.demo.dto.UserDTO;
import com.example.demo.service.user.IUserService;

@Service(UserServiceImpl.BEAN_QUALIFIER)
public class UserServiceImpl implements IUserService {

  public static final String BEAN_QUALIFIER = "userService";

  private final IUserDao userDao;

  public UserServiceImpl(@Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao) {
    this.userDao = userDao;
  }

  // ────────────── DTO ↔ Entity ──────────────
  private static UserDTO toDTO(User u) {
    if (u == null) return null;
    UserDTO d = new UserDTO();
    d.setUserId(u.getUserId());     // ← camelCase
    d.setName(u.getName());
    d.setPhone(u.getPhone());
    d.setEmail(u.getEmail());
    // password는 내려주지 않음
    return d;
  }

  private static User toEntity(UserDTO d) {
    if (d == null) return null;
    User u = new User();
    u.setUserId(d.getUserId());     // ← camelCase
    u.setName(d.getName());
    u.setPhone(d.getPhone());
    u.setEmail(d.getEmail());
    // password는 필요 시 서비스단에서 인코딩 후 주입
    return u;
  }

  // ────────────── IUserService 구현 ──────────────

  @Override
  public List<UserDTO> getUsers() {
    return userDao.findAll()
                  .stream()
                  .map(UserServiceImpl::toDTO)
                  .collect(Collectors.toList());
  }

  @Override
  public Optional<UserDTO> getUser(String userId) {
    return userDao.findById(userId).map(UserServiceImpl::toDTO); // ← findById 사용
  }

  @Override
  public Optional<UserDTO> create(UserDTO in) {
    if (in == null || in.getName() == null || in.getName().isBlank()
        || in.getEmail() == null || in.getEmail().isBlank()) {
      return Optional.empty();
    }

    // PK 16자 생성 (VARCHAR(16))
    String userId = UUID.randomUUID().toString().replace("-", "");
    if (userId.length() > 16) userId = userId.substring(0, 16);

    User u = toEntity(in);
    u.setUserId(userId);
    // NOT NULL 제약 회피용 임시 패스워드(실사용 로그인용 아님)
    u.setPassword("TEMP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10));

    // IUserDao.insert → 성공 시 생성된 user_id(String) 반환
    String created = userDao.insert(u);
    if (created == null) return Optional.empty();

    return userDao.findById(created).map(UserServiceImpl::toDTO);
  }

  @Override
  public boolean update(String userId, UserDTO in) {
    // name/phone/email만 패치(널은 유지: COALESCE)
    User patch = new User();
    patch.setName(in != null ? in.getName() : null);
    patch.setPhone(in != null ? in.getPhone() : null);
    patch.setEmail(in != null ? in.getEmail() : null);
    // password 패치는 별도 로직에서만
    return userDao.update(userId, patch) > 0;
  }

  @Override
  public boolean delete(String userId) {
    return userDao.delete(userId) > 0; // ← PK는 String
  }
}
