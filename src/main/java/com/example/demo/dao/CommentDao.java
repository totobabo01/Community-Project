// src/main/java/com/example/demo/dao/CommentDao.java
package com.example.demo.dao;

import java.util.List;                                // 목록 반환용
import java.util.UUID;                                // uuid 생성용

import org.springframework.dao.DataAccessException;   // 스프링 데이터 접근 예외
import org.springframework.jdbc.core.JdbcTemplate;    // SQL 실행 편의 클래스
import org.springframework.jdbc.core.RowMapper;       // ResultSet → 객체 매핑 인터페이스
import org.springframework.stereotype.Repository;     // DAO 스테레오타입

import com.example.demo.dto.CommentDto;               // 댓글 DTO

@Repository                                          // 스프링 빈 등록(컴포넌트 스캔 대상)
public class CommentDao {

  private final JdbcTemplate jdbc;                   // 의존하는 JDBC 템플릿
  public CommentDao(JdbcTemplate jdbc) { this.jdbc = jdbc; } // 생성자 주입

  /** 실제 테이블: 예약어 충돌 대비 백틱 사용 */
  private static final String TBL = "`comment`";     // MySQL에서 comment가 예약어일 수 있어 백틱으로 감쌈

  /** ResultSet → DTO 매핑기 */
  private static final RowMapper<CommentDto> RM = (rs, i) -> {  // 한 행을 CommentDto로 변환
    CommentDto c = new CommentDto();
    c.setUuid(rs.getString("uuid"));                            // 댓글 uuid
    c.setPostUuid(rs.getString("post_uuid"));                   // 소속 게시글 uuid
    c.setParentUuid(rs.getString("parent_uuid"));               // 부모 댓글 uuid(최상위면 null)
    c.setDepth(rs.getInt("depth"));                             // 트리 깊이(0=루트)
    c.setWriterId(rs.getString("author_id"));                   // 작성자 ID
    // writerName 컬럼이 없으니 임시로 동일 값 사용
    c.setWriterName(rs.getString("author_id"));                 // 작성자 표시용 이름(임시로 author_id 재사용)
    c.setContent(rs.getString("content"));                      // 본문
    c.setStatus(getSafe(rs, "status"));                         // 상태(드라이버/스키마에 따라 없을 수 있어 안전 조회)
    var cAt = rs.getTimestamp("created_at");                    // 생성시간
    if (cAt != null) c.setCreatedAt(cAt.toLocalDateTime());
    var uAt = rs.getTimestamp("updated_at");                    // 수정시간
    if (uAt != null) c.setUpdatedAt(uAt.toLocalDateTime());
    return c;
  };

  private static String getSafe(java.sql.ResultSet rs, String col) { // 특정 컬럼이 없거나 타입 이슈 시 null 반환
    try { return rs.getString(col); } catch (Exception ignore) { return null; }
  }

  /* ----------------------- 조회 ----------------------- */

  /** 게시글의 모든 댓글 조회(부모 → 자식, 시간 순으로 안정 정렬) */
  public List<CommentDto> findByPost(String postUuid) {
    final String sql =
        "SELECT `uuid`,`post_uuid`,`parent_uuid`,`depth`,`author_id`,`content`,`status`,`created_at`,`updated_at` " +
        "FROM " + TBL + " " +
        "WHERE `post_uuid` = ? " +
        // COALESCE(parent_uuid, uuid): 부모가 없으면 자기 자신을 그룹 키로 사용 → 부모 그룹별 정렬
        "ORDER BY COALESCE(`parent_uuid`, `uuid`) ASC, `depth` ASC, `created_at` ASC, `uuid` ASC";
    return jdbc.query(sql, RM, postUuid);                        // 매퍼(RM)로 목록 반환
  }

  /** 키 라우트용 별칭 */
  public List<CommentDto> findByPostKey(String postUuid) {       // 현재는 findByPost와 동일(확장 대비 별칭)
    return findByPost(postUuid);
  }

