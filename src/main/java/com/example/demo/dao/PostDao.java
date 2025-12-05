// src/main/java/com/example/demo/dao/PostDao.java
package com.example.demo.dao;                     // 이 파일이 속한 패키지(dao 패키지 = DB 접근 계층)

// ───────── JDBC / 컬렉션 관련 import ─────────
import java.sql.Connection;                      // DB와 통신할 때 사용하는 연결 객체
import java.sql.DatabaseMetaData;               // DB의 테이블/컬럼 정보를 읽어오는 메타데이터 객체
import java.sql.PreparedStatement;              // ? 바인딩이 가능한 SQL 문 객체
import java.sql.ResultSet;                      // SELECT 쿼리 결과(행들의 집합)를 표현하는 객체
import java.sql.SQLException;                   // JDBC 작업 중 발생하는 예외 타입
import java.sql.Statement;                      // 기본 SQL 문 객체(여기선 생성된 키 반환 옵션을 주기 위해 사용)
import java.util.ArrayList;                     // 가변 리스트 구현체
import java.util.Collections;                   // 컬렉션 유틸리티 (예: nCopies 사용)
import java.util.HashSet;                       // 중복 허용하지 않는 Set 구현체
import java.util.List;                          // 리스트 인터페이스
import java.util.Set;                           // Set 인터페이스

import javax.sql.DataSource;                    // 커넥션 풀을 나타내는 인터페이스

import org.springframework.dao.DataAccessException;                 // 스프링에서 래핑된 데이터 접근 예외
import org.springframework.jdbc.core.JdbcTemplate;                  // JDBC를 편하게 사용하게 해주는 템플릿 클래스
import org.springframework.jdbc.support.GeneratedKeyHolder;         // INSERT 시 자동 생성된 PK를 담는 구현체
import org.springframework.jdbc.support.KeyHolder;                  // 생성된 키를 담기 위한 인터페이스
import org.springframework.stereotype.Repository;                   // 이 클래스가 DAO 역할을 한다는 스테레오타입 애너테이션

import com.example.demo.dto.PostDto;            // 게시글 데이터를 담는 DTO

@Repository                                    // 스프링이 이 클래스를 DAO(Repository 계층)로 인식해서 빈으로 등록
public class PostDao {                         // 게시글 관련 DB 작업을 담당하는 DAO 클래스 선언

    private final JdbcTemplate jdbc;           // 실제 SQL을 실행할 때 사용할 JdbcTemplate 필드

    public PostDao(JdbcTemplate jdbc) {        // 생성자: 외부에서 JdbcTemplate을 주입받음(스프링이 자동으로 넣어줌)
        this.jdbc = jdbc;                      // 주입받은 JdbcTemplate을 필드에 저장
    }

    /** post 테이블 스키마(컬럼명 캐시) */
    private static final class SchemaInfo {    // 내부 전용 클래스: post 테이블의 테이블명/컬럼명을 기억해두기 위한 구조체 역할
        String table;                          // 실제 테이블명 (예: "post" 또는 "posts")
        String id;                             // PK 컬럼명 (예: "post_id" 또는 "id" 또는 "uuid")
        String board;                          // 게시판 식별 컬럼명 (예: "board_code" 또는 "board_uuid")
        String title;                          // 제목 컬럼명
        String content;                        // 본문 컬럼명
        String writerId;                       // 작성자 ID 컬럼명
        String writerName;                     // 작성자 이름/닉네임 컬럼명
        String createdAt;                      // 생성일시 컬럼명
        String updatedAt;                      // 수정일시 컬럼명

        // 🔽 첨부파일 관련 컬럼명(해당 컬럼이 실제 테이블에 있을 때만 사용)
        String fileUrl;                        // 대표 파일 URL을 저장하는 컬럼(file_url)
        String fileType;                       // 대표 파일 타입(IMAGE/FILE/FOLDER 등)을 저장하는 컬럼(file_type)
        String fileName;                       // 대표 파일의 이름(원본 파일명)을 저장하는 컬럼(file_name)
        String fileContentType;               // 대표 파일의 MIME 타입을 저장하는 컬럼(file_content_type)

        // ★ 추가됨: file_list_json - 여러 첨부파일 정보를 JSON 문자열로 저장하는 컬럼명
        String fileListJson;                   // file_list_json 컬럼명
    }

    private volatile SchemaInfo cachedPost;    // 탐지한 스키마 정보를 캐시로 저장하는 필드(volatile로 멀티스레드에서 가시성 보장)

