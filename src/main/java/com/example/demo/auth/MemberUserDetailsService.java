package com.example.demo.auth;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.example.demo.dao.IUserDao;
import com.example.demo.dao.IUserRoleDao;
import com.example.demo.dao.UserDao;
import com.example.demo.dao.UserRoleDao;
import com.example.demo.domain.User;

@Service
public class MemberUserDetailsService implements UserDetailsService {

  private final IUserDao userDao;
  private final IUserRoleDao userRoleDao;

  public MemberUserDetailsService(
      @Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao,
      @Qualifier(UserRoleDao.BEAN_QUALIFIER) IUserRoleDao userRoleDao) {
    this.userDao = userDao;
    this.userRoleDao = userRoleDao;
  }

  /**
   * 로그인 시 호출됨.
   * username 파라미터를 애플리케이션의 "아이디(user_id)"로 간주해 조회합니다.
   */
  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    // 아이디(user_id)로 조회 (※ IUserDao에 findById(String) 있어야 함)
    User u = userDao.findById(username)
        .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));

    // 권한 조회 후 ROLE_ 접두어 부여
    List<GrantedAuthority> authorities = userRoleDao.findRolesByUserId(u.getUserId())
        .stream()
        .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
        .collect(Collectors.toList());

    // 스프링 시큐리티 UserDetails 반환 (비밀번호는 해시 저장 가정)
    return new org.springframework.security.core.userdetails.User(
        u.getUserId(),      // principal (로그인 아이디)
        u.getPassword(),    // encoded password (e.g., BCrypt)
        authorities
    );
  }
}
