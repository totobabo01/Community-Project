package com.example.demo.auth;                          // 이 클래스가 속한 패키지. 다른 파일에서 import 시 경로 기준이 됨.

import java.sql.ResultSet;                              // JDBC 쿼리 결과 1행(row)을 표현하는 표준 인터페이스.
import java.sql.SQLException;                           // JDBC 수행 중 발생하는 체크 예외 타입.

import org.springframework.jdbc.core.RowMapper;         // 스프링 JDBC: ResultSet의 각 행을 객체로 매핑하기 위한 콜백 인터페이스.

public class MemberRowMapper implements RowMapper<Member> { // RowMapper 제네릭 타입으로 Member 지정 → 한 행을 Member로 변환.
    @Override public Member mapRow(ResultSet rs, int rowNum) throws SQLException {
        // mapRow: ResultSet의 현재 커서가 가리키는 "한 행"을 도메인 객체로 바꾸는 메서드.
        // rs  : 현재 행의 컬럼 값들에 접근하는 핸들
        // rowNum: 0부터 시작하는 행 번호(디버깅/로깅 등에 유용). 매핑 로직에는 보통 직접 사용하지 않음.

        Member m = new Member();                        // 비어 있는 Member 인스턴스 생성(POJO).

        m.setId(rs.getLong("id"));                      // "id" 컬럼을 long으로 읽어와 설정.
                                                        // 주의: getLong은 NULL일 때 0을 반환. NULL 구분 필요하면 rs.wasNull()로 확인.

        m.setUsername(rs.getString("username"));        // "username" 컬럼 문자열을 읽어 설정(UNIQUE/NOT NULL 가정이 일반적).

        m.setPassword(rs.getString("password"));        // "password" 컬럼(해시 문자열)을 읽어 설정.
                                                        // 보안상 엔티티에 값은 저장하되, 외부 응답으로 직렬화되지 않게 주의.

        m.setRole(rs.getString("role"));                // "role" 컬럼(예: ROLE_USER/ROLE_ADMIN)을 읽어 설정.

        m.setEnabled(rs.getBoolean("enabled"));         // "enabled" 컬럼(boolean)을 읽어 설정.
                                                        // getBoolean은 NULL일 때 false 반환. 실제 NULL/false 구분 필요하면 wasNull() 체크.

        return m;                                       // 한 행을 매핑한 Member 객체 반환.
    }
}
