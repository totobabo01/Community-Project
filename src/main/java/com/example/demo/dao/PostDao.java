// src/main/java/com/example/demo/dao/PostDao.java
package com.example.demo.dao;

import java.sql.Connection;                      // JDBC 커넥션
import java.sql.DatabaseMetaData;               // DB 메타정보(테이블/컬럼 목록 등)
import java.sql.PreparedStatement;              // PreparedStatement
import java.sql.ResultSet;                      // 쿼리 결과 집합
import java.sql.SQLException;                   // SQL 예외
import java.sql.Statement;                      // 일반 Statement(키 반환 옵션 등)
import java.util.ArrayList;                     // 가변 리스트
import java.util.Collections;                   // 컬렉션 유틸(채우기 등)
import java.util.HashSet;                       // 중복 제거 Set
import java.util.List;                          // 리스트 인터페이스
import java.util.Set;                           // Set 인터페이스

import javax.sql.DataSource;                    // 커넥션 풀/DS

import org.springframework.dao.DataAccessException;                 // 스프링 데이터 접근 예외
import org.springframework.jdbc.core.JdbcTemplate;                  // JDBC 편의 추상화
import org.springframework.jdbc.support.GeneratedKeyHolder;         // 자동생성 키 수신 도우미
import org.springframework.jdbc.support.KeyHolder;                  // 키 홀더 인터페이스
import org.springframework.stereotype.Repository;                   // 스테레오타입: DAO 컴포넌트

import com.example.demo.dto.PostDto;            // 게시글 DTO

@Repository                                    // 스프링 빈 등록(DAO)
public class PostDao {