  /** ✅ 부모 댓글의 post_uuid 조회 (대댓글 등록 시 동일 게시글 검증용) */
  public String findPostUuidByCommentUuid(String commentUuid) {
    try {
      return jdbc.queryForObject(
          "SELECT `post_uuid` FROM " + TBL + " WHERE `uuid` = ?",
          String.class, commentUuid);                            // 단일 값 조회
    } catch (Exception e) {
      return null;                                               // 없거나 에러 시 null
    }
  }

  /** 부모 댓글의 depth 조회 (대댓글 depth 계산) */
  private Integer findDepthByUuid(String parentUuid) {
    try {
      return jdbc.queryForObject(
          "SELECT `depth` FROM " + TBL + " WHERE `uuid` = ?",
          Integer.class, parentUuid);                            // 부모의 깊이 반환
    } catch (Exception e) {
      return null;                                               // 없으면 null
    }
  }

  /* ----------------------- 등록 ----------------------- */

  /**
   * 댓글/대댓글 등록
   * 필수: post_uuid, author_id, content
   * 선택: parent_uuid (있으면 동일 post_uuid인지 검증)
   * depth: parent 있으면 parent.depth + 1, 없으면 0
   * status: 'PUBLISHED' 기본 저장
   */
  public Long insert(CommentDto d) {                                // 댓글을 DB에 저장하는 DAO 메서드. 숫자 PK가 없어서 Long은 항상 null을 반환
    final String postUuid = trimOrNull(d.getPostUuid());         // ← 파라미터 정리: 공백 제거 후 빈 문자열은 null로 변환
    final String authorId = trimOrNull(d.getWriterId());         // ← 작성자 ID 정리
    final String content  = trimOrNull(d.getContent());          // ← 본문 내용 정리
    String parentUuid     = trimOrNull(d.getParentUuid());       // ← 부모 댓글(UUID) 정리(대댓글이 아니라면 null)

    if (postUuid == null) throw new IllegalArgumentException("post_uuid is required");
    // ← 필수값 검증: 게시글 식별자 없으면 즉시 실패

    if (authorId == null) throw new IllegalArgumentException("author_id(writerId) is required");
    // ← 필수값 검증: 작성자 없으면 실패

    if (content  == null) throw new IllegalArgumentException("content is required");
    // ← 필수값 검증: 내용 없으면 실패

    // 부모가 있으면 같은 게시글인지 검증 + depth 계산
    Integer depth = 0;                                           // ← 최상위 댓글 기본 depth 0
    if (parentUuid != null) {                                    // ← 대댓글인 경우에만 부모 검증/계산
      String parentPost = findPostUuidByCommentUuid(parentUuid); // ← 부모 댓글이 달린 게시글의 UUID 조회
      if (parentPost == null || !parentPost.equals(postUuid)) {  // ← 부모가 없거나, 다른 글에 달린 부모면
        throw new IllegalArgumentException("parent comment must belong to the same post");
        // ← 같은 게시글이 아니므로 대댓글 불가 → 예외
      }
      Integer parentDepth = findDepthByUuid(parentUuid);         // ← 부모 댓글의 depth 조회
      depth = (parentDepth == null ? 0 : parentDepth + 1);       // ← 부모 depth + 1 (없으면 0)
    }

    String newUuid = trimOrNull(d.getUuid());                    // ← 클라이언트가 UUID를 줬는지 확인
    if (newUuid == null) newUuid = UUID.randomUUID().toString(); // ← 없으면 서버가 새 UUID 생성

    final String sql =
        "INSERT INTO " + TBL +                                   // ← 대상 테이블 상수(TBL) 사용
        " (`uuid`,`post_uuid`,`parent_uuid`,`depth`,`author_id`,`content`,`status`,`created_at`,`updated_at`) " +
        "VALUES (?, ?, ?, ?, ?, ?, 'PUBLISHED', NOW(), NOW())";  // ← status 기본값 PUBLISHED, 시간은 NOW()

    jdbc.update(sql, newUuid, postUuid, parentUuid, depth, authorId, content); // ← PreparedStatement 바인딩 후 INSERT 실행

    // 응답 DTO 갱신(호출자에게 실제 저장된 값 반영)
    d.setUuid(newUuid);                                          // ← 생성/확정된 UUID를 DTO에 반영
    d.setPostUuid(postUuid);                                     // ← 정리된 postUuid 반영
    d.setParentUuid(parentUuid);                                 // ← 정리된 parentUuid 반영(null 가능)
    d.setDepth(depth);                                           // ← 계산된 depth 반영
    d.setStatus("PUBLISHED");                                    // ← 저장된 상태 반영
    return null; // 숫자 PK 스키마가 아니므로 null 반환(식별자는 uuid로 사용)  // ← 외부에선 d.getUuid()로 식별
  }