    private DataSource requireDs() {           // JdbcTemplate에서 DataSource를 꺼내오는 헬퍼 메서드
        var ds = jdbc.getDataSource();         // JdbcTemplate이 사용하는 DataSource를 가져옴
        if (ds == null)                        // 만약 DataSource가 없다면
            throw new IllegalStateException("DataSource 가 없습니다."); // 실행할 수 없는 상태이므로 예외 발생
        return ds;                             // 정상이라면 DataSource 반환
    }

    // 후보 테이블명들 중 실제 존재하는 테이블을 찾아 반환
    private static String findFirstTable(DatabaseMetaData md, List<String> cands) throws SQLException {
        for (String c : cands) {                               // 예: ["post", "posts"] 후보를 하나씩 순회
            for (String t : List.of(c, c.toUpperCase(), c.toLowerCase())) { // 원래 이름, 대문자, 소문자 버전까지 모두 시도
                try (ResultSet rs = md.getTables(null, null, t, null)) {    // DB 메타데이터에서 해당 이름의 테이블 조회
                    if (rs.next())                                         // 결과가 하나라도 있다면(=테이블이 존재한다면)
                        return rs.getString("TABLE_NAME");                  // 그 테이블 이름을 반환
                }                                                           // try-with-resources로 ResultSet 자동 close
            }
        }
        return null;                                           // 모든 후보를 다 뒤졌는데도 없으면 null 반환
    }

    // 지정 테이블의 컬럼 목록을 전부 소문자로 수집
    private static Set<String> listColumns(DatabaseMetaData md, String table) throws SQLException {
        Set<String> cols = new HashSet<>();                     // 컬럼명을 담을 Set 생성(중복 방지)
        try (ResultSet rs = md.getColumns(null, null, table, "%")) { // 해당 테이블의 컬럼 정보 조회
            while (rs.next())                                   // 한 컬럼씩 순회
                cols.add(rs.getString("COLUMN_NAME").toLowerCase()); // 컬럼명을 소문자로 변환해서 Set에 추가
        }
        if (cols.isEmpty()) {                                  // 혹시 대소문자 문제로 아무 컬럼도 못 읽어온 경우
            try (ResultSet rs = md.getColumns(null, null, table.toUpperCase(), "%")) { // 테이블명을 대문자로 다시 시도
                while (rs.next())                              // 다시 조회된 컬럼들을 순회
                    cols.add(rs.getString("COLUMN_NAME").toLowerCase()); // 소문자로 Set에 추가
            }
        }
        return cols;                                           // 최종적으로 모은 컬럼명 집합 반환
    }

    // 후보명 배열 중 실제 존재하는 컬럼명을 하나 선택
    private static String pick(Set<String> cols, String... cands) {
        for (String c : cands)                                 // 후보 컬럼명들을 순회
            if (cols.contains(c.toLowerCase()))                // 실제 컬럼 목록에 이 이름이 존재하면
                return c;                                      // 그 이름을 반환
        return null;                                           // 하나도 없으면 null(해당 필드 없는 스키마)
    }

    // 문자열이 순수 숫자 형태인지 검사(정수 PK 판단)
    private static boolean isNumericString(String s) {
        return s != null && s.matches("\\d+");                 // null 아니고, 0~9 숫자만으로 구성된 경우 true
    }

