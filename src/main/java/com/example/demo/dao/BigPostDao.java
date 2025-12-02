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
// 예외를 DataAccessException 같은 스프링 예외로 변환하는 역할도 포함.
@Repository
public class BigPostDao {

    // DB 작업을 수행하는 JdbcTemplate. DataSource 를 내부적으로 사용.
    private final JdbcTemplate jdbc;

    // 생성자 주입: 스프링이 JdbcTemplate 객체를 만들어서 여기로 넣어 줌.
    public BigPostDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─────────────────────────────────────
    // 공통 RowMapper  (DB 컬럼: id, writer_id)
    //    - SELECT 결과(ResultSet)의 한 행(row)을
    //      BigPostDto 객체로 만드는 역할.
    // ─────────────────────────────────────
    private static class BigPostRowMapper implements RowMapper<BigPostDto> {
        @Override
        public BigPostDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            BigPostDto d = new BigPostDto();           // 새 DTO 객체 생성.
            d.setId(rs.getLong("id"));                 // PK 컬럼(id)을 Long으로 읽어와서 설정.
            d.setTitle(rs.getString("title"));         // 제목 컬럼(title) → String.
            d.setContent(rs.getString("content"));     // 내용 컬럼(content) → String.
            d.setWriterId(rs.getString("writer_id"));  // 작성자 id 컬럼(writer_id).

            // created_at 컬럼을 Timestamp로 읽고, LocalDateTime 으로 변환.
            Timestamp cts = rs.getTimestamp("created_at");
            if (cts != null) {
                d.setCreatedAt(cts.toLocalDateTime());
            }

            // updated_at 컬럼은 없을 수도 있어서 try-catch 로 감싸 놓음.
            try {
                Timestamp uts = rs.getTimestamp("updated_at");
                if (uts != null) {
                    d.setUpdatedAt(uts.toLocalDateTime());
                }
            } catch (SQLException ignore) {
                // updated_at 컬럼이 없거나 에러가 나도 무시.
            }

