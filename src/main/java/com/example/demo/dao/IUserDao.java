// src/main/java/com/example/demo/dao/IUserDao.java
package com.example.demo.dao;

import java.util.List;
import java.util.Optional;

import com.example.demo.domain.User;

/**
 * users 테이블 DAO 규약
 *
 * 스키마
 *  - PK: user_id (VARCHAR(16))  ← 애플리케이션에서는 String 사용
 *  - cols: user_id, name, phone, email(UNIQUE), password
 */
public interface IUserDao {

    /** 전체 조회 (정렬 정책은 구현체에서 처리) */
    List<User> findAll();

    /** PK(user_id)로 단건 조회 */
    Optional<User> findById(String userId);

    /** 이메일로 단건 조회(로그인/중복 체크) */
    Optional<User> findByEmail(String email);

    /**
     * INSERT
     * - user_id 는 애플리케이션에서 생성해 User.userId 로 전달
     * - 성공 시 생성된 PK(user_id)를 그대로 반환, 실패 시 null
     */
    String insert(User user);

    /** 부분 업데이트(null 값은 유지: COALESCE 전략) — 반환: 영향 행 수(0/1) */
    int update(String userId, User patch);

    /** 삭제 — 반환: 영향 행 수(0/1) */
    int delete(String userId);

    // ---- 편의 메서드 ----
    default boolean existsByEmail(String email) {
        return findByEmail(email).isPresent();
    }

    default boolean existsById(String userId) {
        return findById(userId).isPresent();
    }
}