    // 간단한 문자열 공백/널 체크
    private static boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();               // null 아니고, trim했을 때 빈 문자열이 아니면 true
    }

    // 스키마(테이블/컬럼) 자동 탐지 후 캐시, 이후 재사용
    private SchemaInfo ensurePostResolved() {
        var s = cachedPost;                // 먼저 이미 캐시된 스키마 정보가 있는지 확인
        if (s != null) return s;           // 이미 있다면 그대로 반환

        synchronized (this) {             // 여러 스레드가 동시에 초기화하는 걸 막기 위해 동기화 블록
            if (cachedPost != null)       // 동기화 블록 안에 들어와서도 한 번 더 체크(더블 체크 패턴)
                return cachedPost;
            try (Connection conn = requireDs().getConnection()) { // DataSource에서 커넥션 하나 받아오기
                var md = conn.getMetaData();                      // 이 커넥션으로부터 DB 메타데이터 얻기
                String table = findFirstTable(md, List.of("post", "posts"));   // "post" 또는 "posts" 중 실제 존재하는 테이블 찾기
                if (table == null)                                // 둘 다 없다면
                    throw new IllegalStateException("게시판 테이블(post|posts)을 찾을 수 없습니다."); // 예외 발생
                var cols = listColumns(md, table);                // 해당 테이블의 모든 컬럼명 목록 가져오기

                var si = new SchemaInfo();                        // 스키마 정보 담을 객체 생성
                si.table = table;                                 // 실제 테이블명 기록
                si.id = pick(cols, "post_id", "id", "uuid");      // PK 컬럼 후보들 중 실제 존재하는 것 선택
                si.board = pick(cols, "board_code", "board_uuid", "boardcd", "board"); // 보드 식별 컬럼 후보들 중 선택
                si.title = pick(cols, "title");                   // title 컬럼 존재 시 기록
                si.content = pick(cols, "content", "contents", "body"); // content/contents/body 중 있는 것 기록
                si.writerId = pick(cols, "writer_id", "author_id");     // 작성자 ID 후보
                si.writerName = pick(cols, "writer_name", "author_name", "nickname", "name"); // 작성자 이름 후보
                si.createdAt = pick(cols, "created_at", "write_dt", "createdat"); // 생성시간 컬럼 후보
                si.updatedAt = pick(cols, "updated_at", "update_dt", "updatedat"); // 수정시간 컬럼 후보

                // 🔽 첨부파일 관련 컬럼 자동 탐지
                si.fileUrl = pick(cols, "file_url");              // file_url 컬럼 여부 확인
                si.fileType = pick(cols, "file_type");            // file_type 컬럼 여부 확인
                si.fileName = pick(cols, "file_name");            // file_name 컬럼 여부 확인
                si.fileContentType = pick(cols, "file_content_type"); // file_content_type 컬럼 여부 확인

                // ★ 추가됨: file_list_json 컬럼 자동 탐지
                si.fileListJson = pick(cols, "file_list_json");   // 여러 파일 정보를 JSON으로 저장하는 컬럼이 있으면 기록

                cachedPost = si;                                  // 탐지된 스키마 정보를 캐시에 저장
                return si;                                        // 그리고 반환
            } catch (SQLException e) {                            // 메타데이터 조회 중 SQL 예외 발생 시
                throw new IllegalStateException("스키마 탐지 실패(post): " + e.getMessage(), e); // IllegalState로 래핑해서 던짐
            }
        }
    }

    /* ====== 보조: board_code → board.uuid 변환 ====== */
    private String findBoardUuidByCode(String boardCode) {
        // board 테이블은 코드에 관계없이 고정(프로젝트 스키마 기준)
        final String sql = "SELECT uuid FROM board WHERE board_code = ? AND is_active = 1"; // 활성화된(board.is_active=1) 게시판 중에서 uuid 조회
        try {
            List<String> list = jdbc.query(                   // JdbcTemplate으로 쿼리 실행
                    sql,                                      // 위에서 정의한 SQL 사용
                    (rs, i) -> rs.getString(1),               // 결과 한 행당 첫 번째 컬럼(uuid)을 String으로 매핑
                    boardCode                                 // ? 자리에 들어갈 파라미터(board_code)
            );
            return list.isEmpty() ? null : list.get(0);       // 결과가 없으면 null, 있으면 첫 번째 uuid 반환
        } catch (DataAccessException e) {
            // board 테이블이 없거나 접근 실패하면 그냥 null 반환해서 fallback 사용
            System.out.println("[PostDao] findBoardUuidByCode 실패, boardCode=" + boardCode + " / " + e.getMessage());
            return null;
        }
    }

    private boolean boardColumnIsUuid(SchemaInfo s) {
        // 게시글 테이블의 board 컬럼명이 "board_uuid"인지(대소문자 무시) 확인
        return s.board != null && "board_uuid".equalsIgnoreCase(s.board); // true면 board_uuid 스키마
    }

    // 🔎 검색/기간 조건을 공통으로 WHERE 절에 추가하는 보조 메서드
    private void appendSearchConditions(
            StringBuilder sb,        // SQL 문자열을 이어붙일 StringBuilder
            List<Object> params,     // ? 자리에 바인딩할 값들을 담는 리스트
            SchemaInfo s,            // 스키마 정보(컬럼명 등을 확인할 때 사용)
            String type,             // 검색 타입(author, content, title, author_content, time 등)
            String keyword,          // 검색 키워드(작성자/내용/제목 등에 LIKE로 사용할 값)
            String from,             // 기간 검색 시작일(yyyy-MM-dd)
            String to,               // 기간 검색 종료일(yyyy-MM-dd)
            boolean useAliasP        // SQL에서 컬럼 앞에 "p." 같은 별칭을 붙일지 여부
    ) {
        String t = (type == null ? "" : type.trim().toLowerCase()); // 검색 타입을 소문자로 정리(null이면 빈문자열)
        String kw = (keyword == null ? "" : keyword.trim());        // 키워드도 앞뒤 공백 제거
        String alias = useAliasP ? "p." : "";                       // 별칭 사용 시 "p.", 아니면 빈 문자열

        // 1) 기간 검색(type == "time")
        if ("time".equals(t)) {                                     // 검색 타입이 time인 경우
            // created_at을 우선 사용, 없으면 updated_at 사용
            String timeCol = s.createdAt != null ? s.createdAt : s.updatedAt;
            if (timeCol != null) {                                  // 시간 컬럼이 실제로 존재할 때만 처리
                if (hasText(from)) {                                // from 값이 비어있지 않다면
                    sb.append(" AND ").append(alias).append(timeCol).append(" >= ?"); // AND timeCol >= ? 조건 추가
                    // '2025-11-10' 형태가 들어온다고 가정 → 시작 시각은 00:00:00 으로 확장
                    params.add(from.trim() + " 00:00:00");          // 바인딩 값에 "날짜 00:00:00" 형태로 추가
                }
                if (hasText(to)) {                                  // to 값이 비어있지 않다면
                    sb.append(" AND ").append(alias).append(timeCol).append(" <= ?"); // AND timeCol <= ? 조건 추가
                    // '2025-11-10' → 끝 시각은 23:59:59까지 포함하도록 확장
                    params.add(to.trim() + " 23:59:59");            // 바인딩 값에 "날짜 23:59:59" 추가
                }
            }
            return;                                                 // time 검색이면 여기에서 메서드 종료(키워드 검색은 하지 않음)
        }

        // 2) 키워드 기반 검색(작성자/내용/제목/복합)
        if (!hasText(kw)) return;                                  // 키워드가 비어 있으면 아무 조건도 추가하지 않고 종료

        String likeValue = "%" + kw + "%";                         // LIKE 검색에 사용할 패턴 값(양쪽에 % 붙여줌)
        List<String> cols = new ArrayList<>();                     // 어떤 컬럼을 LIKE로 검색할지 담을 리스트

        switch (t) {                                               // 검색 타입에 따라 분기
            case "author":                                         // 작성자 검색
                if (s.writerId != null) cols.add(alias + s.writerId);     // writer_id 컬럼이 있으면 추가
                if (s.writerName != null) cols.add(alias + s.writerName); // writer_name 컬럼이 있으면 추가
                break;
            case "content":                                        // 내용만 검색
                if (s.content != null) cols.add(alias + s.content);
                break;
            case "title":                                          // 제목만 검색
                if (s.title != null) cols.add(alias + s.title);
                break;
            case "author_content":                                 // 제목+내용+작성자 통합 검색
            default:                                               // 혹은 타입이 지정되지 않았을 때 기본 동작
                if (s.title != null) cols.add(alias + s.title);          // 제목 컬럼 추가
                if (s.content != null) cols.add(alias + s.content);      // 내용 컬럼 추가
                if (s.writerId != null) cols.add(alias + s.writerId);    // 작성자 ID 컬럼 추가
                if (s.writerName != null) cols.add(alias + s.writerName);// 작성자 이름 컬럼 추가
                break;
        }

        if (cols.isEmpty()) return;                                // 실제 검색할 컬럼이 하나도 없으면 그대로 종료

        sb.append(" AND (");                                       // WHERE 뒤에 AND ( ... ) 구문 시작
        for (int i = 0; i < cols.size(); i++) {                    // 선택된 컬럼들 순회
            if (i > 0) sb.append(" OR ");                          // 두 번째 컬럼부터는 OR로 연결
            sb.append(cols.get(i)).append(" LIKE ?");              // col LIKE ? 형식으로 추가
            params.add(likeValue);                                 // 각 LIKE 조건마다 동일한 "%keyword%" 값 바인딩
        }
        sb.append(")");                                            // AND ( ... ) 닫기
    }

    // ───────────────────────── 목록 조회 ─────────────────────────
    public List<PostDto> findByBoard(String code) {
        var s = ensurePostResolved();                          // 먼저 스키마 정보(테이블명/컬럼명)를 확보

        // ✅ 수정: updated_at > created_at > id 순으로 정렬
        StringBuilder orderBy = new StringBuilder();

        if (s.updatedAt != null) {
            // 1순위: updated_at 이 있으면 그걸로 최신 순
            orderBy.append(s.updatedAt).append(" DESC");
            // 2순위: created_at 이 있으면 같이 정렬
            if (s.createdAt != null) {
                orderBy.append(", ").append(s.createdAt).append(" DESC");
            }
        } else if (s.createdAt != null) {
            // updated_at 없으면 created_at 기준
            orderBy.append(s.createdAt).append(" DESC");
        } else if (s.id != null) {
            // 둘 다 없으면 id 기준
            orderBy.append(s.id).append(" DESC");
        } else {
            orderBy.append(s.title).append(" DESC");
        }

        // 마지막으로 id 가 있고 아직 포함 안돼 있으면 tie-breaker 로 추가
        if (s.id != null && !orderBy.toString().contains(s.id + " DESC")) {
            orderBy.append(", ").append(s.id).append(" DESC");
        }

        if (boardColumnIsUuid(s)) {                            // 게시글 테이블의 board 컬럼이 board_uuid 타입인 경우
            String sql =
                    "SELECT p.* " +
                    "FROM " + s.table + " p " +
                    "JOIN board b ON p." + s.board + " = b.uuid " +
                    "WHERE b.board_code = ? " +
                    "ORDER BY " + orderBy;
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code);
        } else {
            String sql =
                    "SELECT * FROM " + s.table +
                    " WHERE " + s.board + " = ? " +
                    " ORDER BY " + orderBy;
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code);
        }
    }

    // 🔢 기존: 검색 조건 없는 단순 count 버전
    public long countByBoard(String code) {
        return countByBoard(code, null, null, null, null);
    }

    // 🔢 확장: 검색/기간 조건까지 반영하는 countByBoard
    public long countByBoard(String code, String type, String keyword, String from, String to) {
        var s = ensurePostResolved();

        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        if (boardColumnIsUuid(s)) {
            String sqlHead =
                    "SELECT COUNT(*) " +
                    "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " +
                    "WHERE b.board_code = ?";
            sb.append(sqlHead);
            params.add(code);

            appendSearchConditions(sb, params, s, type, keyword, from, to, true);
        } else {
            String sqlHead =
                    "SELECT COUNT(*) FROM " + s.table + " WHERE " + s.board + " = ?";
            sb.append(sqlHead);
            params.add(code);

            appendSearchConditions(sb, params, s, type, keyword, from, to, false);
        }

        Long cnt = jdbc.queryForObject(
                sb.toString(),
                Long.class,
                params.toArray()
        );
        return cnt == null ? 0L : cnt;
    }

    // 📄 기존: 검색 조건 없는 기본 페이징 버전
    public List<PostDto> findByBoardPaged(String code, int page, int size) {
        return findByBoardPaged(code, page, size, null, null, null, null);
    }

    // 📄 확장: 검색/기간 조건까지 반영하는 페이징 조회
    public List<PostDto> findByBoardPaged(
            String code,
            int page,
            int size,
            String type,
            String keyword,
            String from,
            String to
    ) {
        var s = ensurePostResolved();                 // 스키마 정보 확보

        // ✅ 수정: updated_at > created_at > id 순으로 정렬
        StringBuilder orderBy = new StringBuilder();

        if (s.updatedAt != null) {
            // 1순위: updated_at 이 있으면 그걸로 최신 순
            orderBy.append(s.updatedAt).append(" DESC");
            // 2순위: created_at 이 있으면 같이 정렬
            if (s.createdAt != null) {
                orderBy.append(", ").append(s.createdAt).append(" DESC");
            }
        } else if (s.createdAt != null) {
            // updated_at 없으면 created_at 기준
            orderBy.append(s.createdAt).append(" DESC");
        } else if (s.id != null) {
            // 둘 다 없으면 id 기준
            orderBy.append(s.id).append(" DESC");
        } else {
            orderBy.append(s.title).append(" DESC");
        }

        // 마지막으로 id 가 있고 아직 포함 안돼 있으면 tie-breaker 로 추가
        if (s.id != null && !orderBy.toString().contains(s.id + " DESC")) {
            orderBy.append(", ").append(s.id).append(" DESC");
        }

        int offset = Math.max(0, page) * Math.max(1, size);

        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        if (boardColumnIsUuid(s)) {
            sb.append("SELECT p.* ")
              .append("FROM ").append(s.table).append(" p JOIN board b ON p.")
              .append(s.board).append(" = b.uuid ")
              .append("WHERE b.board_code = ?");

            params.add(code);

            appendSearchConditions(sb, params, s, type, keyword, from, to, true);

            sb.append(" ORDER BY ").append(orderBy).append(" LIMIT ? OFFSET ?");
            params.add(size);
            params.add(offset);

            String sql = sb.toString();
            return jdbc.query(
                    sql,
                    (rs, i) -> mapRow(rs, s),
                    params.toArray()
            );
        } else {
            sb.append("SELECT * FROM ").append(s.table)
              .append(" WHERE ").append(s.board).append(" = ?");

            params.add(code);

            appendSearchConditions(sb, params, s, type, keyword, from, to, false);

            sb.append(" ORDER BY ").append(orderBy).append(" LIMIT ? OFFSET ?");
            params.add(size);
            params.add(offset);

            String sql = sb.toString();
            return jdbc.query(
                    sql,
                    (rs, i) -> mapRow(rs, s),
                    params.toArray()
            );
        }
    }

    // ResultSet → PostDto 매핑(스키마 유연성 고려, 컬럼 존재 시만 읽음)
    private PostDto mapRow(ResultSet rs, SchemaInfo s) throws SQLException {
        var d = new PostDto();

        if (s.id != null) {
            String raw = null;
            try { raw = rs.getString(s.id); } catch (SQLException ignore) {}
            if (raw != null) {
                if (raw.matches("\\d+"))
                    d.setPostId(Long.parseLong(raw));
                else
                    d.setUuid(raw);
            }
        }

        if (s.board != null && !boardColumnIsUuid(s)) {
            try { d.setBoardCode(rs.getString(s.board)); } catch (SQLException ignore) {}
        }

        if (s.title != null) {
            try { d.setTitle(rs.getString(s.title)); } catch (SQLException ignore) {}
        }
        if (s.content != null) {
            try { d.setContent(rs.getString(s.content)); } catch (SQLException ignore) {}
        }

        if (s.fileUrl != null) {
            try { d.setFileUrl(rs.getString(s.fileUrl)); } catch (SQLException ignore) {}
        }
        if (s.fileType != null) {
            try { d.setFileType(rs.getString(s.fileType)); } catch (SQLException ignore) {}
        }
        if (s.fileName != null) {
            try { d.setFileName(rs.getString(s.fileName)); } catch (SQLException ignore) {}
        }
        if (s.fileContentType != null) {
            try { d.setFileContentType(rs.getString(s.fileContentType)); } catch (SQLException ignore) {}
        }
        if (s.fileListJson != null) {
            try { d.setFileListJson(rs.getString(s.fileListJson)); } catch (SQLException ignore) {}
        }

        if (s.writerId != null) {
            try { d.setWriterId(rs.getString(s.writerId)); } catch (SQLException ignore) {}
        }
        if (s.writerName != null) {
            try { d.setWriterName(rs.getString(s.writerName)); } catch (SQLException ignore) {}
        }
        if (s.createdAt != null) {
            try {
                var ts = rs.getTimestamp(s.createdAt);
                if (ts != null)
                    d.setCreatedAt(ts.toLocalDateTime());
            } catch (SQLException ignore) {}
        }
        if (s.updatedAt != null) {
            try {
                var ts = rs.getTimestamp(s.updatedAt);
                if (ts != null)
                    d.setUpdatedAt(ts.toLocalDateTime());
            } catch (SQLException ignore) {}
        }

        return d;
    }

    // ───────────────────────── 등록(Create) ─────────────────────────
    public Long insert(PostDto d) {
        var s = ensurePostResolved();

        // 🔥 방법2: boardCode 비어 있으면 기본값을 'NORM' 으로 사용
        String boardCode = d.getBoardCode();
        if (!hasText(boardCode)) {
            boardCode = "NORM";
            d.setBoardCode(boardCode);
            System.out.println("[PostDao] boardCode 가 비어있어 임시로 'NORM' 사용");
        }

        List<String> cols = new ArrayList<>();
        List<Object> vals = new ArrayList<>();

        boolean idIsUuid = (s.id != null && "uuid".equalsIgnoreCase(s.id));
        String generatedUuid = null;

        if (idIsUuid) {
            generatedUuid = java.util.UUID.randomUUID().toString();
            cols.add(s.id);
            vals.add(generatedUuid);
        }

        if (s.board != null) {
            if (boardColumnIsUuid(s)) {
                String boardUuid = null;
                try {
                    boardUuid = findBoardUuidByCode(boardCode);
                } catch (Exception e) {
                    System.out.println("[PostDao] board uuid 조회 중 예외, code=" + boardCode + " / " + e.getMessage());
                }

                if (boardUuid != null) {
                    cols.add(s.board);
                    vals.add(boardUuid);
                } else {
                    System.out.println("[PostDao] board uuid를 찾지 못하여 코드 문자열로 대체 저장: " + boardCode);
                    cols.add(s.board);
                    vals.add(boardCode);
                }
            } else {
                cols.add(s.board);
                vals.add(boardCode);
            }
        }

        if (s.title != null) {
            cols.add(s.title);
            vals.add(d.getTitle());
        }

        if (s.content != null) {
            cols.add(s.content);
            vals.add(d.getContent());
        }

        if (s.fileUrl != null) {
            cols.add(s.fileUrl);
            vals.add(d.getFileUrl());
        }
        if (s.fileType != null) {
            cols.add(s.fileType);
            vals.add(d.getFileType());
        }
        if (s.fileName != null) {
            cols.add(s.fileName);
            vals.add(d.getFileName());
        }
        if (s.fileContentType != null) {
            cols.add(s.fileContentType);
            vals.add(d.getFileContentType());
        }
        if (s.fileListJson != null) {
            cols.add(s.fileListJson);
            vals.add(d.getFileListJson());
        }

        if (s.writerId != null)   {
            cols.add(s.writerId);
            vals.add(d.getWriterId());
        }
        if (s.writerName != null) {
            cols.add(s.writerName);
            vals.add(d.getWriterName());
        }

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
                for (int i = 0; i < vals.size(); i++)
                    ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        } catch (DataAccessException e) {
            System.out.println("[PostDao] insert 1차 시도 실패, created/updated 제거 후 재시도: " + e.getMessage());
            String sql2 = "INSERT INTO " + s.table + " (" +
                    String.join(", ", cols) + ") VALUES (" +
                    String.join(", ", Collections.nCopies(cols.size(), "?")) + ")";

            jdbc.update(conn -> {
                PreparedStatement ps = conn.prepareStatement(sql2, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++)
                    ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        }

        if (idIsUuid) {
            d.setUuid(generatedUuid);
            return null;
        }

        Number key = kh.getKey();
        return (key != null) ? key.longValue() : null;
    }

    // ───────────────────────── 수정(Update: 관리자 전용) ─────────────────────────
    public int update(PostDto d) {
        var s = ensurePostResolved();
        Object idParam = d.anyId();
        if (s.id == null || idParam == null)
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sb.append("UPDATE ").append(s.table).append(" SET ")
          .append(s.title).append(" = ?, ")
          .append(s.content).append(" = ?");
        params.add(d.getTitle());
        params.add(d.getContent());

        if (s.fileUrl != null && d.getFileUrl() != null) {
            sb.append(", ").append(s.fileUrl).append(" = ?");
            params.add(d.getFileUrl());
        }
        if (s.fileType != null && d.getFileType() != null) {
            sb.append(", ").append(s.fileType).append(" = ?");
            params.add(d.getFileType());
        }
        if (s.fileName != null && d.getFileName() != null) {
            sb.append(", ").append(s.fileName).append(" = ?");
            params.add(d.getFileName());
        }
        if (s.fileContentType != null && d.getFileContentType() != null) {
            sb.append(", ").append(s.fileContentType).append(" = ?");
            params.add(d.getFileContentType());
        }
        if (s.fileListJson != null && d.getFileListJson() != null) {
            sb.append(", ").append(s.fileListJson).append(" = ?");
            params.add(d.getFileListJson());
        }

        if (s.updatedAt != null)
            sb.append(", ").append(s.updatedAt).append(" = NOW()");

        sb.append(" WHERE ").append(s.id).append(" = ?");
        params.add(idParam);

        return jdbc.update(sb.toString(), params.toArray());
    }

    // ───────────────────────── 수정(Update: 작성자 본인만) ─────────────────────────
    public int updateIfOwner(PostDto d, String ownerId) {
        var s = ensurePostResolved();
        if (s.writerId == null)
            return 0;

        Object idParam = d.anyId();
        if (s.id == null || idParam == null)
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sb.append("UPDATE ").append(s.table)
          .append(" SET ").append(s.title).append(" = ?, ").append(s.content).append(" = ?");
        params.add(d.getTitle());
        params.add(d.getContent());

        if (s.fileUrl != null && d.getFileUrl() != null) {
            sb.append(", ").append(s.fileUrl).append(" = ?");
            params.add(d.getFileUrl());
        }
        if (s.fileType != null && d.getFileType() != null) {
            sb.append(", ").append(s.fileType).append(" = ?");
            params.add(d.getFileType());
        }
        if (s.fileName != null && d.getFileName() != null) {
            sb.append(", ").append(s.fileName).append(" = ?");
            params.add(d.getFileName());
        }
        if (s.fileContentType != null && d.getFileContentType() != null) {
            sb.append(", ").append(s.fileContentType).append(" = ?");
            params.add(d.getFileContentType());
        }
        if (s.fileListJson != null && d.getFileListJson() != null) {
            sb.append(", ").append(s.fileListJson).append(" = ?");
            params.add(d.getFileListJson());
        }

        if (s.updatedAt != null) {
            sb.append(", ").append(s.updatedAt).append(" = NOW()");
        }

        sb.append(" WHERE ").append(s.id).append(" = ? AND ").append(s.writerId).append(" = ?");

        params.add(idParam);
        params.add(ownerId);

        String sql = sb.toString();

        try {
            return jdbc.update(sql, params.toArray());
        } catch (Exception e) {
            if (s.updatedAt != null) {
                StringBuilder sb2 = new StringBuilder();
                List<Object> p2 = new ArrayList<>();

                sb2.append("UPDATE ").append(s.table)
                   .append(" SET ").append(s.title).append(" = ?, ").append(s.content).append(" = ?");
                p2.add(d.getTitle());
                p2.add(d.getContent());

                if (s.fileUrl != null && d.getFileUrl() != null) {
                    sb2.append(", ").append(s.fileUrl).append(" = ?");
                    p2.add(d.getFileUrl());
                }
                if (s.fileType != null && d.getFileType() != null) {
                    sb2.append(", ").append(s.fileType).append(" = ?");
                    p2.add(d.getFileType());
                }
                if (s.fileName != null && d.getFileName() != null) {
                    sb2.append(", ").append(s.fileName).append(" = ?");
                    p2.add(d.getFileName());
                }
                if (s.fileContentType != null && d.getFileContentType() != null) {
                    sb2.append(", ").append(s.fileContentType).append(" = ?");
                    p2.add(d.getFileContentType());
                }
                if (s.fileListJson != null && d.getFileListJson() != null) {
                    sb2.append(", ").append(s.fileListJson).append(" = ?");
                    p2.add(d.getFileListJson());
                }

                sb2.append(" WHERE ").append(s.id).append(" = ? AND ").append(s.writerId).append(" = ?");
                p2.add(idParam);
                p2.add(ownerId);

                return jdbc.update(sb2.toString(), p2.toArray());
            }
            throw e;
        }
    }

    // ───────────────────────── 삭제(Delete: 관리자 전용) ─────────────────────────
    public int deleteAny(String idOrNumber) {
        var s = ensurePostResolved();
        if (s.id == null)
            throw new IllegalStateException("PK가 없어 삭제할 수 없습니다.");

        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber;
        return jdbc.update("DELETE FROM " + s.table + " WHERE " + s.id + " = ?", param);
    }

    // ───────────────────────── 삭제(Delete: 작성자 본인만) ─────────────────────────
    public int deleteIfOwner(String idOrNumber, String ownerId) {
        var s = ensurePostResolved();
        if (s.id == null || s.writerId == null)
            return 0;

        try {
            jdbc.update("DELETE FROM comment WHERE post_uuid = ? OR post_id = ?", idOrNumber, idOrNumber);
        } catch (Exception ignore) {}

        Object param = isNumericString(idOrNumber) ?
                Long.parseLong(idOrNumber) : idOrNumber;

        String sql = "DELETE FROM " + s.table +
                     " WHERE " + s.id + " = ? AND " + s.writerId + " = ?";

        return jdbc.update(sql, param, ownerId);
    }

    // ───────────────────────── 🔎 단건 조회(편집 화면에서 사용) ─────────────────────────
    public PostDto findById(Long id) {
        if (id == null) return null;
        var s = ensurePostResolved();
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?";
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), id);
        return list.isEmpty() ? null : list.get(0);
    }

    public PostDto findByKey(String key) {
        if (key == null || key.isBlank()) return null;
        var s = ensurePostResolved();
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?";
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), key);
        return list.isEmpty() ? null : list.get(0);
    }

    public PostDto findOneByAnyId(String idOrKey) {
        if (idOrKey == null || idOrKey.isBlank()) return null;
        return isNumericString(idOrKey) ?
                findById(Long.parseLong(idOrKey)) :
                findByKey(idOrKey);
    }
}
