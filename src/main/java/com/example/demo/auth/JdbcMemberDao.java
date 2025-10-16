package com.example.demo.auth;                           // DAO 구현 클래스가 속한 패키지 경로

import java.util.List;                                   // 컬렉션 타입 List 사용

import org.springframework.jdbc.core.JdbcTemplate;       // JDBC 작업을 쉽게 해주는 Spring의 JdbcTemplate
import org.springframework.stereotype.Repository;        // 영속성 계층 컴포넌트 표시용 애너테이션(@Repository)

/**
 * JDBC 기반 MemberDao 구현
 * - PK: user_name (문자열)
 * - id 컬럼 없음
 * - 모든 SQL에서 user_name 사용
 */
@Repository                                              // 스프링이 예외 변환/컴포넌트 스캔 대상으로 인식하도록 지정
public class JdbcMemberDao implements MemberDao {         // MemberDao 인터페이스의 구현체 선언

    private final JdbcTemplate jdbc;                      // 의존성: DB 접근을 위한 JdbcTemplate

    public JdbcMemberDao(JdbcTemplate jdbc) {             // 생성자 주입 방식
        this.jdbc = jdbc;                                 // 전달받은 JdbcTemplate을 필드에 할당
    }

    /** 아이디 존재 여부 */
    @Override
    public boolean existsByUsername(String username) {    // 특정 user_name 존재여부 확인 메서드
        Integer n = jdbc.queryForObject(                  // 단일 값 조회 메서드 사용
            "SELECT COUNT(*) FROM accounts WHERE user_name = ?", // 조건에 맞는 행 수 카운트
            Integer.class,                                // 결과 타입: Integer
            username                                      // SQL의 ? 바인딩 값: username
        );
        return n != null && n > 0;                        // null 방지 후 1건 이상이면 true 반환
    }

    /** 아이디로 단건 조회 */
    @Override
    public Member findByUsername(String username) {       // user_name으로 1건 조회
        return jdbc.query(                                // 다건 조회 API 사용(아래에서 1건만 취함)
            "SELECT user_name, password, role, enabled FROM accounts WHERE user_name = ?", // 필요한 컬럼만 조회
            new MemberRowMapper(),                        // ResultSet -> Member로 변환할 RowMapper
            username                                      // 바인딩 파라미터
        ).stream().findFirst().orElse(null);              // 첫 번째 결과 반환(없으면 null)
    }

    /** 신규 저장 (PK는 문자열 user_name) */
    @Override
    public Member save(Member m) {                        // 새 계정 저장
        jdbc.update(                                      // 변경 계열(DML) 실행
            "INSERT INTO accounts(user_name, password, role, enabled) VALUES (?,?,?,?)", // INSERT 문
            m.getUsername(),                              // user_name 값
            m.getPassword(),                              // 암호화된 password
            m.getRole(),                                  // 역할(ROLE_USER/ROLE_ADMIN)
            m.isEnabled()                                 // 활성화 여부(true/false)
        );
        return m;                                         // DB 생성 PK가 따로 없으므로 그대로 객체 반환
    }

    // ===================== 권한/관리용 메서드 =====================

    /** 전체 사용자 목록 */
    @Override
    public List<Member> findAll() {                       // 모든 계정 목록 조회
        return jdbc.query(                                // 다건 조회
            "SELECT user_name, password, role, enabled FROM accounts ORDER BY user_name ASC", // 정렬 포함
            new MemberRowMapper()                         // 한 행씩 Member로 매핑
        );
    }

    /** 권한(role) 변경 */
    @Override
    public int updateRole(String username, String role) { // 특정 사용자 권한 변경
        return jdbc.update(                               // DML 실행 후 영향받은 행 수 반환
            "UPDATE accounts SET role = ? WHERE user_name = ?", // 업데이트 SQL
            role, username                                // 바인딩: 변경할 role, 대상 user_name
        );
    }

    /** 활성화(enabled) 변경 */
    @Override
    public int updateEnabled(String username, boolean enabled) { // 특정 사용자 활성/비활성 전환
        return jdbc.update(                               // 영향받은 행 수 반환
            "UPDATE accounts SET enabled = ? WHERE user_name = ?", // enabled 필드 업데이트
            enabled, username                             // 바인딩: true/false, 대상 user_name
        );
    }

    /** 계정 삭제(자기 탈퇴/관리자 삭제 공통) */
    @Override
    public int deleteByUsername(String username) {        // user_name 기준으로 계정 삭제
        return jdbc.update(                               // 삭제된 행 수 반환
            "DELETE FROM accounts WHERE user_name = ?",   // 삭제 SQL
            username                                      // 바인딩: 대상 user_name
        );
    }
}
