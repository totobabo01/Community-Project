// src/main/java/com/example/demo/dao/BigPostDao.java
package com.example.demo.dao;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.BigPostDto;

@Repository
public class BigPostDao {

    private final JdbcTemplate jdbc;

    public BigPostDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─────────────────────────────────────
    // 공통 RowMapper
    // ─────────────────────────────────────
    private static class BigPostRowMapper implements RowMapper<BigPostDto> {
        @Override
        public BigPostDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigPostDto d = new BigPostDto();
            d.setId(rs.getLong("id"));
            d.setTitle(rs.getString("title"));
            d.setContent(rs.getString("content"));
            d.setWriterId(rs.getString("writer_id"));

            Timestamp cts = rs.getTimestamp("created_at");
            if (cts != null) {
                d.setCreatedAt(cts.toLocalDateTime());
            }

            // updated_at 컬럼이 있으면 같이 매핑 (없으면 이 부분은 지워도 됨)
            try {
                Timestamp uts = rs.getTimestamp("updated_at");
                if (uts != null) {
                    d.setUpdatedAt(uts.toLocalDateTime());
                }
            } catch (SQLException ignore) {
                // 컬럼이 없으면 무시
            }

            return d;
        }
    }

    // ─────────────────────────────────────
    // ① 전체 개수 (기존 그대로)
    // ─────────────────────────────────────
    public long countAll() {
        Long cnt = jdbc.queryForObject("SELECT COUNT(*) FROM big_posts", Long.class);
        return (cnt != null) ? cnt : 0L;
    }

    // ─────────────────────────────────────
    // ② page / pageSize 기반 범위 조회 (기존 그대로)
    //    ※ 대용량에서 처음 로딩 느린 원인이 될 수 있으니
    //       BIG 게시판 화면에서는 가급적 아래 ④번 메서드를 쓰는 걸 추천.
    // ─────────────────────────────────────
    public List<BigPostDto> findPage(int page, int pageSize) {
        if (page < 0) page = 0;
        if (pageSize <= 0) pageSize = 1000;

        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);
        if (maxId == null || minId == null) return Collections.emptyList();

        long highId = maxId - (long) page * pageSize;
        if (highId < minId) return Collections.emptyList();

        long lowId = highId - pageSize + 1;
        if (lowId < minId) lowId = minId;

        String sql =
            "SELECT id, title, content, writer_id, created_at, updated_at " +
            "FROM big_posts " +
            "WHERE id BETWEEN ? AND ? " +
            "ORDER BY id DESC";

        return jdbc.query(sql, new BigPostRowMapper(), lowId, highId);
    }

    // ─────────────────────────────────────
    // ③ 특정 page 안에서 chunk 로 나눠서 가져오기 (기존 그대로)
    //    page / pageSize 개념을 계속 쓰고 싶을 때만 사용.
    // ─────────────────────────────────────
    public List<BigPostDto> findChunkInPage(int page, int pageSize, Long lastId, int size) {
        if (page < 0) page = 0;
        if (pageSize <= 0) pageSize = 1000;
        if (size <= 0) size = 100;

        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);
        if (maxId == null || minId == null) return Collections.emptyList();

        long pageHigh = maxId - (long) page * pageSize;
        if (pageHigh < minId) return Collections.emptyList();

        long pageLow = pageHigh - pageSize + 1;
        if (pageLow < minId) pageLow = minId;

        StringBuilder sb = new StringBuilder(
            "SELECT id, title, content, writer_id, created_at, updated_at " +
            "FROM big_posts " +
            "WHERE id BETWEEN ? AND ? "
        );
        List<Object> args = new ArrayList<>();
        args.add(pageLow);
        args.add(pageHigh);

        if (lastId != null) {
            sb.append("AND id < ? ");
            args.add(lastId);
        }

        sb.append("ORDER BY id DESC ");
        sb.append("LIMIT ?");
        args.add(size);

        return jdbc.query(sb.toString(), new BigPostRowMapper(), args.toArray());
    }

    // ─────────────────────────────────────
    // ④ ★ 전체 테이블 기준 "무한 스크롤"용 키셋 방식 메서드
    //
    //   - OFFSET 사용 안 함
    //   - 처음: findFirstChunk(size)
    //   - 이후: findChunkAfter(lastId, size)
    //
    //   → 처음 100개만 바로 가져오고,
    //     스크롤할 때마다 WHERE id < lastId LIMIT 100
    //     이렇게만 쿼리 날려서 2천만 개여도 빠르게 조회 가능.
    // ─────────────────────────────────────

    /** 최신 글들부터 size 개 (초기 로딩용) */
    public List<BigPostDto> findFirstChunk(int size) {
        if (size <= 0) size = 100;

        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                ORDER BY id DESC
                LIMIT ?
                """;

        return jdbc.query(sql, new BigPostRowMapper(), size);
    }

    /** lastId 보다 작은 글들 중에서 size 개 (다음 chunk) */
    public List<BigPostDto> findChunkAfter(long lastId, int size) {
        if (size <= 0) size = 100;

        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                WHERE id < ?
                ORDER BY id DESC
                LIMIT ?
                """;

        return jdbc.query(sql, new BigPostRowMapper(), lastId, size);
    }
}