    private final JdbcTemplate jdbc;           // SQL 실행용 템플릿
    public PostDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }  // 생성자 주입

    /** post 테이블 스키마(컬럼명 캐시) */
    private static final class SchemaInfo {    // 내부 전용: 테이블/컬럼명을 동적으로 탐지해 보관
        String table;                          // 실제 테이블명(post 또는 posts)
        String id;                             // PK 컬럼명(post_id | id | uuid)
        String board;       // post 내부의 보드 식별 컬럼 (board_code or board_uuid)
        String title;                          // 제목 컬럼명
        String content;                        // 본문 컬럼명
        String writerId;                       // 작성자 ID 컬럼명
        String writerName;                     // 작성자 이름/닉네임 컬럼명
        String createdAt;                      // 생성일시 컬럼명
        String updatedAt;                      // 수정일시 컬럼명
    }

    private volatile SchemaInfo cachedPost;    // 멀티스레드 환경에서도 보관/읽기가 안전하도록 volatile로 캐시

    private DataSource requireDs() {           // JdbcTemplate에서 DataSource 확보(없으면 오류)
        var ds = jdbc.getDataSource();
        if (ds == null) throw new IllegalStateException("DataSource 가 없습니다.");
        return ds;
    }

    // 후보 테이블명들 중 실제 존재하는 테이블을 찾아 반환
    private static String findFirstTable(DatabaseMetaData md, List<String> cands) throws SQLException {
        for (String c : cands) {                               // 예: ["post","posts"]
            for (String t : List.of(c, c.toUpperCase(), c.toLowerCase())) { // 대/소문자 변형도 시도
                try (ResultSet rs = md.getTables(null, null, t, null)) {    // 메타데이터에서 테이블 검색
                    if (rs.next()) return rs.getString("TABLE_NAME");       // 발견 시 이름 반환
                }
            }
        }
        return null;                                           // 못 찾으면 null
    }

    // 지정 테이블의 컬럼 목록을 전부 소문자로 수집
    private static Set<String> listColumns(DatabaseMetaData md, String table) throws SQLException {
        Set<String> cols = new HashSet<>();
        try (ResultSet rs = md.getColumns(null, null, table, "%")) {
            while (rs.next()) cols.add(rs.getString("COLUMN_NAME").toLowerCase());
        }
        if (cols.isEmpty()) {                                  // 대소문자 케이스 이슈 대비 재시도
            try (ResultSet rs = md.getColumns(null, null, table.toUpperCase(), "%")) {
                while (rs.next()) cols.add(rs.getString("COLUMN_NAME").toLowerCase());
            }
        }
        return cols;
    }

    // 후보명 배열 중 실제 존재하는 컬럼명을 하나 선택
    private static String pick(Set<String> cols, String... cands) {
        for (String c : cands) if (cols.contains(c.toLowerCase())) return c;
        return null;                                           // 없으면 null(해당 필드 미지원 스키마)
    }

    // 문자열이 순수 숫자 형태인지 검사(정수 PK 판단)
    private static boolean isNumericString(String s) {
        return s != null && s.matches("\\d+");
    }

    // 스키마(테이블/컬럼) 자동 탐지 후 캐시, 이후 재사용
    private SchemaInfo ensurePostResolved() {
        var s = cachedPost;                // 먼저 캐시 조회
        if (s != null) return s;

        synchronized (this) {             // 다중 스레드 초기화 동시성 제어
            if (cachedPost != null) return cachedPost;
            try (Connection conn = requireDs().getConnection()) {
                var md = conn.getMetaData();
                String table = findFirstTable(md, List.of("post", "posts"));   // post|posts 중 실제 존재 탐색
                if (table == null) throw new IllegalStateException("게시판 테이블(post|posts)을 찾을 수 없습니다.");
                var cols = listColumns(md, table);                              // 컬럼 목록 수집

                var si = new SchemaInfo();
                si.table = table;                                              // 실제 테이블명
                si.id = pick(cols, "post_id", "id", "uuid");                   // PK 컬럼 후보 중 선택
                si.board = pick(cols, "board_code", "board_uuid", "boardCd", "board"); // 보드 식별 컬럼 후보
                si.title = pick(cols, "title");
                si.content = pick(cols, "content", "contents", "body");
                si.writerId = pick(cols, "writer_id", "author_id");
                si.writerName = pick(cols, "writer_name", "author_name", "nickname", "name");
                si.createdAt = pick(cols, "created_at", "write_dt", "createdAt");
                si.updatedAt = pick(cols, "updated_at", "update_dt", "updatedAt");

                cachedPost = si;                                               // 캐시 저장
                return si;
            } catch (SQLException e) {
                throw new IllegalStateException("스키마 탐지 실패(post): " + e.getMessage(), e);
            }
        }
    }

    /* ====== 보조: board_code → board.uuid 변환 ====== */
    private String findBoardUuidByCode(String boardCode) {
        // board 테이블은 코드에 관계없이 고정(프로젝트 스키마 기준)
        final String sql = "SELECT uuid FROM board WHERE board_code = ? AND is_active = 1";
        List<String> list = jdbc.query(sql, (rs, i) -> rs.getString(1), boardCode); // 단일 컬럼 매핑
        return list.isEmpty() ? null : list.get(0);                                 // 없으면 null, 있으면 첫 값
    }
    private boolean boardColumnIsUuid(SchemaInfo s) {
        return s.board != null && "board_uuid".equalsIgnoreCase(s.board); // 보드 컬럼이 uuid 타입인지 판별
    }

    // ───────────────────────── 목록 조회 ─────────────────────────
    public List<PostDto> findByBoard(String code) {
        var s = ensurePostResolved();                          // 스키마 확보
        String orderBy =                                       // 정렬 기준 우선순위: id > createdAt > updatedAt > title
            (s.id != null) ? s.id :
            (s.createdAt != null) ? s.createdAt :
            (s.updatedAt != null) ? s.updatedAt : s.title;

        if (boardColumnIsUuid(s)) {                            // post.board_uuid 스키마
            // JOIN으로 code→uuid 매칭
            String sql =
                "SELECT p.* " +
                "FROM " + s.table + " p " +
                "JOIN board b ON p." + s.board + " = b.uuid " +
                "WHERE b.board_code = ? " +
                "ORDER BY " + orderBy + " DESC";
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code);
        } else {                                               // post.board_code 스키마
            String sql =
                "SELECT * FROM " + s.table +
                " WHERE " + s.board + " = ? " +
                " ORDER BY " + orderBy + " DESC";
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code);
        }
    }

    public long countByBoard(String code) {
        // ensurePostResolved()는 PostDao가 처음 사용할 때 DB 스키마(테이블/컬럼명)를 자동으로 탐지해 캐시에 저장하고, 
        // 그 이후에는 캐시된 결과를 돌려주는 초기화+캐싱 메서드
        var s = ensurePostResolved();
        if (boardColumnIsUuid(s)) { // boardColumnIsUuid(s)는 PostDao 안의 아주 작은 헬퍼 메서드
            String sql =
                "SELECT COUNT(*) " +
                "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " +
                "WHERE b.board_code = ?";
            Long cnt = jdbc.queryForObject(sql, Long.class, code); // 카운트 단일 값 조회
            return cnt == null ? 0L : cnt;
        } else {
            String sql =
                "SELECT COUNT(*) FROM " + s.table + " WHERE " + s.board + " = ?";
            Long cnt = jdbc.queryForObject(sql, Long.class, code);
            return cnt == null ? 0L : cnt;
        }
    }

    public List<PostDto> findByBoardPaged(String code, int page, int size) {
        var s = ensurePostResolved();
        String orderBy =
            (s.id != null) ? s.id :
            (s.createdAt != null) ? s.createdAt :
            (s.updatedAt != null) ? s.updatedAt : s.title;
        int offset = Math.max(0, page) * Math.max(1, size);    // 음수 방지 후 offset 계산

        if (boardColumnIsUuid(s)) { 
            String sql =
                "SELECT p.* " +
                "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " +
                "WHERE b.board_code = ? " +
                "ORDER BY " + orderBy + " DESC LIMIT ? OFFSET ?";
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code, size, offset);
        } else {
            String sql =
                "SELECT * FROM " + s.table +
                " WHERE " + s.board + " = ? " +
                " ORDER BY " + orderBy + " DESC LIMIT ? OFFSET ?";
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code, size, offset);
        }
    }

    // ResultSet → PostDto 매핑(스키마 유연성 고려, 컬럼 존재 시만 읽음)
    private PostDto mapRow(ResultSet rs, SchemaInfo s) throws SQLException {
        var d = new PostDto();

        if (s.id != null) {                                     // PK 컬럼이 있을 때만 시도
            String raw = null;
            try { raw = rs.getString(s.id); } catch (SQLException ignore) {}
            if (raw != null) {
                if (raw.matches("\\d+")) d.setPostId(Long.parseLong(raw)); // 숫자면 postId
                else d.setUuid(raw);                                       // 아니면 uuid
            }
        }

        // post.board_code를 직접 가질 때만 boardCode 세팅( board_uuid 스키마는 JOIN 안하면 못 얻음 )
        if (s.board != null && !boardColumnIsUuid(s)) {
            try { d.setBoardCode(rs.getString(s.board)); } catch (SQLException ignore) {}
        }

        if (s.title != null)      { try { d.setTitle(rs.getString(s.title)); } catch (SQLException ignore) {} }
        if (s.content != null)    { try { d.setContent(rs.getString(s.content)); } catch (SQLException ignore) {} }
        if (s.writerId != null)   { try { d.setWriterId(rs.getString(s.writerId)); } catch (SQLException ignore) {} }
        if (s.writerName != null) { try { d.setWriterName(rs.getString(s.writerName)); } catch (SQLException ignore) {} }
        if (s.createdAt != null)  { try { var ts = rs.getTimestamp(s.createdAt); if (ts != null) d.setCreatedAt(ts.toLocalDateTime()); } catch (SQLException ignore) {} }
        if (s.updatedAt != null)  { try { var ts = rs.getTimestamp(s.updatedAt); if (ts != null) d.setUpdatedAt(ts.toLocalDateTime()); } catch (SQLException ignore) {} }

        return d;
    }

    // ───────────────────────── 등록(Create) ─────────────────────────
    public Long insert(PostDto d) {
        var s = ensurePostResolved();

        List<String> cols = new ArrayList<>();      // INSERT 컬럼 리스트
        List<Object> vals = new ArrayList<>();      // INSERT 값 리스트(바인딩 파라미터)

        boolean idIsUuid = (s.id != null && "uuid".equalsIgnoreCase(s.id)); // PK가 uuid 컬럼인지 여부
        String generatedUuid = null;
        if (idIsUuid) {                              // uuid PK 스키마면 서버에서 UUID 생성해 함께 INSERT
            generatedUuid = java.util.UUID.randomUUID().toString();
            cols.add(s.id); vals.add(generatedUuid);
        }

        // ★ 핵심: post.board 컬럼이 board_uuid이면, code→uuid 변환 후 넣는다
        if (boardColumnIsUuid(s)) {
            String boardUuid = findBoardUuidByCode(d.getBoardCode());
            if (boardUuid == null) throw new IllegalStateException("board_code를 찾을 수 없습니다: " + d.getBoardCode());
            cols.add(s.board); vals.add(boardUuid);
        } else {
            cols.add(s.board); vals.add(d.getBoardCode());      // board_code 스키마면 코드 그대로 저장
        }

        cols.add(s.title);   vals.add(d.getTitle());            // 제목
        cols.add(s.content); vals.add(d.getContent());          // 본문

        if (s.writerId != null)   { cols.add(s.writerId);   vals.add(d.getWriterId()); }
        if (s.writerName != null) { cols.add(s.writerName); vals.add(d.getWriterName()); }

        boolean hasCreated = s.createdAt != null;               // created_at 컬럼 존재 여부
        boolean hasUpdated = s.updatedAt != null;               // updated_at 컬럼 존재 여부

        // created_at/updated_at 컬럼이 있으면 NOW()로 자동세팅
        String sql = "INSERT INTO " + s.table + " (" +
                String.join(", ", cols) +
                (hasCreated ? ", " + s.createdAt : "") +
                (hasUpdated ? ", " + s.updatedAt : "") +
                ") VALUES (" +
                String.join(", ", Collections.nCopies(cols.size(), "?")) +
                (hasCreated ? ", NOW()" : "") +
                (hasUpdated ? ", NOW()" : "") +
                ")";

        KeyHolder kh = new GeneratedKeyHolder();                // 자동 증가 키 수신용
        try {
            jdbc.update(conn -> {                               // PreparedStatement 생성 콜백
                PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++) ps.setObject(i + 1, vals.get(i)); // ? 바인딩
                return ps;
            }, kh);
        } catch (DataAccessException e) {
            // created_at/updated_at 미존재 스키마 호환(위 쿼리 실패 시 컬럼 제외 버전 재시도)
          String sql2 = "INSERT INTO " + s.table + " (" + String.join(", ", cols) + ") VALUES (" +
            String.join(", ", Collections.nCopies(cols.size(), "?")) + ")";
            jdbc.update(conn -> {
                PreparedStatement ps = conn.prepareStatement(sql2, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++) ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        }

        if (idIsUuid) { d.setUuid(generatedUuid); return null; } // uuid PK면 DB 자동키 없음 → 응답 DTO에 uuid만 채움
        Number key = kh.getKey();                                // 숫자 PK 스키마면 생성된 키 수신
        return (key != null) ? key.longValue() : null;           // 있으면 long 변환 반환, 없으면 null
    }

    // ───────────────────────── 수정(Update: 관리자 전용) ─────────────────────────
    public int update(PostDto d) {
        var s = ensurePostResolved();
        Object idParam = d.anyId();                              // DTO에서 postId 또는 uuid 아무거나 추출
        if (s.id == null || idParam == null)
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        StringBuilder sb = new StringBuilder();                  // 가독성 위해 StringBuilder 사용
        List<Object> params = new ArrayList<>();

        sb.append("UPDATE ").append(s.table).append(" SET ")
          .append(s.title).append(" = ?, ")
          .append(s.content).append(" = ?");                     // 제목/내용 변경
        params.add(d.getTitle());
        params.add(d.getContent());

        if (s.updatedAt != null) sb.append(", ").append(s.updatedAt).append(" = NOW()"); // 수정시간 갱신(있을 때만)
        sb.append(" WHERE ").append(s.id).append(" = ?");        // PK 조건
        params.add(idParam);

        return jdbc.update(sb.toString(), params.toArray());     // 실행 후 영향 행 수 반환
    }

    // ───────────────────────── 수정(Update: 작성자 본인만) ─────────────────────────
    public int updateIfOwner(PostDto d, String ownerId) {
        var s = ensurePostResolved();
        if (s.writerId == null) return 0;                        // 작성자 컬럼이 없으면 소유자 검증 불가 → 실패 처리

        Object idParam = d.anyId();
        if (s.id == null || idParam == null)
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        String sql = "UPDATE " + s.table +
                " SET " + s.title + " = ?, " + s.content + " = ?" +
                (s.updatedAt != null ? (", " + s.updatedAt + " = NOW()") : "") +
                " WHERE " + s.id + " = ? AND " + s.writerId + " = ?"; // PK + 작성자 일치 조건

        try {
            return jdbc.update(sql, d.getTitle(), d.getContent(), idParam, ownerId);
        } catch (Exception e) {
            // updatedAt 컬럼 없는 스키마 호환(예전 DB)
            String sql2 = "UPDATE " + s.table +
                    " SET " + s.title + " = ?, " + s.content + " = ?" +
                    " WHERE " + s.id + " = ? AND " + s.writerId + " = ?";
            return jdbc.update(sql2, d.getTitle(), d.getContent(), idParam, ownerId);
        }
    }

    // ───────────────────────── 삭제(Delete: 관리자 전용) ─────────────────────────
    public int deleteAny(String idOrNumber) {
        var s = ensurePostResolved();
        if (s.id == null) throw new IllegalStateException("PK가 없어 삭제할 수 없습니다.");
        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber; // 숫자/문자 키 모두 지원
        return jdbc.update("DELETE FROM " + s.table + " WHERE " + s.id + " = ?", param);
    }

    // ───────────────────────── 삭제(Delete: 작성자 본인만) ─────────────────────────
    public int deleteIfOwner(String idOrNumber, String ownerId) {
        var s = ensurePostResolved();
        if (s.id == null || s.writerId == null) return 0;        // 작성자 검증 불가 시 실패

        // 댓글이 있으면 함께 삭제 시도(FK 제약/스키마 차이 대비 try-catch로 무시 가능 처리)
        try {
            jdbc.update("DELETE FROM comment WHERE post_uuid = ? OR post_id = ?", idOrNumber, idOrNumber);
        } catch (Exception ignore) {}

        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber;
        String sql = "DELETE FROM " + s.table +
                     " WHERE " + s.id + " = ? AND " + s.writerId + " = ?"; // PK + 소유자 일치 조건
        return jdbc.update(sql, param, ownerId);
    }
}
