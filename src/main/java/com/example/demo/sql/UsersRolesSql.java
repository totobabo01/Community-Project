package com.example.demo.sql;

/**
 * users_roles 테이블 전용 SQL 유틸
 *
 * 스키마(외래키 미사용):
 *   users_roles(
 *       user_id VARCHAR(16) NOT NULL,
 *       role_id VARCHAR(32) NOT NULL,
 *       PRIMARY KEY (user_id, role_id)
 *   )
 *
 * 파라미터 순서:
 *  - insertUserRole()            : user_id, role_id
 *  - deleteUserRolesByUserId()   : user_id
 *  - deleteOneRole()             : user_id, role_id
 *  - findRolesByUserId()         : user_id
 *  - findRolesByEmail()          : email
 */
public final class UsersRolesSql {

    private UsersRolesSql() { /* no-op: utility class */ }

    // 공통 SELECT
    private static final String BASE_SELECT =
        "SELECT user_id, role_id FROM users_roles";

    /** 전체 조회(관리/디버깅 용도) */
    public static String selectAll() {
        return BASE_SELECT + " ORDER BY user_id, role_id";
    }

    /** 역할 매핑 추가: (user_id, role_id) */
    public static String insertUserRole() {
        return "INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)";
    }

    /** 특정 사용자(user_id)의 모든 역할 매핑 삭제 */
    public static String deleteUserRolesByUserId() {
        return "DELETE FROM users_roles WHERE user_id = ?";
    }

    /** 특정 사용자에게서 특정 역할만 제거 */
    public static String deleteOneRole() {
        return "DELETE FROM users_roles WHERE user_id = ? AND role_id = ?";
    }

    /** 사용자 보유 역할만 조회 (역할 리스트 용) */
    public static String findRolesByUserId() {
        return "SELECT role_id FROM users_roles WHERE user_id = ? ORDER BY role_id";
    }

    /** 이메일로 사용자 역할 조회 (users와 조인) */
    public static String findRolesByEmail() {
        return "SELECT ur.role_id " +
               "FROM users_roles ur " +
               "JOIN users u ON u.user_id = ur.user_id " +
               "WHERE u.email = ? " +
               "ORDER BY ur.role_id";
    }
}
