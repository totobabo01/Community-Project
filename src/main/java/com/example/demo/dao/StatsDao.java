// src/main/java/com/example/demo/dao/StatsDao.java
package com.example.demo.dao;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.StatsDto;

@Repository
public class StatsDao {

    private final JdbcTemplate jdbc;

    public StatsDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 공통 RowMapper
     *  - name  : 사용자 ID
     *  - value : 게시글 수 / 조회수(view_cnt) / 조회수 합
     */
    private static final RowMapper<StatsDto> ROW_MAPPER = new RowMapper<>() {
        @Override
        public StatsDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            StatsDto dto = new StatsDto();
            dto.setName(rs.getString("name"));
            dto.setValue(rs.getLong("value"));
            return dto;
        }
    };

    // ─────────────────────────────────────────────
    // 일반 게시판 (post)
    // metric = posts | views | views_sum
    // - posts     : 사용자별 게시글 수
    // - views_sum : 사용자별 조회수 합(SUM(view_cnt))
    // - views     : "게시글 view_cnt Top10" (SUM 아님, 개별 글의 view_cnt 그대로)
    // ─────────────────────────────────────────────
    public List<StatsDto> top10Norm(String metric) {
        final String m = (metric == null) ? "posts" : metric.trim().toLowerCase();
        final String sql;

        if ("views".equals(m)) {
            // ✅ 게시글 조회수(view_cnt) Top10 (개별 글 기준, SUM 아님)
            // name을 "작성자(글id)" 형태로 보여주고 싶으면 CONCAT 부분을 바꾸면 됨
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
            // ✅ 사용자별 조회수 합
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
            // ✅ 사용자별 게시글 수
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

        return jdbc.query(sql, ROW_MAPPER);
    }

    // ─────────────────────────────────────────────
    // 대용량 게시판 (BIG)
    // metric = posts | views | views_sum
    // - posts     : 사용자별 게시글 수(요약테이블)
    // - views_sum : 사용자별 조회수 합(요약테이블)
    // - views     : "게시글 view_cnt Top10" (SUM 아님, 개별 글의 view_cnt 그대로)
    //
    // ⚠️ big_posts 전체 GROUP BY는 느리므로 views_sum/posts는 요약테이블 사용
    // ✅ views(Top10 개별 글)은 LIMIT 10 + ORDER BY로 비교적 현실적으로 가능(인덱스 있으면 더 좋음)
    // ─────────────────────────────────────────────
    public List<StatsDto> top10Big(String metric) {
        final String m = (metric == null) ? "posts" : metric.trim().toLowerCase();
        final String sql;

        if ("views".equals(m)) {
            // ✅ 게시글 조회수(view_cnt) Top10 (개별 글 기준)
            // name은 writer_id만 보여주거나, 원하면 글 id를 함께 보여줄 수 있음
            // (예: CONCAT(writer_id, ' (#', id, ')') AS name)
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
            // ✅ 사용자별 조회수 합 (사전 집계)
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
            // ✅ 사용자별 게시글 수 (사전 집계)
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

        return jdbc.query(sql, ROW_MAPPER);
    }
}
