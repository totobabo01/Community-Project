// src/main/java/com/example/demo/sql/UsersSql.java               // 표준 소스 경로 + 파일명

package com.example.demo.sql;                                     // SQL 문자열 유틸                      // SQL 상수들을 모아두는 패키지/클래스

/**
 * users 테이블용 SQL 모음
 *
 * 스키마
 *  - users(
 *      user_id  VARCHAR(16) PK,           // 애플리케이션이 생성해 넣는 문자열 PK
 *      name     VARCHAR(..),              // 이름
 *      phone    VARCHAR(..) NULL,         // 연락처(널 허용)
 *      email    VARCHAR(..) UNIQUE,       // 이메일(유니크 제약)
 *      password VARCHAR(..) NOT NULL      // 해시 비밀번호(널 불가)
 *    )
 *
 * 파라미터 순서:
 *  - insert():        user_id, name, phone, email, password
 *  - update():        name(nullable), phone(nullable), email(nullable), password(nullable), user_id
 *  - selectById():    user_id
 *  - selectByEmail(): email
 *  - delete():        user_id
 */
public final class UsersSql {                                    // 인스턴스화 불가능한 순수 유틸 클래스(상수/정적 메서드만)

    private UsersSql() {}                                        // private 생성자: 외부에서 new 방지(유틸 클래스 관례)

    private static final String BASE_SELECT =
        "SELECT user_id, name, phone, email, password FROM users"; // 공통 SELECT 절(항상 동일 컬럼 순서로 조회)

    /** 전체 조회 (user_id DESC) */
    public static String selectAll() {                           // 모든 사용자 조회 SQL 반환
        return BASE_SELECT + " ORDER BY user_id DESC";           // 정렬 기준: user_id 내림차순(최근 생성이 앞에 오도록)
    }

    /** PK(user_id)로 단건 조회 */
    public static String selectById() {                          // PK 조회 SQL
        return BASE_SELECT + " WHERE user_id = ?";               // 1번 파라미터로 user_id 바인딩
    }

    /** 이메일로 단건 조회 */
    public static String selectByEmail() {                       // 이메일 조회 SQL
        return BASE_SELECT + " WHERE email = ?";                 // 1번 파라미터로 email 바인딩
    }

    /** INSERT */
    public static String insert() {                              // 신규 사용자 INSERT SQL
        return "INSERT INTO users(user_id, name, phone, email, password) VALUES (?, ?, ?, ?, ?)";
        // 파라미터 순서: user_id, name, phone, email, password
        //  - phone은 null 가능 → PreparedStatement#setNull 로 바인딩할 수 있음
        //  - password는 반드시 해시(BCrypt 등)여야 함(평문 금지)
    }

    /** 부분 UPDATE (COALESCE) */
    public static String update() {                              // 일부 필드만 갱신하는 UPDATE SQL
        return "UPDATE users "
             + "   SET name     = COALESCE(?, name), "          // 1: name    — null이면 기존 name 유지
             + "       phone    = COALESCE(?, phone), "         // 2: phone   — null이면 기존 phone 유지
             + "       email    = COALESCE(?, email), "         // 3: email   — null이면 기존 email 유지
             + "       password = COALESCE(?, password) "       // 4: password— null이면 기존 hash 유지
             + " WHERE user_id = ?";                            // 5: PK(user_id) — 어느 레코드를 갱신할지 지정
        // COALESCE 전략을 쓰면 "부분 업데이트"를 간단히 구현 가능(널 값은 건드리지 않음).
        // 단, 이메일 변경 시 UNIQUE 충돌 가능성 있으므로 서비스 계층에서 중복 검사 권장.
    }

    /** 삭제 */
    public static String delete() {                              // 삭제 SQL
        return "DELETE FROM users WHERE user_id = ?";            // 1번 파라미터: user_id(PK)
        // 외래키가 없다면 순수 삭제 가능. 외래키가 있다면 ON DELETE CASCADE 또는 선행 삭제 필요.
    }

}
