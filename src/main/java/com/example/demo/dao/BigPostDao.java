// src/main/java/com/example/demo/dao/BigPostDao.java
package com.example.demo.dao;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

            try {
                Timestamp uts = rs.getTimestamp("updated_at");
                if (uts != null) {
                    d.setUpdatedAt(uts.toLocalDateTime());
                }
            } catch (SQLException ignore) {
            }

            return d;
        }
    }

    // ─────────────────────────────────────
    // ① 전체 개수
    // ─────────────────────────────────────
    public long countAll() {
        Long cnt = jdbc.queryForObject("SELECT COUNT(*) FROM big_posts", Long.class);
        return (cnt != null) ? cnt : 0L;
    }

    // ─────────────────────────────────────
    // ② page / pageSize 기반 범위 조회 (id 구간 방식)
    //    - 검색 없는 기본 목록용
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
    // ③ 특정 page 안에서 chunk 로 나눠서 가져오기
    //    (lazy-load용, 그대로 둠)
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
    // ④ 전체 테이블 기준 "무한 스크롤"용 메서드
    // ─────────────────────────────────────
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

    // ─────────────────────────────────────
    // ⑤ 단건 조회
    // ─────────────────────────────────────
    public BigPostDto findById(Long id) {
        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                WHERE id = ?
                """;
        return jdbc.queryForObject(sql, new BigPostRowMapper(), id);
    }

    // ─────────────────────────────────────
    // ⑥ INSERT (글쓰기)
    // ─────────────────────────────────────
    public Long insert(BigPostDto d) {
        LocalDateTime now = LocalDateTime.now();

        String sql = """
                INSERT INTO big_posts (title, content, writer_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """;

        jdbc.update(sql,
                d.getTitle(),
                d.getContent(),
                d.getWriterId(),
                Timestamp.valueOf(now),
                Timestamp.valueOf(now)
        );

        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    // ─────────────────────────────────────
    // ⑦ UPDATE (수정)
    // ─────────────────────────────────────
    public int update(BigPostDto d) {
        LocalDateTime now = LocalDateTime.now();

        String sql = """
                UPDATE big_posts
                SET title = ?, content = ?, updated_at = ?
                WHERE id = ?
                """;

        return jdbc.update(sql,
                d.getTitle(),
                d.getContent(),
                Timestamp.valueOf(now),
                d.getId()
        );
    }

    // ─────────────────────────────────────
    // ⑧ DELETE (삭제)
    // ─────────────────────────────────────
    public int delete(Long id) {
        String sql = "DELETE FROM big_posts WHERE id = ?";
        return jdbc.update(sql, id);
    }

    // ─────────────────────────────────────
    // ⑨ 검색용 WHERE 절 / 파라미터 빌더
    // ─────────────────────────────────────
    private static class SearchParam {
        final String whereSql;   // " WHERE writer_id = ? AND created_at >= ?"
        final List<Object> params;

        SearchParam(String whereSql, List<Object> params) {
            this.whereSql = whereSql;
            this.params = params;
        }
    }

    private SearchParam buildSearchParam(
            String type,
            String keyword,
            LocalDate from,
            LocalDate to
    ) {
        String t = (type == null) ? "" : type.toLowerCase();
        boolean hasKeyword = (keyword != null && !keyword.isBlank());

        StringBuilder where = new StringBuilder();
        List<Object> params = new ArrayList<>();

        // 1) 타입 + 키워드
        if (hasKeyword) {
            String kw = keyword.trim();
            if ("author".equals(t)) {
                appendWhere(where, "writer_id = ?");
                params.add(kw);
            } else if ("content".equals(t)) {
                appendWhere(where, "(title LIKE ? OR content LIKE ?)");
                params.add("%" + kw + "%");
                params.add("%" + kw + "%");
            } else if ("author_content".equals(t)) {
                appendWhere(where, "(writer_id = ? OR title LIKE ? OR content LIKE ?)");
                params.add(kw);
                params.add("%" + kw + "%");
                params.add("%" + kw + "%");
            }
        }

        // 2) 기간 (created_at 기준)
        if (from != null) {
            LocalDateTime fromDt = from.atStartOfDay();
            appendWhere(where, "created_at >= ?");
            params.add(Timestamp.valueOf(fromDt));
        }
        if (to != null) {
            LocalDateTime toDt = to.plusDays(1).atStartOfDay();
            appendWhere(where, "created_at < ?");
            params.add(Timestamp.valueOf(toDt));
        }

        String whereSql = where.length() > 0 ? " WHERE " + where : "";
        return new SearchParam(whereSql, params);
    }

    private static void appendWhere(StringBuilder where, String expr) {
        if (where.length() > 0) where.append(" AND ");
        where.append(expr);
    }

    // ─────────────────────────────────────
    // ⑩ 검색 COUNT  (OFFSET 없음)
    // ─────────────────────────────────────
    public long searchCount(
            String type,
            String keyword,
            LocalDate from,
            LocalDate to
    ) {
        SearchParam sp = buildSearchParam(type, keyword, from, to);
        String sql = "SELECT COUNT(*) FROM big_posts" + sp.whereSql;
        Long cnt = jdbc.queryForObject(sql, Long.class, sp.params.toArray());
        return (cnt != null) ? cnt : 0L;
    }

    // ─────────────────────────────────────
    // ⑪ 검색 + 페이지 (id 구간 방식, LIMIT만 사용)
    //
    //   - 1페이지: 최신 id 기준 0~999 범위 안에서 검색조건 만족하는 글
    //   - 2페이지: 1000~1999 범위 안에서 검색조건 만족하는 글
    //   - ...
    //
    //   → OFFSET 전혀 사용하지 않고, 기존 findPage 와 성능 비슷.
    // ─────────────────────────────────────
    public List<BigPostDto> searchPageByIdRange(
            String type,
            String keyword,
            LocalDate from,
            LocalDate to,
            int page,
            int pageSize
    ) {
        if (page < 0) page = 0;
        if (pageSize <= 0) pageSize = 1000;

        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);
        if (maxId == null || minId == null) return Collections.emptyList();

        long highId = maxId - (long) page * pageSize;
        if (highId < minId) return Collections.emptyList();

        long lowId = highId - pageSize + 1;
        if (lowId < minId) lowId = minId;

        SearchParam sp = buildSearchParam(type, keyword, from, to);

        // buildSearchParam 이 "WHERE ..." 까지 붙여주기 때문에,
        // 여기서는 선행 WHERE 를 제거하고 AND 로만 붙인다.
        String extra = sp.whereSql;
        if (extra.startsWith(" WHERE ")) {
            extra = extra.substring(" WHERE ".length());
        }

        StringBuilder sql = new StringBuilder(
                "SELECT id, title, content, writer_id, created_at, updated_at " +
                "FROM big_posts " +
                "WHERE id BETWEEN ? AND ? "
        );

        List<Object> params = new ArrayList<>();
        params.add(lowId);
        params.add(highId);

        if (!extra.isEmpty()) {
            sql.append("AND ").append(extra).append(" ");
            params.addAll(sp.params);
        }

        sql.append("ORDER BY id DESC");

        return jdbc.query(sql.toString(), new BigPostRowMapper(), params.toArray());
    }
}
