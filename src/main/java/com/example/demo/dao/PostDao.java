// src/main/java/com/example/demo/dao/PostDao.java
package com.example.demo.dao;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.sql.DataSource;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.PostDto;

@Repository
public class PostDao {

    private final JdbcTemplate jdbc;
    public PostDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** post 테이블 스키마 */
    private static final class SchemaInfo {
        String table;      // post | posts
        String id;         // post_id | id | uuid
        String board;      // board_code | board_uuid | boardCd | board | board_code_id
        String title;      // title
        String content;    // content | contents | body
        String writerId;   // writer_id | author_id | writerId | authorId (옵션)
        String writerName; // writer_name | author_name | writerName | authorName | nickname | name (옵션)
        String createdAt;  // created_at | write_dt | createdAt | reg_dt (옵션)
        String updatedAt;  // updated_at | update_dt | updatedAt | mod_dt (옵션)
    }

    /** board 테이블 스키마 */
    private static final class BoardInfo {
        String table;   // board | boards
        String uuid;    // uuid | board_uuid | id
        String code;    // board_code | code
        String name;    // board_name | name (옵션)
    }

    /** comment 테이블 스키마(캐스케이드 삭제용, 매우 단순화) */
    private static final class CommentInfo {
        String table;    // comment | comments
        String id;       // id | comment_id | uuid (미사용)
        String postId;   // post_id (숫자 FK)
        String postUuid; // post_uuid (문자열 FK)
    }

    private volatile SchemaInfo cachedPost;
    private volatile BoardInfo  cachedBoard;
    private volatile CommentInfo cachedComment;

    // ───────────────────────── 공통 유틸 ─────────────────────────
    private DataSource requireDs() {
        var ds = jdbc.getDataSource();
        if (ds == null) throw new IllegalStateException("DataSource 가 없습니다.");
        return ds;
    }

    private static String findFirstTable(DatabaseMetaData md, List<String> cands) throws SQLException {
        for (String c : cands) {
            for (String t : List.of(c, c.toUpperCase(), c.toLowerCase())) {
                try (ResultSet rs = md.getTables(null, null, t, null)) {
                    if (rs.next()) return rs.getString("TABLE_NAME");
                }
            }
        }
        return null;
    }

    private static Set<String> listColumns(DatabaseMetaData md, String table) throws SQLException {
        Set<String> cols = new HashSet<>();
        try (ResultSet rs = md.getColumns(null, null, table, "%")) {
            while (rs.next()) cols.add(rs.getString("COLUMN_NAME").toLowerCase());
        }
        if (cols.isEmpty()) {
            try (ResultSet rs = md.getColumns(null, null, table.toUpperCase(), "%")) {
                while (rs.next()) cols.add(rs.getString("COLUMN_NAME").toLowerCase());
            }
        }
        return cols;
    }

    private static String pick(Set<String> cols, String... cands) {
        for (String c : cands) if (cols.contains(c.toLowerCase())) return c;
        return null;
    }

    private static boolean isNumericString(String s) {
        return s != null && s.matches("\\d+");
    }

    // ───────────────────────── 스키마 감지 ─────────────────────────
    private SchemaInfo ensurePostResolved() {
        var s = cachedPost;
        if (s != null) return s;

        synchronized (this) {
            if (cachedPost != null) return cachedPost;
            try (Connection conn = requireDs().getConnection()) {
                var md = conn.getMetaData();
                String table = findFirstTable(md, List.of("post", "posts"));
                if (table == null) throw new IllegalStateException("게시판 테이블(post|posts)을 찾을 수 없습니다.");
                var cols = listColumns(md, table);

                var si = new SchemaInfo();
                si.table      = table;
                si.id         = pick(cols, "post_id", "id", "uuid");
                si.board      = pick(cols, "board_code", "board_uuid", "boardCd", "board_code_id", "board");
                si.title      = pick(cols, "title");
                si.content    = pick(cols, "content", "contents", "body");
                si.writerId   = pick(cols, "writer_id", "author_id", "writerId", "authorId");
                si.writerName = pick(cols, "writer_name", "author_name", "writerName", "authorName", "nickname", "name");
                si.createdAt  = pick(cols, "created_at", "write_dt", "createdAt", "reg_dt");
                si.updatedAt  = pick(cols, "updated_at", "update_dt", "updatedAt", "mod_dt");

                if (si.board == null || si.title == null || si.content == null) {
                    throw new IllegalStateException("게시판 스키마 핵심 컬럼 누락. 테이블: " + si.table + ", 보유: " + cols);
                }
                cachedPost = si;
                return si;
            } catch (SQLException e) {
                throw new IllegalStateException("스키마 탐지 실패(post): " + e.getMessage(), e);
            }
        }
    }

