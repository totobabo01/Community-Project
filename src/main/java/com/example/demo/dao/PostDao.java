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
                si.board = pick(cols, "board_code", "board_uuid", "boardcd", "board"); // 보드 식별 컬럼 후보
                si.title = pick(cols, "title");
                si.content = pick(cols, "content", "contents", "body");
                si.writerId = pick(cols, "writer_id", "author_id");
                si.writerName = pick(cols, "writer_name", "author_name", "nickname", "name");
                si.createdAt = pick(cols, "created_at", "write_dt", "createdat");
                si.updatedAt = pick(cols, "updated_at", "update_dt", "updatedat");

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
                "SELECT COUNT(*) " +                                         // 1) 전체 행(레코드) 개수를 세기 위한 COUNT 쿼리의 SELECT 부분
                "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " + 
                // 2) FROM 절: 게시글 테이블(s.table)을 p라는 별칭으로 사용하고,
                //    board 테이블을 b라는 별칭으로 JOIN.
                //    JOIN 조건: p.(게시글의 보드 FK 컬럼 = s.board) = b.uuid
                //    → 즉, '이 글이 어느 게시판(board)에 속하는지'를 board.uuid로 연결함.
                "WHERE b.board_code = ?";                                   // 3) WHERE 절: board_code가 특정 값(물음표 자리)인 게시판의 글만 대상으로 COUNT
                                                                 //    ?는 PreparedStatement에서 바인딩할 파라미터(예: 'bus', 'notice' 등 게시판 코드)
            Long cnt = jdbc.queryForObject(sql, Long.class, code); // 카운트 단일 값 조회
            return cnt == null ? 0L : cnt;
        } else {                                                              // 앞의 if (boardColumnIsUuid(s)) 아닐 때 실행되는 분기.
            String sql =
            "SELECT COUNT(*) FROM " + s.table + " WHERE " + s.board + " = ?"; 
        // SQL 문자열 조립:
        // - s.table : 게시글 테이블 이름 (예: "posts")
        // - s.board : 게시글 테이블 안에서 보드를 가리키는 FK 컬럼명 (예: "board_id")
        // 최종 SQL 예시: "SELECT COUNT(*) FROM posts WHERE board_id = ?"
        // → 특정 board_id에 해당하는 게시글이 몇 개 있는지 세는 쿼리.

        Long cnt = jdbc.queryForObject(sql, Long.class, code);
        // jdbc.queryForObject:
        //   - 첫 번째 인자: 방금 만든 SQL
        //   - 두 번째 인자: 결과를 매핑할 타입 (여기선 Long.class, 즉 COUNT(*) 결과를 Long으로 받음)
        //   - 세 번째 인자: ? 자리에 들어갈 값 (여기선 code, 보드 식별값)
        // 실행 결과:
        //   - board_id = code 인 행의 개수를 Long 타입으로 돌려받음
        //   - 결과가 없으면 null 이 들어올 수도 있음(드라이버/설정에 따라 다르지만, 방어 코드로 처리).

         return cnt == null ? 0L : cnt;
        // cnt가 null이면 0L(0이라는 Long 값)을 반환하고,
        // null이 아니면 실제 COUNT 결과(cnt)를 그대로 반환.
        // → 호출하는 쪽에서는 "해당 게시판 글 개수"를 항상 Long 값으로 안전하게 받게 됨.
        }
    }

    public List<PostDto> findByBoardPaged(String code, int page, int size) {
        // ensurePostResolved()는 “게시글 테이블에 대한 컬럼/테이블 이름들을 한 번 해석(Resolve)해서, 이후엔 그 정보를 재사용하도록 보장”하는 헬퍼
    var s = ensurePostResolved();                 // 게시글 테이블 메타정보를 준비/보장.
                                                  // 예: s.table(테이블명), s.board(보드 FK 컬럼명),
                                                  //     s.id(기본키 컬럼명), s.createdAt/s.updatedAt(시간 컬럼명) 등.

    String orderBy =
        (s.id != null) ? s.id :                   // 1순위: PK(보통 자동 증가 id)가 있으면 그 컬럼으로 정렬
        (s.createdAt != null) ? s.createdAt :     // 2순위: 생성일 컬럼이 있으면 그걸로 정렬
        (s.updatedAt != null) ? s.updatedAt :     // 3순위: 수정일 컬럼이 있으면 그걸로 정렬
        s.title;                                  // 마지막 fallback: 제목 컬럼으로 정렬(최악의 경우라도 정렬 가능하게)

    int offset = Math.max(0, page) * Math.max(1, size); // 페이지네이션 offset 계산.
                                                         // page 음수 방지(최소 0), size 최소 1 보장 → 안전한 곱셈.

    if (boardColumnIsUuid(s)) {                  // 게시글 테이블의 보드 참조 컬럼(s.board)이 UUID 타입인지 판별.
                                                 // - UUID면 보통 게시글.p.board_uuid = board.uuid 형태라 JOIN 필요
                                                 // - 숫자 FK라면 바로 WHERE p.board_id = ? 로 필터링 가능
        String sql =
            "SELECT p.* " +
            "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " + // 게시글과 board 테이블을 UUID로 조인
            "WHERE b.board_code = ? " +                                             // 외부에서 받은 보드 코드로 필터
            "ORDER BY " + orderBy + " DESC LIMIT ? OFFSET ?";                       // 최신순(내림차순) + 페이지네이션
        return jdbc.query(                                                          // Spring JdbcTemplate 질의 실행
            sql,                                                                    //  - sql: 위에서 만든 동적 SQL
            (rs, i) -> mapRow(rs, s),                                               //  - RowMapper: ResultSet → PostDto 매핑
            code, size, offset                                                      //  - 바인딩 파라미터: board_code, LIMIT, OFFSET
        );
    } else {
        String sql =
            "SELECT * FROM " + s.table +                                            // 조인 없이 바로 게시글 테이블 조회
            " WHERE " + s.board + " = ? " +                                         // 숫자 FK 등인 경우: 보드 식별값으로 직접 필터링
            " ORDER BY " + orderBy + " DESC LIMIT ? OFFSET ?";                      // 동일하게 최신순 + 페이지네이션
        return jdbc.query(
            sql,
            (rs, i) -> mapRow(rs, s),
            code, size, offset                                                      //  - 보드 식별값(code)이 숫자/문자 모두 가능하도록 설계된 듯
        );
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

    // ───────────────────────── 🔎 단건 조회(편집 화면에서 사용) ─────────────────────────
    /** 숫자 PK로 단건 조회 */
    public PostDto findById(Long id) {
        if (id == null) return null;
        var s = ensurePostResolved();
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?";
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), id);
        return list.isEmpty() ? null : list.get(0);
    }

    /** UUID/문자열 키로 단건 조회 */
    public PostDto findByKey(String key) {
        if (key == null || key.isBlank()) return null;
        var s = ensurePostResolved();
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?";
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), key);
        return list.isEmpty() ? null : list.get(0);
    }

    /** 숫자/문자 구분 없이 하나 받아 단건 조회(내부 유틸, 필요 시 사용) */
    public PostDto findOneByAnyId(String idOrKey) {
        if (idOrKey == null || idOrKey.isBlank()) return null;
        return isNumericString(idOrKey) ? findById(Long.parseLong(idOrKey)) : findByKey(idOrKey);
    }
}
