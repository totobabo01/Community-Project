package com.example.demo.controller;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.IUserDao;
import com.example.demo.dao.IUserRoleDao;
import com.example.demo.dao.UserDao;
import com.example.demo.dao.UserRoleDao;
import com.example.demo.domain.User;

@RestController
public class AccountController {

    private final IUserDao userDao;
    private final IUserRoleDao userRoleDao;

    public AccountController(
            @Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao,
            @Qualifier(UserRoleDao.BEAN_QUALIFIER) IUserRoleDao userRoleDao) {
        this.userDao = userDao;
        this.userRoleDao = userRoleDao;
    }

    /**
     * 내 계정 삭제 (로그인 필요)
     * - DELETE /api/me
     * - 401: 비인증
     * - 404: 사용자 없음
     * - 204: 삭제 성공
     */
    @DeleteMapping("/api/me")
    public ResponseEntity<Void> deleteMe(Authentication auth) {
        if (auth == null || !auth.isAuthenticated()) {
            return ResponseEntity.status(401).build();
        }

        // 스프링 시큐리티 principal 이름을 이메일로 사용
        String email = auth.getName();

        Optional<User> opt = userDao.findByEmail(email);
        if (opt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        User me = opt.get();
        String userId = me.getUserId();

        // 1) 역할 매핑 먼저 제거
        userRoleDao.deleteUserRolesByUserId(userId);

        // 2) 사용자 삭제
        int rows = userDao.delete(userId);

        return (rows > 0)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