            return d; // 한 행에 대한 DTO 반환.
        }
    }

    // ─────────────────────────────────────
    // ① 전체 개수
    //    SELECT COUNT(*) FROM big_posts
    //    - 테이블에 몇 개의 행(게시글)이 있는지 정확히 세는 SQL.
    // ─────────────────────────────────────
    public long countAll() {
        // queryForObject(sql, 반환타입)
        //  → COUNT(*) 결과를 Long 타입으로 받아옴.
        Long cnt = jdbc.queryForObject("SELECT COUNT(*) FROM big_posts", Long.class);
        // cnt 가 null 이면 0으로 처리.
        return (cnt != null) ? cnt : 0L;
    }

    // ─────────────────────────────────────
    // ② page / pageSize 기반 범위 조회 (id 구간 방식)
    //    - 검색이 없을 때 기본 목록을 페이지별로 조회.
    //
    //    DB 관점:
    //    1) MAX(id), MIN(id) 를 구해서 전체 id 범위를 확인.
    //    2) "page" 번호에 따라 id의 상한(highId)과 하한(lowId)을 계산.
    //    3) 해당 구간을 BETWEEN 으로 조회:
    //       SELECT ... FROM big_posts
    //        WHERE id BETWEEN lowId AND highId
    //        ORDER BY id DESC;
    // ─────────────────────────────────────
    public List<BigPostDto> findPage(int page, int pageSize) {
        if (page < 0) page = 0;         // 페이지 번호가 음수면 0 페이지로 보정.
        if (pageSize <= 0) pageSize = 1000; // 페이지 크기가 0 이하이면 기본 1000 사용.

        // big_posts 테이블에서 가장 큰 id (최신 글 id).
        //   SQL: SELECT MAX(id) FROM big_posts;
        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);

        // 가장 작은 id (가장 오래된 글 id).
        //   SQL: SELECT MIN(id) FROM big_posts;
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);

        // 테이블이 비어있으면 maxId, minId 가 null 이므로 빈 리스트 반환.
        if (maxId == null || minId == null) return Collections.emptyList();

        // 예: maxId = 1억, pageSize = 1000
        //    page 0 → 1억 ~ 1억-999
        //    page 1 → (1억-1000) ~ (1억-1999)
        long highId = maxId - (long) page * pageSize;
        // 계산된 highId 가 최소 id 보다 작으면 더 이상 데이터가 없음.
        if (highId < minId) return Collections.emptyList();

        // highId 기준으로 pageSize 개수만큼 뒤로 내려가서 lowId 구하기.
        long lowId = highId - pageSize + 1;
        // lowId 가 minId 보다 작으면 minId 로 보정.
        if (lowId < minId) lowId = minId;

        // ── 실제 조회에 사용하는 SQL ──
        String sql =
                "SELECT id, title, content, writer_id, created_at, updated_at " +
                "FROM big_posts " +
                "WHERE id BETWEEN ? AND ? " +  // id 구간 제한 (lowId ~ highId)
                "ORDER BY id DESC";            // 최신 글(id 큰 것)부터 내림차순 정렬

        // jdbc.query(sql, rowMapper, 파라미터들...)
        //  → WHERE id BETWEEN lowId AND highId 에서 ? 자리에 lowId, highId 바인딩.
        return jdbc.query(sql, new BigPostRowMapper(), lowId, highId);
    }

    // ─────────────────────────────────────
    // ③ 특정 page 안에서 chunk 로 나눠서 가져오기 (lazy-load용)
    //
    //    개념:
    //      - 페이지(page)를 먼저 id 범위로 좁힌 다음,
    //      - 그 안에서 lastId 기준으로 추가 chunk 를 가져옴.
    //
    //    SQL 흐름:
    //      1) MAX(id), MIN(id) → 전체 id 범위.
    //      2) page 번호 → pageHigh, pageLow 계산.
    //      3) WHERE id BETWEEN pageLow AND pageHigh
    //      4) lastId 가 있다면 AND id < lastId 추가.
    //      5) ORDER BY id DESC
    //      6) LIMIT size
    // ─────────────────────────────────────
    public List<BigPostDto> findChunkInPage(int page, int pageSize, Long lastId, int size) {
        if (page < 0) page = 0;
        if (pageSize <= 0) pageSize = 1000;
        if (size <= 0) size = 100;  // 최소 chunk 크기 100.

        // 전체에서 가장 큰 id
        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        // 전체에서 가장 작은 id
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);
        if (maxId == null || minId == null) return Collections.emptyList();

        // 이 page 가 담당하는 id 상한값
        long pageHigh = maxId - (long) page * pageSize;
        if (pageHigh < minId) return Collections.emptyList();

        // 이 page 가 담당하는 id 하한값
        long pageLow = pageHigh - pageSize + 1;
        if (pageLow < minId) pageLow = minId;

        // SELECT 문을 StringBuilder 로 조립.
        StringBuilder sb = new StringBuilder(
                "SELECT id, title, content, writer_id, created_at, updated_at " +
                "FROM big_posts " +
                "WHERE id BETWEEN ? AND ? "
        );
        List<Object> args = new ArrayList<>();
        args.add(pageLow);   // 첫 번째 ? → pageLow
        args.add(pageHigh);  // 두 번째 ? → pageHigh

        // lastId 가 있으면 그보다 작은 id 만 추가로 가져오도록 조건 추가.
        //   AND id < ?  (무한 스크롤에서 "더 이전 글들"만 읽는 효과)
        if (lastId != null) {
            sb.append("AND id < ? ");
            args.add(lastId);
        }

        sb.append("ORDER BY id DESC "); // 최신 글부터
        sb.append("LIMIT ?");           // 최대 size 개수까지

        args.add(size); // LIMIT ? 에 bind 할 값

        // 최종 SQL 예시:
        //   SELECT ...
        //   FROM big_posts
        //   WHERE id BETWEEN pageLow AND pageHigh
        //     AND id < lastId
        //   ORDER BY id DESC
        //   LIMIT size;
        return jdbc.query(sb.toString(), new BigPostRowMapper(), args.toArray());
    }

    // ─────────────────────────────────────
    // ④ 전체 테이블 기준 "무한 스크롤"용 메서드
    //
    //    findFirstChunk:
    //      SELECT ... FROM big_posts
    //      ORDER BY id DESC
    //      LIMIT ?
    //
    //    → 최신 글부터 size 개 가져오기 (첫 화면용).
    // ─────────────────────────────────────
    public List<BigPostDto> findFirstChunk(int size) {
        if (size <= 0) size = 100;

        // """ ... """ : 자바 Text block (Java 15~) 문법.
        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                ORDER BY id DESC
                LIMIT ?
                """;
        // 최신 글 기준 상위 size 개를 가져옴.
        return jdbc.query(sql, new BigPostRowMapper(), size);
    }

    // 전체 범위에서 lastId 보다 작은 것들 중 상위 size개 (무한 스크롤 다음 chunk)
    public List<BigPostDto> findChunkAfter(long lastId, int size) {
        if (size <= 0) size = 100;

        // lastId 보다 작은 id 중 최신 순으로 size개.
        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                WHERE id < ?
                ORDER BY id DESC
                LIMIT ?
                """;
        // WHERE id < lastId → lastId 이전 글만
        // ORDER BY id DESC  → id 큰 것부터
        // LIMIT size        → 최대 size개까지
        return jdbc.query(sql, new BigPostRowMapper(), lastId, size);
    }

    // ─────────────────────────────────────
    // ⑤ 단건 조회
    //
    //    SELECT ... FROM big_posts WHERE id = ?
    // ─────────────────────────────────────
    public BigPostDto findById(Long id) {
        String sql = """
                SELECT id, title, content, writer_id, created_at, updated_at
                FROM big_posts
                WHERE id = ?
                """;
        // id가 PK이므로 결과는 0 또는 1행.
        // queryForObject 는 정확히 1행이 나와야 하며, 없으면 예외 발생.
        return jdbc.queryForObject(sql, new BigPostRowMapper(), id);
    }

    // ─────────────────────────────────────
    // ⑥ INSERT (글쓰기)
    //
    //    INSERT INTO big_posts (title, content, writer_id, created_at, updated_at)
    //    VALUES (?, ?, ?, ?, ?)
    //
    //    → 새 레코드 추가 후 LAST_INSERT_ID()로 생성된 PK를 가져옴.
    // ─────────────────────────────────────
    public Long insert(BigPostDto d) {
        LocalDateTime now = LocalDateTime.now();  // 현재 시각.

        String sql = """
                INSERT INTO big_posts (title, content, writer_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """;

        // jdbc.update: DML(INSERT/UPDATE/DELETE) 실행에 사용.
        jdbc.update(sql,
                d.getTitle(),                 // ?1 → title
                d.getContent(),               // ?2 → content
                d.getWriterId(),              // ?3 → writer_id
                Timestamp.valueOf(now),       // ?4 → created_at
                Timestamp.valueOf(now)        // ?5 → updated_at
        );

        // MySQL/MariaDB 기준: 방금 INSERT 한 레코드의 AUTO_INCREMENT id 조회.
        //   SELECT LAST_INSERT_ID();
        return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    // ─────────────────────────────────────
    // ⑦ UPDATE (수정)
    //
    //    UPDATE big_posts
    //      SET title = ?, content = ?, updated_at = ?
    //      WHERE id = ?
    //
    // ─────────────────────────────────────
    public int update(BigPostDto d) {
        LocalDateTime now = LocalDateTime.now();

        String sql = """
                UPDATE big_posts
                SET title = ?, content = ?, updated_at = ?
                WHERE id = ?
                """;

        // 변경된 행(row) 개수를 int로 반환.
        return jdbc.update(sql,
                d.getTitle(),              // ?1 → 새 title
                d.getContent(),            // ?2 → 새 content
                Timestamp.valueOf(now),    // ?3 → updated_at = now
                d.getId()                  // ?4 → WHERE id = ?
        );
    }

    // ─────────────────────────────────────
    // ⑧ DELETE (삭제)
    //
    //    DELETE FROM big_posts WHERE id = ?
    // ─────────────────────────────────────
    public int delete(Long id) {
        String sql = "DELETE FROM big_posts WHERE id = ?";
        // 삭제된 row 개수 반환.
        return jdbc.update(sql, id);
    }

    // ─────────────────────────────────────
    // ⑨ 검색용 WHERE 절 / 파라미터 빌더
    //
    //    - buildSearchParam() 이 하는 일:
    //      1) type/keyword/from/to 를 보고
    //      2) "writer_id = ?" 같은 WHERE 조건 문자열을 조합하고
    //      3) 그 조건에 맞는 파라미터 리스트를 만들어준다.
    // ─────────────────────────────────────
    private static class SearchParam {
        final String whereSql;   // " WHERE writer_id = ? AND created_at >= ?" 같은 형태.
        final List<Object> params; // 위 whereSql 의 ?에 바인딩할 파라미터 목록.

        SearchParam(String whereSql, List<Object> params) {
            this.whereSql = whereSql;
            this.params = params;
        }
    }

    // type, keyword, from, to 를 입력받아 SearchParam 구성.
    private SearchParam buildSearchParam(
            String type,
            String keyword,
            LocalDate from,
            LocalDate to
    ) {
        String t = (type == null) ? "" : type.toLowerCase();  // type 을 소문자로 통일.
        boolean hasKeyword = (keyword != null && !keyword.isBlank());

        StringBuilder where = new StringBuilder(); // WHERE 절 뒤 내용만 누적.
        List<Object> params = new ArrayList<>();   // 파라미터 값들.

        // 1) 타입 + 키워드 처리
        if (hasKeyword) {
            String kw = keyword.trim();  // 앞뒤 공백 제거.
            if ("author".equals(t)) {
                // 작성자 검색: writer_id = ?
                appendWhere(where, "writer_id = ?");
                params.add(kw); // ? → kw (예: 'user01')
            } else if ("content".equals(t)) {
                // 제목 또는 내용에 키워드가 포함되면 매칭:
                // (title LIKE ? OR content LIKE ?)
                appendWhere(where, "(title LIKE ? OR content LIKE ?)");
                params.add("%" + kw + "%"); // title LIKE '%kw%'
                params.add("%" + kw + "%"); // content LIKE '%kw%'
            } else if ("author_content".equals(t)) {
                // 작성자 = 키워드 OR 제목/내용 LIKE 키워드
                appendWhere(where, "(writer_id = ? OR title LIKE ? OR content LIKE ?)");
                params.add(kw);             // writer_id = kw
                params.add("%" + kw + "%"); // title LIKE '%kw%'
                params.add("%" + kw + "%"); // content LIKE '%kw%'
            }
        }

        // 2) 기간 조건 (created_at 사용)
        if (from != null) {
            // from 날짜의 0시00분.
            LocalDateTime fromDt = from.atStartOfDay();
            // created_at >= from(해당 날짜 0시)
            appendWhere(where, "created_at >= ?");
            params.add(Timestamp.valueOf(fromDt));
        }
        if (to != null) {
            // to + 1일 의 0시 (즉, to 날짜의 끝까지 포함).
            LocalDateTime toDt = to.plusDays(1).atStartOfDay();
            // created_at < 다음날 0시
            appendWhere(where, "created_at < ?");
            params.add(Timestamp.valueOf(toDt));
        }

        // where 에 내용이 있으면 " WHERE " 접두어 붙임.
        String whereSql = where.length() > 0 ? " WHERE " + where : "";
        return new SearchParam(whereSql, params);
    }

    // where StringBuilder 에 AND 를 자동으로 붙여주는 헬퍼.
    private static void appendWhere(StringBuilder where, String expr) {
        if (where.length() > 0) where.append(" AND "); // 이미 조건이 있으면 AND 추가.
        where.append(expr);                            // 새 조건 추가.
    }

    // ─────────────────────────────────────
    // ⑩ 검색 COUNT  (OFFSET 없음)
    //
    //    SELECT COUNT(*)
    //      FROM big_posts
    //      [WHERE ...]   ← buildSearchParam 결과
    // ─────────────────────────────────────
    public long searchCount(
            String type,
            String keyword,
            LocalDate from,
            LocalDate to
    ) {
        // WHERE 절과 파라미터 구성
        SearchParam sp = buildSearchParam(type, keyword, from, to);
        // 예: "SELECT COUNT(*) FROM big_posts WHERE writer_id = ? AND created_at >= ?"
        String sql = "SELECT COUNT(*) FROM big_posts" + sp.whereSql;

        // 파라미터 배열(sp.params.toArray())를 넣어 COUNT(*) 실행.
        Long cnt = jdbc.queryForObject(sql, Long.class, sp.params.toArray());
        return (cnt != null) ? cnt : 0L;
    }

    // ─────────────────────────────────────
    // ⑪ 검색 + 페이지 (id 구간 방식, LIMIT만 사용)
    //
    //    흐름:
    //      1) MAX/MIN id 로 검색 대상 page 의 id 범위 구함.
    //      2) WHERE id BETWEEN lowId AND highId
    //      3) 검색조건 (작성자, 내용, 기간 등) AND 로 추가.
    //      4) ORDER BY id DESC
    //
    //    OFFSET 을 쓰지 않고도 페이지 개념을 구현한 구조.
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

        // 전체 id 최대/최소.
        Long maxId = jdbc.queryForObject("SELECT MAX(id) FROM big_posts", Long.class);
        Long minId = jdbc.queryForObject("SELECT MIN(id) FROM big_posts", Long.class);
        if (maxId == null || minId == null) return Collections.emptyList();

        // 이 page 가 담당할 highId (최신 쪽 경계).
        long highId = maxId - (long) page * pageSize;
        if (highId < minId) return Collections.emptyList();

        // page 범위의 lowId (오래된 쪽 경계).
        long lowId = highId - pageSize + 1;
        if (lowId < minId) lowId = minId;

        // 검색 조건에 따른 WHERE + 파라미터.
        SearchParam sp = buildSearchParam(type, keyword, from, to);

        // buildSearchParam 는 " WHERE ..." 까지 포함이므로
        // 여기서는 이미 "WHERE id BETWEEN ..." 이 있기 때문에
        // 선행 WHERE 를 제거하고 "AND ..." 로만 이어 붙여야 함.
        String extra = sp.whereSql;
        if (extra.startsWith(" WHERE ")) {
            extra = extra.substring(" WHERE ".length());  // 맨 앞 " WHERE " 제거.
        }

        // 기본 SQL: id 범위 조건
        StringBuilder sql = new StringBuilder(
                "SELECT id, title, content, writer_id, created_at, updated_at " +
                "FROM big_posts " +
                "WHERE id BETWEEN ? AND ? "
        );

        List<Object> params = new ArrayList<>();
        params.add(lowId);   // ?1 → lowId
        params.add(highId);  // ?2 → highId

        // 검색 조건이 존재하면 AND 로 붙인다.
        if (!extra.isEmpty()) {
            // "AND writer_id = ? AND created_at >= ?" 같은 형태로 추가.
            sql.append("AND ").append(extra).append(" ");
            // 그에 맞는 파라미터 값도 뒤에 모두 추가.
            params.addAll(sp.params);
        }

        // 최신 글부터 나오도록 정렬.
        sql.append("ORDER BY id DESC");

        // 예 최종 SQL:
        //  SELECT ...
        //    FROM big_posts
        //   WHERE id BETWEEN lowId AND highId
        //     AND writer_id = ?
        //     AND created_at >= ?
        //   ORDER BY id DESC;
        return jdbc.query(sql.toString(), new BigPostRowMapper(), params.toArray());
    }
}
