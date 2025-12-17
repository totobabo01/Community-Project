// src/main/java/com/example/demo/dao/StatsDao.java
package com.example.demo.dao; // ✅ DAO 패키지

import java.sql.ResultSet; // ✅ SELECT 결과 한 행
import java.sql.SQLException; // ✅ JDBC 예외
import java.util.List; // ✅ 결과 리스트

import org.springframework.jdbc.core.JdbcTemplate; // ✅ SQL 실행 도구
import org.springframework.jdbc.core.RowMapper; // ✅ ResultSet -> DTO 매핑
import org.springframework.stereotype.Repository; // ✅ 스프링 Repository 빈 등록

import com.example.demo.dto.StatsDto; // ✅ (name, value) DTO

@Repository // ✅ DAO 빈
public class StatsDao {

    private final JdbcTemplate jdbc; // ✅ DB 쿼리 실행용

    public StatsDao(JdbcTemplate jdbc) { // ✅ 생성자 주입
        this.jdbc = jdbc; // ✅ 필드에 저장
    }

    /**
     * 공통 RowMapper
     *  - name  : 사용자 ID
     *  - value : 게시글 수 / 조회수(view_cnt) / 조회수 합
     */
    private static final RowMapper<StatsDto> ROW_MAPPER = new RowMapper<>() {
        @Override
        public StatsDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            StatsDto dto = new StatsDto();          // ✅ DTO 생성
            dto.setName(rs.getString("name"));      // ✅ SQL alias "name" 컬럼 매핑
            dto.setValue(rs.getLong("value"));      // ✅ SQL alias "value" 컬럼 매핑
            return dto;                             // ✅ 변환된 DTO 반환
        }
    };

    // ─────────────────────────────────────────────
    // 일반 게시판 (post)
    // metric = posts | views | views_sum
    // - posts     : 사용자별 게시글 수
    // - views_sum : 사용자별 조회수 합(SUM(view_cnt))
    // - views     : 게시글 view_cnt Top10 (SUM 아님, 개별 글 기준)
    // ─────────────────────────────────────────────
    public List<StatsDto> top10Norm(String metric) {
        final String m = (metric == null) ? "posts" : metric.trim().toLowerCase(); // ✅ metric 정규화
        final String sql; // ✅ 실행 SQL

        if ("views".equals(m)) {
            // ✅ (개별 글 기준) view_cnt Top10
            sql = """
                SELECT
                    COALESCE(author_id, '(unknown)') AS name,
                    COALESCE(view_cnt, 0) AS value
                FROM post
                WHERE author_id IS NOT NULL
                  AND author_id <> ''
                ORDER BY view_cnt DESC
                LIMIT 10
            """;
        } else if ("views_sum".equals(m)) {
            // ✅ 사용자별 조회수 합 Top10
            sql = """
                SELECT author_id AS name,
                       COALESCE(SUM(view_cnt), 0) AS value
                FROM post
                WHERE author_id IS NOT NULL
                  AND author_id <> ''
                GROUP BY author_id
                ORDER BY value DESC
                LIMIT 10
            """;
        } else {
            // ✅ 사용자별 게시글 수 Top10
            sql = """
                SELECT author_id AS name,
                       COUNT(*) AS value
                FROM post
                WHERE author_id IS NOT NULL
                  AND author_id <> ''
                GROUP BY author_id
                ORDER BY value DESC
                LIMIT 10
            """;
        }

        return jdbc.query(sql, ROW_MAPPER); // ✅ 실행 + 매핑 + 반환
    }

    // ─────────────────────────────────────────────
    // 대용량 게시판 (BIG)
    // metric = posts | views | views_sum
    // - posts     : 사용자별 게시글 수(요약테이블)
    // - views_sum : 사용자별 조회수 합(요약테이블)
    // - views     : 게시글 view_cnt Top10 (SUM 아님, 개별 글 기준)
    // ─────────────────────────────────────────────
    public List<StatsDto> top10Big(String metric) {
        final String m = (metric == null) ? "posts" : metric.trim().toLowerCase(); // ✅ metric 정규화
        final String sql; // ✅ 실행 SQL

        if ("views".equals(m)) {
            // ✅ (개별 글 기준) view_cnt Top10
            // COALESCE : “여러 값 중에서 NULL이 아닌 ‘첫 번째 값’을 고르라는 뜻”
            // LIMIT : “결과를 몇 개까지만 가져올지” 정하는 명령어
            sql = """
                SELECT
                    COALESCE(writer_id, '(unknown)') AS name,
                    COALESCE(view_cnt, 0) AS value
                FROM big_posts
                WHERE writer_id IS NOT NULL
                  AND writer_id <> ''
                ORDER BY view_cnt DESC
                LIMIT 10
            """;
        } else if ("views_sum".equals(m)) {
            // ✅ 게시물 조회수(사전 집계 테이블) Top10
            sql = """
                SELECT writer_id AS name,
                       views_sum AS value
                FROM big_board_user_stats
                WHERE writer_id IS NOT NULL
                  AND writer_id <> ''
                ORDER BY value DESC
                LIMIT 10
            """;
        } else {
            // ✅ 사용자별 게시글 수(사전 집계 테이블) Top10
            sql = """
                SELECT writer_id AS name,
                       posts_cnt AS value
                FROM big_board_user_stats
                WHERE writer_id IS NOT NULL
                  AND writer_id <> ''
                ORDER BY value DESC
                LIMIT 10
            """;
        }

        return jdbc.query(sql, ROW_MAPPER); // ✅ 실행 + 매핑 + 반환
    }
}
