// src/main/java/com/example/demo/dao/BigPostDao.java
package com.example.demo.dao;  
// ↳ 이 클래스가 속한 패키지 이름을 정의.  
//    "com.example.demo.dao" 패키지는 보통 DB 접근(DAO) 관련 클래스를 모아두는 위치.

// BigPost 테이블의 한 행(게시글)을 담기 위한 DTO
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.BigPostDto;  
// ↳ 게시글 목록 등, 여러 개의 BigPostDto를 담기 위해 List 타입 사용.

// DAO(Data Access Object) 클래스임을 나타냄
@Repository  
public class BigPostDao {

    // JdbcTemplate을 멤버 필드로 가짐 (DB 연동 핵심 도구)
    private final JdbcTemplate jdbc;
    // ↳ final: 생성자에서 값이 한 번 주입되면 이후 변경할 수 없다는 의미.
    //    JdbcTemplate을 이용해 SELECT, INSERT, UPDATE, DELETE 등을 수행한다.

    // 생성자 주입 방식의 의존성 주입
    public BigPostDao(JdbcTemplate jdbc) {  
        this.jdbc = jdbc;  
        // ↳ 스프링이 어딘가에서 JdbcTemplate Bean을 만들어두고,
        //    BigPostDao를 만들 때 여기로 넣어준다.
        //    이렇게 해서 BigPostDao 안에서 this.jdbc로 DB 작업을 수행한다.
    }

    // 쿼리 결과(ResultSet)를 BigPostDto로 변환해주는 RowMapper 구현 클래스
    private static class BigPostRowMapper implements RowMapper<BigPostDto> {
        // ↳ static: 바깥 인스턴스(BigPostDao)의 상태에 의존하지 않으므로
        //    정적 내부 클래스로 선언.
        //    RowMapper<BigPostDto>: ResultSet의 한 행을 BigPostDto 객체로 바꿔주는 역할.

        @Override
        public BigPostDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            // ↳ JDBC가 ResultSet을 한 행씩 읽을 때마다 호출되는 메서드.
            //    rs : 현재 행을 가리키는 ResultSet
            //    rowNum : 0부터 시작하는 현재 행 번호(보통 로직에서는 잘 안 쓰기도 함)

            BigPostDto d = new BigPostDto();
            // ↳ 빈 BigPostDto 객체를 하나 만든 뒤, 아래에서 컬럼 값을 채워 넣는다.

            d.setId(rs.getLong("id"));
            // ↳ ResultSet에서 "id" 컬럼의 값을 long 타입으로 꺼내와서
            //    DTO의 id 필드에 넣는다.
            //    big_posts 테이블의 PK(예: BIGINT AUTO_INCREMENT)를 매핑한다고 보면 됨.

            d.setTitle(rs.getString("title"));
            // ↳ "title" 컬럼(게시글 제목)을 String으로 꺼내서 DTO에 저장.

            d.setContent(rs.getString("content"));
            // ↳ "content" 컬럼(게시글 내용)을 String으로 꺼내서 DTO에 저장.

            d.setWriterId(rs.getString("writer_id"));
            // ↳ "writer_id" 컬럼(작성자 ID 또는 이름)을 String으로 꺼내서 DTO에 저장.

            d.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            // ↳ "created_at" 컬럼(생성 시각)을 Timestamp로 꺼낸 뒤,
            //    Java 8의 LocalDateTime으로 변환해서 DTO에 저장.
            //    (DB: DATETIME / TIMESTAMP → Java: LocalDateTime)

            return d;
            // ↳ 한 행에 대한 BigPostDto 완성본을 반환.
            //    JdbcTemplate이 이 객체들을 List에 모아서 넘겨준다.
        }
    }

    // big_posts 테이블의 전체 레코드 수를 세는 메서드
    public long countAll() {
        String sql = "SELECT COUNT(*) FROM big_posts";
        // ↳ 전체 행 수를 구하는 SQL.
        //    big_posts 테이블에 데이터가 1억 개든 10개든 총 개수만 반환.

        return jdbc.queryForObject(sql, Long.class);
        // ↳ queryForObject(쿼리, 반환타입 클래스)
        //    - SQL을 실행해서 결과가 정확히 하나의 값(여기서는 COUNT(*))일 때 사용.
        //    - DB에서 가져온 숫자를 Long 타입으로 변환해서 반환.
        //    예: big_posts에 100개의 행이 있다면 100L을 리턴.
    }

    // big_posts 테이블에서 특정 페이지에 해당하는 데이터 목록을 조회하는 메서드
    public List<BigPostDto> findPage(int page, int size) {
        // page: 몇 번째 페이지인지 (0부터 시작이라고 가정)
        // size: 한 페이지에 몇 개의 게시글을 보여줄지(예: 10, 20 등)

        int offset = page * size;
        // ↳ OFFSET 계산:
        //    페이지가 0이면 offset = 0  →  처음부터
        //    페이지가 1이면 offset = size →  앞에서 size개를 건너뛰고 그 다음부터
        //    페이지가 2이면 offset = 2*size → 앞에서 2*size개를 건너뛴다.
        //    즉, (몇 번째 페이지인지) * (페이지당 개수)

        String sql =
            "SELECT id, title, content, writer_id, created_at " +
            "FROM big_posts " +
            "ORDER BY id DESC " +
            "LIMIT ? OFFSET ?";
        // ↳ 실제로 DB에서 목록을 가져오는 SQL.
        //    1) SELECT id, title, content, writer_id, created_at
        //       → 필요한 컬럼만 선택.
        //    2) FROM big_posts
        //       → big_posts 테이블에서 가져옴.
        //    3) ORDER BY id DESC
        //       → id를 기준으로 내림차순 정렬 (최근 글이 위로 오도록).
        //    4) LIMIT ? OFFSET ?
        //       → 한 페이지에 size만큼 가져오고, 앞에서 offset만큼 건너뛴다.
        //       → ? 부분은 나중에 파라미터로 채워진다.

        return jdbc.query(sql, new BigPostRowMapper(), size, offset);
        // ↳ jdbc.query(쿼리, RowMapper, 파라미터들...)
        //    - sql: 위에서 만든 SELECT 쿼리
        //    - new BigPostRowMapper(): 각 행을 BigPostDto로 변환하는 방법
        //    - size: LIMIT ? 에 들어갈 값
        //    - offset: OFFSET ? 에 들어갈 값
        //
        //    실행 결과:
        //    - big_posts 테이블에서 조건에 맞는 여러 행을 가져온 뒤,
        //    - 각 행마다 BigPostRowMapper.mapRow(...)를 호출해서 BigPostDto로 만들고
        //    - 이 DTO들을 List<BigPostDto> 형태로 모아서 반환한다.
    }
}