  private static String trimOrNull(String s) {                   // ← 유틸: 공백 제거 + 빈문자열을 null로 통일
    if (s == null) return null;                                  // ← 입력이 null이면 그대로 null
    String t = s.trim();                                         // ← 앞뒤 공백 제거
    return t.isEmpty() ? null : t;                               // ← 빈 문자열이면 null, 아니면 정리된 문자열 리턴
  }


  /* ----------------------- 수정 ----------------------- */

  /** 관리자: uuid로 내용 수정 */
  public int updateContentByUuidAdmin(String uuid, String content) {   // ✅ 관리자 전용: uuid로 특정 댓글의 내용을 수정. 영향 행 수(int) 반환
    final String sql =
        "UPDATE " + TBL + " SET `content` = ?, `updated_at` = NOW() WHERE `uuid` = ?"; 
        // ← 파라미터 바인딩(?, ?) 사용하는 안전한 UPDATE 문. 수정 시각은 DB의 NOW()로 갱신

    try {
      return jdbc.update(sql, content, uuid);                        // ← JdbcTemplate로 실행: 영향받은 행 수(0/1)를 반환
    } catch (DataAccessException e) {
      // 특정 드라이버에서 NOW()가 문제될 때 대체
      final String sql2 = "UPDATE " + TBL + " SET `content` = ? WHERE `uuid` = ?";
      return jdbc.update(sql2, content, uuid);                       // ← 호환 모드: updated_at은 갱신하지 않음
    }
}


  /** 작성자 본인만: uuid + author_id로 내용 수정 */
 public int updateContentByUuidAndAuthor(String uuid, String content, String authorId) {
    final String sql =
        "UPDATE " + TBL + " SET `content` = ?, `updated_at` = NOW() WHERE `uuid` = ? AND `author_id` = ?";
        // ← 동일하지만 WHERE 절에 author_id 조건이 추가되어 "본인 글"만 수정 가능

    try {
      return jdbc.update(sql, content, uuid, authorId);              // ← 실행 후 영향 행 수 반환(0이면 uuid가 없거나 작성자 불일치)
    } catch (DataAccessException e) {
      final String sql2 = "UPDATE " + TBL + " SET `content` = ? WHERE `uuid` = ? AND `author_id` = ?";
      return jdbc.update(sql2, content, uuid, authorId);             // ← 호환 모드: updated_at 미갱신
    }
}

  /* ----------------------- 삭제 ----------------------- */

  /** 강제 삭제(관리자): uuid 로 삭제 */
  public int deleteByUuid(String uuid) {
    final String sql = "DELETE FROM " + TBL + " WHERE `uuid` = ?"; // 관리자 무제한 삭제
    return jdbc.update(sql, uuid);
  }

  /** 본인만 삭제: uuid + author_id 일치 */
  public int deleteByUuidAndAuthor(String uuid, String authorId) {
    final String sql = "DELETE FROM " + TBL + " WHERE `uuid` = ? AND `author_id` = ?"; // 소유자 제약
    return jdbc.update(sql, uuid, authorId);
  }

  /** 과거 인터페이스 호환(숫자 PK 없음) */
  public int delete(Long id) { return 0; }                       // 레거시 시그니처 유지용(실제 사용 안 함)
}
