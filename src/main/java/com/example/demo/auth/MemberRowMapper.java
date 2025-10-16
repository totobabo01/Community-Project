package com.example.demo.auth;                          // 이 클래스가 속한 패키지. 다른 파일에서 import 시 기준 경로.

/*
 * ✅ 변경 요약
 * - DB 컬럼명이 username → user_name 으로 바뀌고, id 컬럼이 삭제되었습니다.
 * - 따라서 id 매핑을 제거하고, user_name 컬럼을 읽어 username 필드에 세팅합니다.
 */

import java.sql.ResultSet;                              // JDBC 쿼리 결과의 한 행(row)을 나타내는 인터페이스.
import java.sql.SQLException;                           // JDBC 수행 중 발생하는 체크 예외 타입.

import org.springframework.jdbc.core.RowMapper;         // 스프링 JDBC: ResultSet의 각 행을 객체로 매핑하는 콜백 인터페이스.

public class MemberRowMapper implements RowMapper<Member> { // RowMapper 제네릭 타입으로 Member 지정 → 한 행을 Member로 변환.
    @Override
    public Member mapRow(ResultSet rs, int rowNum) throws SQLException {
        // mapRow: ResultSet의 현재 커서가 가리키는 "한 행"을 도메인 객체로 바꾸는 메서드.
        // rs:     현재 행의 컬럼 값들에 접근
        // rowNum: 0부터 시작하는 행 번호(주로 로그/디버깅용)

        Member m = new Member();                        // 비어 있는 Member 인스턴스 생성(POJO).

        // ❌ (삭제) id 컬럼 매핑 — 테이블에서 id가 제거되었으므로 더 이상 읽지 않습니다.
        // m.setId(rs.getLong("id"));

        // ✅ 컬럼명 변경: user_name → Member.username
        m.setUsername(rs.getString("user_name"));       // "user_name" 컬럼 문자열을 읽어 설정(NOT NULL/PK).

        m.setPassword(rs.getString("password"));        // "password" 컬럼(BCrypt 해시)을 읽어 설정.
        m.setRole(rs.getString("role"));                // "role"    컬럼(예: ROLE_USER/ROLE_ADMIN)을 읽어 설정.
        m.setEnabled(rs.getBoolean("enabled"));         // "enabled" 컬럼(boolean)을 읽어 설정.

        return m;                                       // 한 행을 매핑한 Member 객체 반환.
    }
}