    private BoardInfo ensureBoardResolved() {
        var b = cachedBoard;
        if (b != null) return b;

        synchronized (this) {
            if (cachedBoard != null) return cachedBoard;
            try (Connection conn = requireDs().getConnection()) {
                var md = conn.getMetaData();
                String table = findFirstTable(md, List.of("board", "boards"));
                if (table == null) { cachedBoard = null; return null; }
                var cols = listColumns(md, table);

                var bi = new BoardInfo();
                bi.table = table;
                bi.uuid  = pick(cols, "uuid", "board_uuid", "id");
                bi.code  = pick(cols, "board_code", "code");
                bi.name  = pick(cols, "board_name", "name");

                if (bi.uuid == null && bi.code == null) { cachedBoard = null; return null; }
                cachedBoard = bi;
                return bi;
            } catch (SQLException e) {
                throw new IllegalStateException("스키마 탐지 실패(board): " + e.getMessage(), e);
            }
        }
    }

    /** comment 테이블(있으면) */
    private CommentInfo ensureCommentResolved() {
        var c = cachedComment;
        if (c != null) return c;

        synchronized (this) {
            if (cachedComment != null) return cachedComment;
            try (Connection conn = requireDs().getConnection()) {
                var md = conn.getMetaData();
                String table = findFirstTable(md, List.of("comment", "comments"));
                if (table == null) { cachedComment = null; return null; }
                var cols = listColumns(md, table);

                var ci = new CommentInfo();
                ci.table    = table;
                ci.id       = pick(cols, "comment_id", "id", "uuid");
                ci.postId   = pick(cols, "post_id");       // 숫자 FK
                ci.postUuid = pick(cols, "post_uuid");     // 문자열 FK

                cachedComment = ci;
                return ci;
            } catch (SQLException e) {
                throw new IllegalStateException("스키마 탐지 실패(comment): " + e.getMessage(), e);
            }
        }
    }

    private boolean postBoardIsUuid(SchemaInfo s) {
        return s.board != null && s.board.toLowerCase().contains("uuid");
    }

    /** 컨트롤러로부터 받은 보드 코드(BUS/NORM)를 post.board 타입에 맞게 변환 */
    private String resolveBoardValue(String incomingCode, SchemaInfo s) {
        if (incomingCode == null) return null;
        if (!postBoardIsUuid(s)) return incomingCode;

        var bi = ensureBoardResolved();
        if (bi == null || bi.uuid == null || bi.code == null) return incomingCode;

        String sql = "SELECT " + bi.uuid + " FROM " + bi.table + " WHERE " + bi.code + " = ? LIMIT 1";
        var list = jdbc.query(sql, (rs, i) -> rs.getString(1), incomingCode);
        if (list.isEmpty() || list.get(0) == null) {
            throw new IllegalStateException("존재하지 않는 보드 코드입니다: " + incomingCode);
        }
        return list.get(0);
    }

    // ───────────────────────── 목록 조회 ─────────────────────────
    public List<PostDto> findByBoard(String code) {
        var s = ensurePostResolved();

        String orderBy =
            (s.id != null)       ? s.id :
            (s.createdAt != null)? s.createdAt :
            (s.updatedAt != null)? s.updatedAt : s.title;

        String boardVal = resolveBoardValue(code, s);
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.board + " = ? ORDER BY " + orderBy + " DESC";
        return jdbc.query(sql, (rs, i) -> mapRow(rs, s), boardVal);
    }

