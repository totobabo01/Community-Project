package com.example.demo.sql;                               // SQL 문자열 전용 유틸 클래스가 위치한 패키지

/**
 * users 테이블용 SQL 모음.
 * DAO에서는 이 클래스의 정적 메서드를 호출해 SQL 문자열을 사용합니다.
 *
 * 파라미터 순서:
 * - insert():        name, email
 * - update():        name(nullable), email(nullable), id
 * - selectById():    id
 * - delete():        id
 */
public final class UsersSql {                               // 인스턴스 생성 없이 정적 메서드만 제공하는 유틸 클래스

    private UsersSql() {}                                   // 외부에서 new로 생성하지 못하도록 생성자 감춤(인스턴스화 방지)

    // 공통 SELECT 본문: 여러 SELECT에서 공통으로 사용하는 컬럼 목록과 테이블 지정
    private static final String BASE_SELECT =
        "SELECT id, name, email, created_at FROM users";    // 재사용 가능한 기본 SELECT 구문(중복 제거 목적)

    /** 전체 조회 (최신순) */
    public static String selectAll() {                      // 모든 사용자 행을 조회하는 SQL을 반환
        return BASE_SELECT + " ORDER BY id DESC";           // 기본 SELECT 뒤에 정렬 조건 추가(최신 id 우선)
    }

    /** PK 단건 조회 */
    public static String selectById() {                     // PK(id) 하나로 단건을 조회하는 SQL을 반환
        return BASE_SELECT + " WHERE id = ?";               // 바인딩 파라미터(?)로 id를 받을 준비
    }

    /** INSERT (created_at은 DB 기본값 사용) */
    public static String insert() {                         // 새 행을 삽입하는 SQL을 반환
        // created_at은 DEFAULT CURRENT_TIMESTAMP 등 DB 기본값 사용
        return "INSERT INTO users(name, email) VALUES (?, ?)"; // name, email만 바인딩(순서 중요)
    }

    /**
     * 부분 업데이트(null이면 기존값 유지)
     * name 또는 email에 null 전달 시 해당 컬럼은 변경하지 않음.
     */
    public static String update() {                         // 일부 컬럼만 갱신하는 SQL을 반환
        return "UPDATE users " +                            // 업데이트 대상 테이블 지정
               "   SET name  = COALESCE(?, name), " +       // 첫 번째 ?가 null이면 기존 name 유지
               "       email = COALESCE(?, email) " +       // 두 번째 ?가 null이면 기존 email 유지
               " WHERE id = ?";                             // 세 번째 ?에 PK 바인딩(갱신 대상 지정)
    }

    /** 삭제 */
    public static String delete() {                         // PK로 행을 삭제하는 SQL을 반환
        return "DELETE FROM users WHERE id = ?";            // ?에 삭제 대상 id 바인딩
    }
}
