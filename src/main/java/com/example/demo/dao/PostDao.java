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
        String fileContentType;                // 대표 파일의 MIME 타입을 저장하는 컬럼(file_content_type)

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
        List<String> list = jdbc.query(                   // JdbcTemplate으로 쿼리 실행
                sql,                                      // 위에서 정의한 SQL 사용
                (rs, i) -> rs.getString(1),               // 결과 한 행당 첫 번째 컬럼(uuid)을 String으로 매핑
                boardCode                                 // ? 자리에 들어갈 파라미터(board_code)
        );
        return list.isEmpty() ? null : list.get(0);       // 결과가 없으면 null, 있으면 첫 번째 uuid 반환
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
        String orderBy =                                       // 정렬 기준 선정(우선순위: id > created_at > updated_at > title)
                (s.id != null) ? s.id :
                (s.createdAt != null) ? s.createdAt :
                (s.updatedAt != null) ? s.updatedAt : s.title;

        if (boardColumnIsUuid(s)) {                            // 게시글 테이블의 board 컬럼이 board_uuid 타입인 경우
            // JOIN으로 board_code → board.uuid 매칭 후 해당 게시판 글들을 조회
            String sql =
                    "SELECT p.* " +
                    "FROM " + s.table + " p " +                // 게시글 테이블을 p라는 별칭으로 사용
                    "JOIN board b ON p." + s.board + " = b.uuid " + // p.board_uuid = b.uuid 조건으로 board 테이블과 조인
                    "WHERE b.board_code = ? " +                // 원하는 게시판 코드만 필터링
                    "ORDER BY " + orderBy + " DESC";           // 위에서 정한 컬럼 기준으로 내림차순 정렬
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code); // 쿼리 실행 후 각 행을 PostDto로 매핑해서 리스트 반환
        } else {                                               // 게시글 테이블이 board_code 같은 문자열 컬럼을 직접 가지고 있는 경우
            String sql =
                    "SELECT * FROM " + s.table +               // 게시글 테이블 전체에서
                    " WHERE " + s.board + " = ? " +            // board_code(또는 유사 컬럼) = ? 인 것만 필터링
                    " ORDER BY " + orderBy + " DESC";          // 정렬
            return jdbc.query(sql, (rs, i) -> mapRow(rs, s), code); // 쿼리 실행 후 결과 매핑
        }
    }

    // 🔢 기존: 검색 조건 없는 단순 count 버전
    public long countByBoard(String code) {
        // 검색 조건(type/keyword/from/to)을 쓰지 않는 기본 버전은
        // 확장 버전(countByBoard(code, type, keyword, from, to))에 null을 넘겨서 재사용
        return countByBoard(code, null, null, null, null);
    }

    // 🔢 확장: 검색/기간 조건까지 반영하는 countByBoard
    public long countByBoard(String code, String type, String keyword, String from, String to) {
        // ensurePostResolved()는 PostDao가 처음 사용할 때 DB 스키마를 자동으로 탐지해 캐시에 저장하고,
        // 이후 호출에서는 캐시된 스키마 정보를 재사용하게 해주는 메서드
        var s = ensurePostResolved();

        StringBuilder sb = new StringBuilder();                // 동적으로 SQL을 조립하기 위한 StringBuilder
        List<Object> params = new ArrayList<>();               // ? 바인딩 값을 담을 리스트

        if (boardColumnIsUuid(s)) {                            // board 컬럼이 uuid인 스키마라면
            String sqlHead =
                    "SELECT COUNT(*) " +                       // 1) 전체 행 개수를 세는 SELECT COUNT(*) 부분
                    "FROM " + s.table + " p JOIN board b ON p." + s.board + " = b.uuid " +
                    // 2) 게시글 테이블 p와 board 테이블 b를 조인
                    //    조인 조건: p.board_uuid = b.uuid
                    "WHERE b.board_code = ?";                  // 3) WHERE: 특정 board_code에 해당하는 글만 대상으로 카운트
            sb.append(sqlHead);                                // 조합된 SQL 헤더를 StringBuilder에 추가
            params.add(code);                                  // 첫 번째 파라미터: board_code

            // 🔍 type/keyword/from/to 값에 따라 추가적인 WHERE 조건을 붙여줌
            appendSearchConditions(sb, params, s, type, keyword, from, to, true); // true → p. 별칭 사용
        } else {                                               // board_code 를 직접 쓰는 스키마인 경우
            String sqlHead =
                    "SELECT COUNT(*) FROM " + s.table + " WHERE " + s.board + " = ?";
            // 예: SELECT COUNT(*) FROM posts WHERE board_code = ?
            sb.append(sqlHead);                                // SQL 헤더 추가
            params.add(code);                                  // board_code 파라미터 추가

            // 🔍 검색/기간 조건 추가 (JOIN이 아니므로 컬럼 앞에 p. 안 붙임)
            appendSearchConditions(sb, params, s, type, keyword, from, to, false);
        }

        Long cnt = jdbc.queryForObject(                        // COUNT 쿼리 실행
                sb.toString(),                                 // 완성된 SQL
                Long.class,                                    // 결과를 Long 타입으로 매핑
                params.toArray()                               // 바인딩 파라미터 배열
        );
        // cnt가 null일 수도 있기 때문에 방어적으로 처리
        return cnt == null ? 0L : cnt;                         // null이면 0, 아니면 실제 카운트 값 반환
    }

    // 📄 기존: 검색 조건 없는 기본 페이징 버전
    public List<PostDto> findByBoardPaged(String code, int page, int size) {
        // 기존 시그니처를 유지하면서, 검색 조건 없는 버전으로 확장 메서드를 재사용
        return findByBoardPaged(code, page, size, null, null, null, null);
    }

    // 📄 확장: 검색/기간 조건까지 반영하는 페이징 조회
    public List<PostDto> findByBoardPaged(
            String code,        // 게시판 코드
            int page,           // 페이지 번호(0부터 시작)
            int size,           // 한 페이지당 글 개수
            String type,        // 검색 타입(author, content, title, author_content, time)
            String keyword,     // 검색 키워드
            String from,        // 기간 검색 시작일
            String to           // 기간 검색 종료일
    ) {
        // ensurePostResolved()는 “게시글 테이블에 대한 컬럼/테이블 이름들을 한 번 해석해서 이후 재사용”하는 역할
        var s = ensurePostResolved();                 // 스키마 정보 확보 (테이블명, 컬럼명 등)

        String orderBy =
                (s.id != null) ? s.id :                   // 1순위: PK 컬럼이 있으면 그걸로 정렬
                (s.createdAt != null) ? s.createdAt :     // 2순위: created_at 컬럼
                (s.updatedAt != null) ? s.updatedAt :     // 3순위: updated_at 컬럼
                s.title;                                  // 마지막 대안: 제목 컬럼 기준 정렬

        int offset = Math.max(0, page) * Math.max(1, size); // page와 size를 안전하게 보정해서 offset 계산

        StringBuilder sb = new StringBuilder();        // SQL 조립용 StringBuilder
        List<Object> params = new ArrayList<>();       // 바인딩 파라미터 리스트

        if (boardColumnIsUuid(s)) {                    // board 컬럼이 uuid인 스키마라면
            sb.append("SELECT p.* ")
              .append("FROM ").append(s.table).append(" p JOIN board b ON p.")
              .append(s.board).append(" = b.uuid ")
              .append("WHERE b.board_code = ?");

            params.add(code);                          // board_code 바인딩

            // 🔍 검색/기간 조건 추가(p. 별칭 사용)
            appendSearchConditions(sb, params, s, type, keyword, from, to, true);

            sb.append(" ORDER BY ").append(orderBy).append(" DESC LIMIT ? OFFSET ?");
            params.add(size);                          // LIMIT 값 바인딩
            params.add(offset);                        // OFFSET 값 바인딩

            String sql = sb.toString();                // 최종 SQL 문자열로 변환
            return jdbc.query(                         // 쿼리 실행
                    sql,
                    (rs, i) -> mapRow(rs, s),          // 각 ResultSet 행을 PostDto로 매핑하는 람다
                    params.toArray()                   // 바인딩 값들
            );
        } else {                                       // board_code를 직접 들고 있는 스키마
            sb.append("SELECT * FROM ").append(s.table)
              .append(" WHERE ").append(s.board).append(" = ?");

            params.add(code);                          // board_code 바인딩

            // 🔍 검색/기간 조건 추가(별칭 없이 컬럼명만 사용)
            appendSearchConditions(sb, params, s, type, keyword, from, to, false);

            sb.append(" ORDER BY ").append(orderBy).append(" DESC LIMIT ? OFFSET ?");
            params.add(size);
            params.add(offset);

            String sql = sb.toString();                // 최종 SQL
            return jdbc.query(                         // 쿼리 실행
                    sql,
                    (rs, i) -> mapRow(rs, s),          // ResultSet → PostDto 변환
                    params.toArray()
            );
        }
    }

    // ResultSet → PostDto 매핑(스키마 유연성 고려, 컬럼 존재 시만 읽음)
    private PostDto mapRow(ResultSet rs, SchemaInfo s) throws SQLException {
        var d = new PostDto();                         // 빈 PostDto 객체 생성

        if (s.id != null) {                            // PK 컬럼명이 있을 때만 시도
            String raw = null;
            try { raw = rs.getString(s.id); } catch (SQLException ignore) {} // PK 값을 문자열로 가져오기
            if (raw != null) {                         // 값이 null이 아니면
                if (raw.matches("\\d+"))               // 숫자 형태라면
                    d.setPostId(Long.parseLong(raw));  // postId(숫자 PK)에 설정
                else
                    d.setUuid(raw);                    // 숫자가 아니라면 UUID 문자열로 간주하여 uuid 필드에 설정
            }
        }

        // post.board_code를 직접 가지고 있는 스키마일 때만 boardCode 세팅
        if (s.board != null && !boardColumnIsUuid(s)) {
            try { d.setBoardCode(rs.getString(s.board)); } catch (SQLException ignore) {}
        }

        if (s.title != null) {
            try { d.setTitle(rs.getString(s.title)); } catch (SQLException ignore) {} // 제목 컬럼값 → title
        }
        if (s.content != null) {
            try { d.setContent(rs.getString(s.content)); } catch (SQLException ignore) {} // 내용 컬럼값 → content
        }

        // 🔽 첨부파일 관련 컬럼 매핑(존재할 때만)
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
        // ★ 추가됨: file_list_json 컬럼 매핑
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
                var ts = rs.getTimestamp(s.createdAt);   // created_at 컬럼을 Timestamp로 읽기
                if (ts != null)                          // null이 아니면
                    d.setCreatedAt(ts.toLocalDateTime()); // LocalDateTime으로 변환해서 DTO에 저장
            } catch (SQLException ignore) {}
        }
        if (s.updatedAt != null) {
            try {
                var ts = rs.getTimestamp(s.updatedAt);   // updated_at 컬럼 Timestamp 읽기
                if (ts != null)
                    d.setUpdatedAt(ts.toLocalDateTime()); // LocalDateTime 변환 후 DTO에 저장
            } catch (SQLException ignore) {}
        }

        return d;                                       // 완성된 PostDto 반환
    }

    // ───────────────────────── 등록(Create) ─────────────────────────
    // ✅ 게시글(Post)을 DB에 INSERT 하고, 생성된 PK(숫자형이면)를 리턴하는 메서드
    public Long insert(PostDto d) {
        // 현재 사용 중인 게시글 테이블 스키마 정보를 가져옴
        // (테이블명, PK 컬럼명, board 컬럼명, created_at/updated_at 등)
        var s = ensurePostResolved();

        // INSERT 시 사용할 컬럼 이름들을 담을 리스트
        List<String> cols = new ArrayList<>();      // INSERT할 컬럼명 목록
        // 각 컬럼에 매핑될 실제 값(바인딩 파라미터)을 담을 리스트
        List<Object> vals = new ArrayList<>();      // INSERT할 값 목록

        // PK 컬럼(s.id)이 존재하고, 그 이름이 "uuid"인지 검사
        boolean idIsUuid = (s.id != null && "uuid".equalsIgnoreCase(s.id)); // PK가 uuid 컬럼인지 여부
        // 서버에서 생성한 uuid 값을 임시로 저장할 변수
        String generatedUuid = null;

        // 만약 PK가 uuid 컬럼인 스키마라면,
        if (idIsUuid) {                              // uuid를 직접 INSERT 해야 하는 구조
            // 자바에서 랜덤 UUID 문자열 생성
            generatedUuid = java.util.UUID.randomUUID().toString();
            // INSERT 컬럼 목록에 PK 컬럼(uuid) 추가
            cols.add(s.id);
            // 값 목록에 방금 생성한 UUID 값 추가
            vals.add(generatedUuid);
        }

        // ★ 핵심: post.board 컬럼이 board_uuid 컬럼인지, board_code 컬럼인지에 따라 다르게 처리
        if (boardColumnIsUuid(s)) {                  // 게시판을 uuid 기반으로 연결하는 스키마라면
            // DTO에 들어있는 boardCode(예: "BUS", "NORM")를 이용해 실제 board 테이블의 uuid 조회
            String boardUuid = findBoardUuidByCode(d.getBoardCode());
            // 만약 code에 해당하는 board를 찾지 못하면 예외 발생
            if (boardUuid == null)
                throw new IllegalStateException("board_code를 찾을 수 없습니다: " + d.getBoardCode());
            // INSERT 컬럼에 board 컬럼명(s.board = "board_uuid" 등) 추가
            cols.add(s.board);
            // 값 목록에는 방금 조회한 boardUuid 추가
            vals.add(boardUuid);
        } else {                                     // board_code를 문자열로 직접 저장하는 스키마인 경우
            cols.add(s.board);                       // board_code 컬럼 추가
            vals.add(d.getBoardCode());              // 값으로는 "BUS", "NORM" 같은 코드 문자열 추가
        }

        // 제목 컬럼명 추가
        cols.add(s.title);
        // 제목 값 추가
        vals.add(d.getTitle());

        // 본문 컬럼명 추가
        cols.add(s.content);
        // 본문 값 추가
        vals.add(d.getContent());

        // 🔽 첨부파일 관련 컬럼이 스키마에 존재하는 경우에만 INSERT에 포함

        if (s.fileUrl != null) {
            cols.add(s.fileUrl);                     // file_url 컬럼명
            vals.add(d.getFileUrl());                // DTO의 fileUrl 값(대표 파일 URL)
        }
        if (s.fileType != null) {
            cols.add(s.fileType);                    // file_type 컬럼명
            vals.add(d.getFileType());               // DTO의 fileType 값
        }
        if (s.fileName != null) {
            cols.add(s.fileName);                    // file_name 컬럼명
            vals.add(d.getFileName());               // DTO의 fileName 값
        }
        if (s.fileContentType != null) {
            cols.add(s.fileContentType);             // file_content_type 컬럼명
            vals.add(d.getFileContentType());        // DTO의 fileContentType 값(MIME)
        }
        // ★ 추가됨: file_list_json 컬럼 INSERT
        if (s.fileListJson != null) {
            cols.add(s.fileListJson);                // file_list_json 컬럼명
            vals.add(d.getFileListJson());           // DTO의 파일 리스트 JSON 문자열
        }

        // 작성자 아이디 컬럼이 존재하면 INSERT에 포함
        if (s.writerId != null)   {
            cols.add(s.writerId);
            vals.add(d.getWriterId());
        }
        // 작성자 이름 컬럼이 존재하면 INSERT에 포함
        if (s.writerName != null) {
            cols.add(s.writerName);
            vals.add(d.getWriterName());
        }

        // created_at 컬럼이 테이블에 있는지 여부
        boolean hasCreated = s.createdAt != null;
        // updated_at 컬럼이 테이블에 있는지 여부
        boolean hasUpdated = s.updatedAt != null;

        // created_at/updated_at 컬럼이 존재하면 NOW()를 사용하여 DB 현재 시각으로 자동 세팅하는 INSERT SQL을 구성
        String sql = "INSERT INTO " + s.table + " (" +         // INSERT INTO post( ...
                String.join(", ", cols) +                      // 모아둔 컬럼명들을 ", "로 이어붙임
                (hasCreated ? ", " + s.createdAt : "") +       // created_at 컬럼이 있으면 컬럼명 추가
                (hasUpdated ? ", " + s.updatedAt : "") +       // updated_at 컬럼이 있으면 컬럼명 추가
                ") VALUES (" +
                // 컬럼 개수만큼 ? 플레이스홀더 생성
                String.join(", ", Collections.nCopies(cols.size(), "?")) +
                (hasCreated ? ", NOW()" : "") +                // created_at 존재 시 NOW() 추가
                (hasUpdated ? ", NOW()" : "") +                // updated_at 존재 시 NOW() 추가
                ")";

        // 자동 증가된 키(숫자 PK)를 받기 위한 KeyHolder 객체 생성
        KeyHolder kh = new GeneratedKeyHolder();
        try {
            // jdbc.update(...) 로 실제 INSERT 실행 (람다로 PreparedStatement 생성 방식 전달)
            jdbc.update(conn -> {
                // 생성한 SQL을 기반으로, 자동 생성된 키를 돌려받기 위해 RETURN_GENERATED_KEYS 옵션 사용
                PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                // ? 에 실제 값들(vals 리스트)에 있는 값들을 순서대로 바인딩
                for (int i = 0; i < vals.size(); i++)
                    ps.setObject(i + 1, vals.get(i));          // JDBC의 파라미터 인덱스는 1부터 시작
                return ps;                                     // 완성된 PreparedStatement 반환
            }, kh);                                             // 실행 후 생성된 키는 kh에 담김
        } catch (DataAccessException e) {
            // 위 SQL이 실패한 경우(예: created_at/updated_at 컬럼이 실제로는 없는데 hasCreated/hasUpdated가 true인 경우 등)
            // created_at/updated_at 컬럼을 뺀 INSERT SQL로 재시도
            String sql2 = "INSERT INTO " + s.table + " (" +
                    String.join(", ", cols) + ") VALUES (" +
                    String.join(", ", Collections.nCopies(cols.size(), "?")) + ")";

            // created_at/updated_at 없이 다시 INSERT 수행
            jdbc.update(conn -> {
                PreparedStatement ps = conn.prepareStatement(sql2, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < vals.size(); i++)
                    ps.setObject(i + 1, vals.get(i));
                return ps;
            }, kh);
        }

        // PK가 uuid 컬럼인 스키마라면, DB에서 자동 증가 숫자 키를 주지 않으므로
        // 우리가 직접 만든 generatedUuid를 DTO에 세팅하고, 리턴 값은 null로 처리
        if (idIsUuid) {
            d.setUuid(generatedUuid);           // DTO에 uuid 값을 저장
            return null;                        // 숫자형 PK가 없으므로 null 반환
        }

        // 숫자 PK 스키마라면, INSERT 시 생성된 자동 증가 키를 KeyHolder에서 꺼냄
        Number key = kh.getKey();               // 생성된 키를 Number 타입으로 얻음
        // key가 존재하면 long 타입으로 변환해서 반환, 없으면 null
        return (key != null) ? key.longValue() : null;
    }

    // ───────────────────────── 수정(Update: 관리자 전용) ─────────────────────────
    public int update(PostDto d) {
        var s = ensurePostResolved();                   // 스키마 정보 확보
        Object idParam = d.anyId();                     // DTO에서 postId 또는 uuid 등 PK를 가져옴
        if (s.id == null || idParam == null)            // PK 컬럼이 없거나, PK 값이 없으면
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다."); // 수정 불가 → 예외

        StringBuilder sb = new StringBuilder();         // UPDATE SQL 조립용 StringBuilder
        List<Object> params = new ArrayList<>();        // 바인딩할 파라미터 리스트

        sb.append("UPDATE ").append(s.table).append(" SET ")
          .append(s.title).append(" = ?, ")
          .append(s.content).append(" = ?");            // 제목/내용은 항상 수정 대상
        params.add(d.getTitle());                       // 1번째 파라미터 = 제목
        params.add(d.getContent());                     // 2번째 파라미터 = 내용

        // 🔽 파일 관련 컬럼도 같이 업데이트 (값이 null이 아닐 때만 세팅 → null이면 기존 값 유지)
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
        // ★ 추가됨: file_list_json 업데이트 (null 아닐 때만)
        if (s.fileListJson != null && d.getFileListJson() != null) {
            sb.append(", ").append(s.fileListJson).append(" = ?");
            params.add(d.getFileListJson());
        }

        if (s.updatedAt != null)                        // updated_at 컬럼이 있다면
            sb.append(", ").append(s.updatedAt).append(" = NOW()"); // 수정 시각을 NOW()로 업데이트

        sb.append(" WHERE ").append(s.id).append(" = ?"); // WHERE PK = ? 조건
        params.add(idParam);                              // 마지막 파라미터 = PK 값

        return jdbc.update(sb.toString(), params.toArray()); // UPDATE 실행 후 영향받은 행 수 반환
    }

    // ───────────────────────── 수정(Update: 작성자 본인만) ─────────────────────────
    public int updateIfOwner(PostDto d, String ownerId) {
        var s = ensurePostResolved();                   // 스키마 정보 확보
        if (s.writerId == null)                         // 작성자 컬럼이 없으면 소유자 검증을 할 수 없음
            return 0;                                   // 그런 경우 수정 실패(0행 수정)

        Object idParam = d.anyId();                     // PK 값(postId 또는 uuid)
        if (s.id == null || idParam == null)            // PK 컬럼 혹은 값이 없으면
            throw new IllegalStateException("PK가 없어 수정할 수 없습니다.");

        // 동적으로 SET 절을 만들면서 파일 컬럼까지 포함
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        sb.append("UPDATE ").append(s.table)
          .append(" SET ").append(s.title).append(" = ?, ").append(s.content).append(" = ?");
        params.add(d.getTitle());
        params.add(d.getContent());

        // 🔽 파일 컬럼들 (값이 null이 아닐 때만 업데이트)
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
        // ★ 추가됨: file_list_json 업데이트 (null 아닐 때만)
        if (s.fileListJson != null && d.getFileListJson() != null) {
            sb.append(", ").append(s.fileListJson).append(" = ?");
            params.add(d.getFileListJson());
        }

        if (s.updatedAt != null) {                      // updated_at 컬럼 있는 경우
            sb.append(", ").append(s.updatedAt).append(" = NOW()");
        }

        sb.append(" WHERE ").append(s.id).append(" = ? AND ").append(s.writerId).append(" = ?");
        // PK가 일치하고 writer_id가 ownerId와 같을 때만 수정

        params.add(idParam);                            // PK 값
        params.add(ownerId);                            // 작성자 ID 값

        String sql = sb.toString();                     // 최종 SQL 문자열

        try {
            return jdbc.update(sql, params.toArray());  // UPDATE 실행
        } catch (Exception e) {
            // updatedAt 컬럼 없는 스키마 호환(예전 DB)
            // NOW() 때문에 실패한 경우 updated_at 없이 다시 시도
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
                // ★ 추가됨: file_list_json 재시도 쿼리에도 포함
                if (s.fileListJson != null && d.getFileListJson() != null) {
                    sb2.append(", ").append(s.fileListJson).append(" = ?");
                    p2.add(d.getFileListJson());
                }

                // 여기서는 updatedAt 미포함
                sb2.append(" WHERE ").append(s.id).append(" = ? AND ").append(s.writerId).append(" = ?");
                p2.add(idParam);
                p2.add(ownerId);

                return jdbc.update(sb2.toString(), p2.toArray()); // updated_at 없이 UPDATE 재실행
            }
            throw e;                                             // 다른 이유라면 예외 그대로 다시 던짐
        }
    }

    // ───────────────────────── 삭제(Delete: 관리자 전용) ─────────────────────────
    public int deleteAny(String idOrNumber) {
        var s = ensurePostResolved();                            // 스키마 정보 확보
        if (s.id == null)                                        // PK 컬럼이 없으면
            throw new IllegalStateException("PK가 없어 삭제할 수 없습니다."); // 삭제 불가 예외

        // 문자열이 숫자 형태라면 Long으로 파싱, 아니면 문자열 그대로 사용
        Object param = isNumericString(idOrNumber) ? Long.parseLong(idOrNumber) : idOrNumber;
        return jdbc.update("DELETE FROM " + s.table + " WHERE " + s.id + " = ?", param);
        // 관리자용 삭제: PK만 일치하면 삭제
    }

    // ───────────────────────── 삭제(Delete: 작성자 본인만) ─────────────────────────
    public int deleteIfOwner(String idOrNumber, String ownerId) {
        var s = ensurePostResolved();                            // 스키마 정보 확보
        if (s.id == null || s.writerId == null)                  // PK나 작성자 컬럼이 없으면
            return 0;                                            // 소유자 검증 불가 → 실패(0행)

        // 댓글이 있으면 함께 삭제 시도(FK 제약/스키마 차이 대비 try-catch로 무시 가능 처리)
        try {
            jdbc.update("DELETE FROM comment WHERE post_uuid = ? OR post_id = ?", idOrNumber, idOrNumber);
        } catch (Exception ignore) {}                            // comment 테이블이 없거나 FK 문제여도 무시

        Object param = isNumericString(idOrNumber) ?
                Long.parseLong(idOrNumber) : idOrNumber;         // 숫자인지 문자열인지에 따라 파라미터 준비

        String sql = "DELETE FROM " + s.table +
                     " WHERE " + s.id + " = ? AND " + s.writerId + " = ?"; // PK + 작성자 일치 조건

        return jdbc.update(sql, param, ownerId);                 // 조건에 맞는 행 삭제 후 영향 행 수 반환
    }

    // ───────────────────────── 🔎 단건 조회(편집 화면에서 사용) ─────────────────────────
    /** 숫자 PK로 단건 조회 */
    public PostDto findById(Long id) {
        if (id == null) return null;                             // id가 null이면 조회 불필요 → null 반환
        // ensurePostResolved() = “post 테이블 구조를 한 번 분석해서, 그 결과를 리턴해 주는 함수”
        var s = ensurePostResolved();                            // 스키마 정보 확보
        // “스키마 객체 s 에서 테이블 이름과 PK 컬럼명을 가져와서, SELECT * FROM 테이블 WHERE PK = ? 형태의 SQL 문자열을 만드는 코드”
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?"; // PK 기준 단건 조회 쿼리
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), id);  // 쿼리 실행 후 PostDto 리스트 반환
        return list.isEmpty() ? null : list.get(0);              // 결과가 없으면 null, 있으면 첫 번째 요소 반환
    }

    /** UUID/문자열 키로 단건 조회 */
    public PostDto findByKey(String key) {
        if (key == null || key.isBlank()) return null;           // key가 비어 있으면 null 반환
        var s = ensurePostResolved();                            // 스키마 정보 확보
        String sql = "SELECT * FROM " + s.table + " WHERE " + s.id + " = ?"; // PK 컬럼에 문자열 key 적용
        List<PostDto> list = jdbc.query(sql, (rs, i) -> mapRow(rs, s), key); // 쿼리 실행
        return list.isEmpty() ? null : list.get(0);              // 결과가 없으면 null, 있으면 첫 요소
    }

    /** 숫자/문자 구분 없이 하나 받아 단건 조회(내부 유틸, 필요 시 사용) */
    public PostDto findOneByAnyId(String idOrKey) {
        if (idOrKey == null || idOrKey.isBlank()) return null;   // 인자가 비어 있으면 null
        // 숫자 형태면 findById, 아니면 findByKey로 분기
        return isNumericString(idOrKey) ?
                findById(Long.parseLong(idOrKey)) :
                findByKey(idOrKey);
    }
}