    private PostDto mapRow(ResultSet rs, SchemaInfo s) throws SQLException {
        var d = new PostDto();

        if (s.id != null) {
            String raw = null;
            try { raw = rs.getString(s.id); } catch (SQLException ignore) {}
            if (raw != null) {
                if (raw.matches("\\d+")) d.setPostId(Long.parseLong(raw));
                else d.setUuid(raw);
            }
        }

        if (s.board != null)      { try { d.setBoardCode(rs.getString(s.board)); } catch (SQLException ignore) {} }
        if (s.title != null)      { try { d.setTitle(rs.getString(s.title)); } catch (SQLException ignore) {} }
        if (s.content != null)    { try { d.setContent(rs.getString(s.content)); } catch (SQLException ignore) {} }
        if (s.writerId != null)   { try { d.setWriterId(rs.getString(s.writerId)); } catch (SQLException ignore) {} }
        if (s.writerName != null) { try { d.setWriterName(rs.getString(s.writerName)); } catch (SQLException ignore) {} }

        if (s.createdAt != null)  { try { var ts = rs.getTimestamp(s.createdAt); if (ts != null) d.setCreatedAt(ts.toLocalDateTime()); } catch (SQLException ignore) {} }
        if (s.updatedAt != null)  { try { var ts = rs.getTimestamp(s.updatedAt); if (ts != null) d.setUpdatedAt(ts.toLocalDateTime()); } catch (SQLException ignore) {} }

        return d;
    }

