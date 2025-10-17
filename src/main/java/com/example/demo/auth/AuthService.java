// src/main/java/com/example/demo/auth/AuthService.java
package com.example.demo.auth;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.demo.dao.IUserDao;
import com.example.demo.dao.IUserRoleDao;
import com.example.demo.domain.User;

@Service
public class AuthService {

  private final IUserDao userDao;
  private final IUserRoleDao userRoleDao;
  private final PasswordEncoder encoder;

  public AuthService(IUserDao userDao,
                     IUserRoleDao userRoleDao,
                     PasswordEncoder encoder) {
    this.userDao = userDao;
    this.userRoleDao = userRoleDao;
    this.encoder = encoder;
  }

  /** 회원가입 */
  @Transactional
  public boolean signup(String userId, String rawPassword, String name, String email, String phone) {
    if (userId == null || userId.isBlank() || userId.length() > 16) return false;
    if (rawPassword == null || rawPassword.isBlank()) return false;
    if (name == null || name.isBlank()) return false;
    if (email == null || email.isBlank()) return false;

    // 중복 체크
    if (userDao.existsById(userId))   return false;
    if (userDao.existsByEmail(email)) return false;

    // 사용자 엔티티 구성
    User u = new User();
    u.setUserId(userId);
    u.setName(name);
    u.setPhone(phone);
    u.setEmail(email);
    u.setPassword(encoder.encode(rawPassword)); // 비밀번호 해시

    // INSERT (IUserDao.insert -> String 반환: 생성된 user_id / 실패 시 null)
    String created = userDao.insert(u);
    if (created == null) return false;

    // 기본 권한 부여(실패해도 가입은 유지)
    try {
      userRoleDao.insertUserRole(created, "USER");
    } catch (Exception ignore) {}

    return true;
  }
}
