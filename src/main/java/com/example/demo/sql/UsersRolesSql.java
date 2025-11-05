// src/main/java/com/example/demo/sql/UsersRolesSql.java         // 표준 소스 경로 + 파일명

package com.example.demo.sql;                                   // SQL 유틸 클래스가 속한 패키지(네임스페이스)

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
 * 파라미터 순서 규약:
 *  - insertUserRole()            : user_id, role_id
 *  - deleteUserRolesByUserId()   : user_id
 *  - deleteOneRole()             : user_id, role_id
 *  - findRolesByUserId()         : user_id
 *  - findRolesByEmail()          : email
 *
 * 목적:
 *  - DAO에서 사용할 **SQL 문자열을 한곳에 모아 상수화** → 오타/중복/유지보수 비용 절감
 *  - DB 마이그레이션/구문 변경 시 이 파일만 수정하면 됨
 */
public final class UsersRolesSql {                               // 인스턴스화 불가한 순수 유틸 클래스

    private UsersRolesSql() { /* no-op: utility class */ }       // private 생성자(외부에서 new 방지)

    // 공통 SELECT 구문(디버깅/관리에서 재사용)
    private static final String BASE_SELECT =
        "SELECT user_id, role_id FROM users_roles";              // 기본 SELECT(필요 시 WHERE/ORDER BY 추가)

    /** 전체 조회(관리/디버깅 용도) */
    public static String selectAll() {
        return BASE_SELECT + " ORDER BY user_id, role_id";       // 사용자→역할 순으로 정렬해 안정된 출력 보장
    }

    /** 역할 매핑 추가: (user_id, role_id) */
    public static String insertUserRole() {
        // 자리표시자(?) 2개: 1) user_id  2) role_id
        return "INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)";
    }

    /** 특정 사용자(user_id)의 모든 역할 매핑 삭제 */
    public static String deleteUserRolesByUserId() {
        // 대상 사용자의 모든 역할을 일괄 삭제(대표 권한 단일화 시 선행 작업으로 유용)
        return "DELETE FROM users_roles WHERE user_id = ?";
    }

    /** 특정 사용자에게서 특정 역할만 제거 */
    public static String deleteOneRole() {
        // 다중 권한 중 일부만 해제할 때 사용
        return "DELETE FROM users_roles WHERE user_id = ? AND role_id = ?";
    }

    /** 사용자 보유 역할만 조회 (역할 리스트 용) */
    public static String findRolesByUserId() {
        // 결과 컬럼은 role_id 하나만 반환 → DAO에서 List<String> 매핑이 간단해짐
        return "SELECT role_id FROM users_roles WHERE user_id = ? ORDER BY role_id";
    }

    /** 이메일로 사용자 역할 조회 (users와 조인) */
    public static String findRolesByEmail() {
        // 이메일로 사용자를 찾은 뒤 해당 사용자의 역할 목록을 가져오는 쿼리
        // 컬럼은 ur.role_id만 선택해 List<String>으로 쉽게 매핑
        return "SELECT ur.role_id " +                            // 결과: role_id만
               "FROM users_roles ur " +                          // users_roles 테이블에 ur 별칭
               "JOIN users u ON u.user_id = ur.user_id " +       // users와 user_id로 내부 조인
               "WHERE u.email = ? " +                            // 바인딩 파라미터: email
               "ORDER BY ur.role_id";                            // 역할명 사전순 정렬
    }
}