    // ───────────────────────── 등록 ─────────────────────────
    /** 숫자 PK 스키마면 생성된 키를 반환, UUID 스키마면 null 반환(대신 dto.uuid가 채워짐) */
    public Long insert(PostDto d) {
        var s = ensurePostResolved();

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        boolean idIsUuid = (s.id != null && "uuid".equalsIgnoreCase(s.id));
        String generatedUuid = null;
        if (idIsUuid) {
            generatedUuid = java.util.UUID.randomUUID().toString();
            cols.add(s.id);  vals.add(generatedUuid);
        }

        String boardVal = resolveBoardValue(d.getBoardCode(), s);

        cols.add(s.board);   vals.add(boardVal);
        cols.add(s.title);   vals.add(d.getTitle());
        cols.add(s.content); vals.add(d.getContent());

        if (s.writerId   != null) { cols.add(s.writerId);   vals.add(d.getWriterId()); }
        if (s.writerName != null) { cols.add(s.writerName); vals.add(d.getWriterName()); }

        boolean hasCreated = s.createdAt != null;
        boolean hasUpdated = s.updatedAt != null;

        String sql = "INSERT INTO " + s.table + " (" +
                String.join(", ", cols) +
                (hasCreated ? ", " + s.createdAt : "") +
                (hasUpdated ? ", " + s.updatedAt : "") +
                ") VALUES (" +
                String.join(", ", Collections.nCopies(cols.size(), "?")) +
                (hasCreated ? ", NOW()" : "") +
                (hasUpdated ? ", NOW()" : "") +
                ")";

        KeyHolder kh = new GeneratedKeyHolder();
        try {
            jdbc.update(conn -> {
                PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++) ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        } catch (DataAccessException e) {
            String sql2 = "INSERT INTO " + s.table + " (" + String.join(", ", cols) + ") VALUES (" +
                    String.join(", ", Collections.nCopies(cols.size(), "?")) + ")";
            jdbc.update(conn -> {
                PreparedStatement ps = conn.prepareStatement(sql2, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++) ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        }

        if (idIsUuid) { d.setUuid(generatedUuid); return null; }
        Number key = kh.getKey();
        return (key != null) ? key.longValue() : null;
    }

    // ───────────────────────── 수정 (관리자/무제한) ─────────────────────────
    public int update(PostDto d) {
        var s = ensurePostResolved();
        Object idParam = d.anyId();
        if (s.id == null || idParam == null) {
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");
        }

        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sb.append("UPDATE ").append(s.table).append(" SET ")
          .append(s.title).append(" = ?, ")
          .append(s.content).append(" = ?");
        params.add(d.getTitle());
        params.add(d.getContent());

        if (s.updatedAt != null) {
            sb.append(", ").append(s.updatedAt).append(" = NOW()");
        }

        sb.append(" WHERE ").append(s.id).append(" = ?");
        params.add(idParam);

        try {
            return jdbc.update(sb.toString(), params.toArray());
        } catch (DataAccessException e) {
            String sql2 = "UPDATE " + s.table + " SET " + s.title + " = ?, " + s.content + " = ? WHERE " + s.id + " = ?";
            return jdbc.update(sql2, d.getTitle(), d.getContent(), idParam);
        }
    }

    // ───────────────────────── 수정 (작성자 본인만) ─────────────────────────
    public int updateIfOwner(PostDto d, String ownerId) {
        var s = ensurePostResolved();
        if (s.writerId == null) return 0;
        Object idParam = d.anyId();
        if (s.id == null || idParam == null) throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        String sql = "UPDATE " + s.table + " SET " + s.title + " = ?, " + s.content + " = ?"
                + (s.updatedAt != null ? (", " + s.updatedAt + " = NOW()") : "")
                + " WHERE " + s.id + " = ? AND " + s.writerId + " = ?";

        try {
            return jdbc.update(sql, d.getTitle(), d.getContent(), idParam, ownerId);
        } catch (DataAccessException e) {
            String sql2 = "UPDATE " + s.table + " SET " + s.title + " = ?, " + s.content + " = ?"
                    + " WHERE " + s.id + " = ? AND " + s.writerId + " = ?";
            return jdbc.update(sql2, d.getTitle(), d.getContent(), idParam, ownerId);
        }
    }

    // ───────────────────────── 내부: 댓글 먼저 삭제 ─────────────────────────
    private void cascadeDeleteComments(String idOrNumber) {
        var ci = ensureCommentResolved();
        if (ci == null || ci.table == null) return; // 댓글 테이블이 없으면 패스

        if (isNumericString(idOrNumber) && ci.postId != null) {
            jdbc.update("DELETE FROM " + ci.table + " WHERE " + ci.postId + " = ?", Long.parseLong(idOrNumber));
            return;
        }
        if (!isNumericString(idOrNumber) && ci.postUuid != null) {
            jdbc.update("DELETE FROM " + ci.table + " WHERE " + ci.postUuid + " = ?", idOrNumber);
        }
        // 위 케이스 외에는 구조가 달라서 안전하게 패스(댓글 없어도 삭제는 시도)
    }

    // ───────────────────────── 삭제 (관리자/무제한) ─────────────────────────
    /** 숫자 문자열은 숫자로 파싱해서, 그 외는 그대로 바인딩. 댓글 먼저 제거 */
    public int deleteAny(String idOrNumber) {
        var s = ensurePostResolved();
        if (s.id == null) throw new IllegalStateException("PK가 없어 삭제할 수 없습니다.");

        // 1) 자식 댓글 먼저 제거(외래키 제약 예방)
        cascadeDeleteComments(idOrNumber);

        // 2) 본문 삭제
        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber;
        return jdbc.update("DELETE FROM " + s.table + " WHERE " + s.id + " = ?", param);
    }

    // ───────────────────────── 삭제 (작성자 본인만) ─────────────────────────
    public int deleteIfOwner(String idOrNumber, String ownerId) {
        var s = ensurePostResolved();
        if (s.id == null || s.writerId == null) return 0;

        // 1) 댓글 선삭제
        cascadeDeleteComments(idOrNumber);

        // 2) 본문 삭제(작성자 제한)
        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber;
        String sql = "DELETE FROM " + s.table + " WHERE " + s.id + " = ? AND " + s.writerId + " = ?";
        return jdbc.update(sql, param, ownerId);
    }
}
