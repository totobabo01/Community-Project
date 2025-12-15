// src/main/java/com/example/demo/dao/BigPostDao.java
package com.example.demo.dao;  // 이 클래스가 속한 패키지. dao = DB 접근 계층.

import java.sql.ResultSet;        // SELECT 결과 한 행(row)을 표현하는 객체 타입.
import java.sql.SQLException;     // JDBC 수행 중 발생하는 예외 타입.
import java.sql.Timestamp;        // DB의 DATETIME/TIMESTAMP 컬럼을 다룰 때 사용.
import java.time.LocalDate;       // 날짜(연-월-일)만 표현하는 클래스.
import java.time.LocalDateTime;   // 날짜+시간(연-월-일 시:분:초) 표현 클래스.
import java.util.ArrayList;       // 가변 길이 리스트 구현체.
import java.util.Collections;     // 빈 리스트 등 유틸 메서드 제공.
import java.util.List;            // List 인터페이스.

import org.springframework.jdbc.core.JdbcTemplate; // SQL 실행을 편하게 해주는 Spring JDBC 핵심 클래스.
import org.springframework.jdbc.core.RowMapper;    // ResultSet → DTO 로 매핑할 때 쓰는 인터페이스.
import org.springframework.stereotype.Repository;  // 이 클래스가 DAO 역할을 하는 빈임을 나타내는 애노테이션.

import com.example.demo.dto.BigPostDto;           // 게시글 정보를 담는 DTO 클래스.

// @Repository: 스프링이 자동으로 빈으로 등록하는 DAO 컴포넌트임을 표시.
@Repository
public class BigPostDao {

    // DB 작업을 수행하는 JdbcTemplate. DataSource 를 내부적으로 사용.
    private final JdbcTemplate jdbc;

    // 생성자 주입: 스프링이 JdbcTemplate 객체를 만들어서 여기로 넣어 줌.
    public BigPostDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─────────────────────────────────────
    // 공통 RowMapper  (DB 컬럼: id, writer_id, view_cnt)
    // ─────────────────────────────────────
    private static class BigPostRowMapper implements RowMapper<BigPostDto> {
        @Override
        public BigPostDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigPostDto d = new BigPostDto();
            d.setId(rs.getLong("id"));
            d.setTitle(rs.getString("title"));
            d.setContent(rs.getString("content"));
            d.setWriterId(rs.getString("writer_id"));

            // ✅ 추가: 조회수(view_cnt)
            try {
                d.setViewCnt(rs.getLong("view_cnt"));
            } catch (SQLException ignore) {
                // view_cnt 컬럼이 없으면 무시(초기 마이그레이션 중 대비)
            }

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
    // ✅ (추가) 조회수 +1
    //    UPDATE big_posts SET view_cnt = view_cnt + 1 WHERE id = ?
    // ─────────────────────────────────────
    public int increaseViewCnt(Long id) {
        String sql = "UPDATE big_posts SET view_cnt = view_cnt + 1 WHERE id = ?";
        return jdbc.update(sql, id);
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
                "SELECT id, title, content, writer_id, view_cnt, created_at, updated_at " + // ✅ view_cnt 포함
                "FROM big_posts " +
                "WHERE id BETWEEN ? AND ? " +
                "ORDER BY id DESC";

        return jdbc.query(sql, new BigPostRowMapper(), lowId, highId);
    }

    // ─────────────────────────────────────
    // ③ 특정 page 안에서 chunk 로 나눠서 가져오기 (lazy-load용)
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
                "SELECT id, title, content, writer_id, view_cnt, created_at, updated_at " + // ✅ view_cnt 포함
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
                SELECT id, title, content, writer_id, view_cnt, created_at, updated_at
                FROM big_posts
                ORDER BY id DESC
                LIMIT ?
                """;
        return jdbc.query(sql, new BigPostRowMapper(), size);
    }

    public List<BigPostDto> findChunkAfter(long lastId, int size) {
        if (size <= 0) size = 100;

        String sql = """
                SELECT id, title, content, writer_id, view_cnt, created_at, updated_at
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
                SELECT id, title, content, writer_id, view_cnt, created_at, updated_at
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

        // ✅ view_cnt는 DEFAULT 0 이라 컬럼에 굳이 안 넣어도 됨
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
        final String whereSql;
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
    // ⑩ 검색 COUNT
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

        String extra = sp.whereSql;
        if (extra.startsWith(" WHERE ")) {
            extra = extra.substring(" WHERE ".length());
        }

        StringBuilder sql = new StringBuilder(
                "SELECT id, title, content, writer_id, view_cnt, created_at, updated_at " + // ✅ view_cnt 포함
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
