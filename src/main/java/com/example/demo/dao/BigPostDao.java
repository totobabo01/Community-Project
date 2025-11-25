// src/main/java/com/example/demo/dao/BigPostDao.java
package com.example.demo.dao;

import java.sql.ResultSet;
import java.sql.SQLException;
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

    // =========================================================================
    // RowMapper
    // =========================================================================
    private static class BigPostRowMapper implements RowMapper<BigPostDto> {
        @Override
        public BigPostDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigPostDto d = new BigPostDto();
            d.setId(rs.getLong("id"));
            d.setTitle(rs.getString("title"));
            d.setContent(rs.getString("content"));
            d.setWriterId(rs.getString("writer_id"));
            d.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            return d;
        }
    }

    // =========================================================================
    // 전체 개수 (COUNT(*) 대신 MAX(id) - MIN(id) 방식으로 초고속)
    // =========================================================================
    public long countAll() {
        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);

        if (maxId == null || minId == null)
            return 0L;

        return Math.max(maxId - minId + 1, 0L);
    }

    // =========================================================================
    // 1000개 단위 페이지네이션 (페이지 버튼 클릭용)
    // offset 없이 id 범위 계산하여 BETWEEN 검색
    // =========================================================================
    public List<BigPostDto> findPage(int page, int size) {
        if (page < 0) page = 0;
        if (size <= 0) size = 10;

        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);

        if (maxId == null || minId == null)
            return Collections.emptyList();

        // highId = 현재 페이지의 가장 큰 ID
        long highId = maxId - (long) page * size;

        if (highId < minId)
            return Collections.emptyList();

        // lowId 조정
        long lowId = highId - size + 1;
        if (lowId < minId)
            lowId = minId;

        String sql =
            "SELECT id, title, content, writer_id, created_at " +
            "FROM big_posts " +
            "WHERE id BETWEEN ? AND ? " +
            "ORDER BY id DESC";

        return jdbc.query(sql, new BigPostRowMapper(), lowId, highId);
    }

    // =========================================================================
    // Lazy-loading (Keyset 방식)
    //  - 첫 로드는 lastId == null
    //  - 이후 로드는 WHERE id < lastId
    //  - offset 없이 인덱스 기반으로 초고속 조회
    // =========================================================================
    public List<BigPostDto> findChunk(Long lastId, int size) {

        // 첫 로드: 최신 size개
        if (lastId == null) {
            String sql =
                "SELECT id, title, content, writer_id, created_at " +
                "FROM big_posts " +
                "ORDER BY id DESC " +
                "LIMIT ?";
            return jdbc.query(sql, new BigPostRowMapper(), size);
        }

        // 이후 로드: lastId 보다 작은 데이터
        String sql =
            "SELECT id, title, content, writer_id, created_at " +
            "FROM big_posts " +
            "WHERE id < ? " +
            "ORDER BY id DESC " +
            "LIMIT ?";

        return jdbc.query(sql, new BigPostRowMapper(), lastId, size);
    }
}
