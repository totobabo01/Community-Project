package com.example.demo.auth;                       // 이 클래스가 속한 패키지. 패키지 경로는 폴더 구조와 매핑되며 컴포넌트 스캔 범위에 영향.

import java.sql.PreparedStatement;   // 스프링이 제공하는 JDBC 편의 클래스. SQL 실행, 바인딩, 예외 변환 등을 간소화.

import org.springframework.jdbc.core.JdbcTemplate; // INSERT 후 DB가 생성한 자동 증가 키(id 등)를 담기 위한 구현체.
import org.springframework.jdbc.support.GeneratedKeyHolder;    // 생성된 키를 보관/조회하기 위한 인터페이스(GeneratedKeyHolder가 구현).
import org.springframework.jdbc.support.KeyHolder;     // 이 클래스를 DAO(영속성 계층) 컴포넌트로 등록하는 스테레오타입 애너테이션.
import org.springframework.stereotype.Repository;                   // JDBC의 PreparedStatement. SQL에 ? 자리표시자 바인딩, SQL 인젝션 방지, 성능 최적화.

@Repository                                          // 스프링 컨테이너가 이 클래스를 빈으로 등록하고, 예외를 DataAccessException으로 변환하는 힌트 제공.
public class JdbcMemberDao implements MemberDao {    // MemberDao 인터페이스를 구현하는 구체 DAO. JDBC 기반 구현체.

    private final JdbcTemplate jdbc;                 // 주입받아 사용할 JdbcTemplate. 데이터소스가 연결된 템플릿 객체.

    public JdbcMemberDao(JdbcTemplate jdbc) {        // 생성자 주입. 스프링이 적절한 JdbcTemplate 빈을 주입.
        this.jdbc = jdbc;                            // 필드에 할당. 불변(final) 보장으로 안정성 향상.
    }

    @Override                                        // 인터페이스(MemberDao)의 메서드 구현 명시.
    public boolean existsByUsername(String username) {
        Integer n = jdbc.queryForObject(             // 단일 값(여기서는 COUNT 결과)을 조회할 때 사용하는 편의 메서드.
            "SELECT COUNT(*) FROM accounts WHERE username = ?", // ?는 파라미터 바인딩 자리표시자. SQL 인젝션 방지에 유리.
            Integer.class, username                  // 기대 타입(Integer)과 바인딩 값(username) 전달. 결과가 없으면 예외 발생 가능.
        );
        return n != null && n > 0;                   // null 안전 체크 후, 1 이상이면 존재(true), 0이면 미존재(false).
    }

    @Override
    public Member findByUsername(String username) {
        return jdbc.query(                           // 다중 행/열 조회용 메서드. RowMapper로 결과를 객체로 매핑.
            "SELECT id, username, password, role, enabled FROM accounts WHERE username = ?",
            new MemberRowMapper(),                   // ResultSet의 각 행을 Member 객체로 변환하는 사용자 정의 RowMapper.
            username                                 // 바인딩 파라미터. WHERE 절의 ?에 들어감.
        ).stream().findFirst().orElse(null);         // 결과 리스트를 스트림으로 변환해 첫 번째 요소를 선택, 없으면 null 반환.
    }

    @Override
    public Member save(Member m) {
        String sql = "INSERT INTO accounts(username, password, role, enabled) VALUES(?,?,?,?)"; // INSERT SQL. 자동 증가 PK는 지정 안 함.
        KeyHolder kh = new GeneratedKeyHolder();     // DB가 생성한 PK(id)를 담아오려고 KeyHolder 준비.

        jdbc.update(con -> {                         // jdbc.update의 콜백 버전: 커넥션을 받아 PreparedStatement 직접 생성/설정.
            PreparedStatement ps = con.prepareStatement(sql, new String[]{"id"});
                                                     // 두 번째 인자(new String[]{"id"})는 생성된 키 컬럼명을 지정.
                                                     // DB/드라이버에 따라 "RETURN_GENERATED_KEYS" 또는 컬럼명 지정 방식을 사용.
            ps.setString(1, m.getUsername());        // 1번째 ?에 사용자명 바인딩.
            ps.setString(2, m.getPassword());        // 2번째 ?에 비밀번호 바인딩. (실서비스에선 BCrypt 등으로 해시된 값이어야 함)
            ps.setString(3, m.getRole());            // 3번째 ?에 권한/역할(예: "ROLE_USER") 바인딩.
            ps.setBoolean(4, m.isEnabled());         // 4번째 ?에 활성화 여부(true/false) 바인딩.
            return ps;                               // 설정 끝난 PreparedStatement를 반환하면 JdbcTemplate이 실행해줌.
        }, kh);                                      // 실행 후 생성된 키를 kh에 채워줌.

        if (kh.getKey() != null) m.setId(kh.getKey().longValue());
                                                     // 생성된 PK가 존재하면 Member 객체의 id 필드에 반영.
                                                     // 일부 DB/드라이버 환경에서는 getKey()가 null이고 getKeyList()만 채워질 수 있음.
        return m;                                    // 저장된(그리고 id가 채워진) Member 객체를 반환.
    }
}
