// src/main/java/com/example/demo/sql/UsersSql.java
package com.example.demo.sql; // SQL 문자열 유틸

/**
 * users 테이블용 SQL 모음
 *
 * 스키마
 *  - users(
 *      user_id  VARCHAR(16) PK,
 *      name     VARCHAR(..),
 *      phone    VARCHAR(..) NULL,
 *      email    VARCHAR(..) UNIQUE,
 *      password VARCHAR(..) NOT NULL
 *    )
 *
 * 파라미터 순서:
 *  - insert():        user_id, name, phone, email, password
 *  - update():        name(nullable), phone(nullable), email(nullable), password(nullable), user_id
 *  - selectById():    user_id
 *  - selectByEmail(): email
 *  - delete():        user_id
 */
public final class UsersSql {

    private UsersSql() {}

    private static final String BASE_SELECT =
        "SELECT user_id, name, phone, email, password FROM users";

    /** 전체 조회 (user_id DESC) */
    public static String selectAll() {
        return BASE_SELECT + " ORDER BY user_id DESC";
    }

    /** PK(user_id)로 단건 조회 */
    public static String selectById() {
        return BASE_SELECT + " WHERE user_id = ?";
    }

    /** 이메일로 단건 조회 */
    public static String selectByEmail() {
        return BASE_SELECT + " WHERE email = ?";
    }

    /** INSERT */
    public static String insert() {
        return "INSERT INTO users(user_id, name, phone, email, password) VALUES (?, ?, ?, ?, ?)";
    }

    /** 부분 UPDATE (COALESCE) */
    public static String update() {
        return "UPDATE users "
             + "   SET name     = COALESCE(?, name), "
             + "       phone    = COALESCE(?, phone), "
             + "       email    = COALESCE(?, email), "
             + "       password = COALESCE(?, password) "
             + " WHERE user_id = ?";
    }

    /** 삭제 */
    public static String delete() {
        return "DELETE FROM users WHERE user_id = ?";
    }
}
