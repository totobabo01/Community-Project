// src/main/java/com/example/demo/dao/CommentDao.java
package com.example.demo.dao;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.CommentDto;

@Repository
public class CommentDao {
  private final JdbcTemplate jdbc;
  public CommentDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  // 실제 스키마: comment(uuid, post_uuid, parent_uuid, content, author_id, status, created_at, updated_at)
  private static final String T_COMMENT = "`comment`";

  /** comment → DTO 매퍼 */
  private static final RowMapper<CommentDto> RM = (rs, i) -> {
    CommentDto c = new CommentDto();
    c.setUuid(rs.getString("uuid"));
    c.setPostUuid(rs.getString("post_uuid"));
    c.setWriterId(rs.getString("author_id"));
    c.setWriterName(rs.getString("author_id")); // 표시용
    c.setContent(rs.getString("content"));
    var cAt = rs.getTimestamp("created_at");
    if (cAt != null) c.setCreatedAt(cAt.toLocalDateTime());
    var uAt = rs.getTimestamp("updated_at");
    if (uAt != null) c.setUpdatedAt(uAt.toLocalDateTime());
    return c;
  };

  /* ───────────────── 조회 ───────────────── */

  /** post_uuid(문자열)로 댓글 목록 조회 */
  public List<CommentDto> findByPost(String postUuid) {
    final String sql = """
      SELECT `uuid`,`post_uuid`,`author_id`,`content`,`created_at`,`updated_at`
      FROM %s
      WHERE `post_uuid` = ?
      ORDER BY `created_at` ASC
    """.formatted(T_COMMENT);
    return jdbc.query(sql, RM, postUuid);
  }

  /** 키 라우트용(동일 동작) */
  public List<CommentDto> findByPostKey(String postUuid) {
    return findByPost(postUuid);
  }

  /* ───────────────── 등록 ───────────────── */

  /**
   * 댓글 등록
   * - 필수: post_uuid, author_id, content
   * - PK는 uuid 문자열로 서버에서 생성
   * - 숫자 PK 스키마가 아니므로 Long은 null 반환
   */
  public Long insert(CommentDto d) {
    final String postUuid = (d.getPostUuid() != null && !d.getPostUuid().isBlank())
        ? d.getPostUuid()
        : d.getPostIdStr();

    if (postUuid == null || postUuid.isBlank()) {
      throw new IllegalArgumentException("post_uuid is required to insert a comment");
    }
    if (d.getWriterId() == null || d.getWriterId().isBlank()) {
      throw new IllegalArgumentException("author_id(writerId) is required to insert a comment");
    }

    String uuid = (d.getUuid() == null || d.getUuid().isBlank())
        ? UUID.randomUUID().toString()
        : d.getUuid();

    final String sql = """
      INSERT INTO %s (`uuid`, `post_uuid`, `author_id`, `content`, `created_at`, `updated_at`)
      VALUES (?, ?, ?, ?, NOW(), NOW())
    """.formatted(T_COMMENT);

    jdbc.update(sql, uuid, postUuid, d.getWriterId(), d.getContent());
    d.setUuid(uuid);
    d.setPostUuid(postUuid);
    return null;
  }

  /* ───────────────── 수정 ───────────────── */

  /** 관리자 등 제한 없이 uuid로 내용 수정 */
  public int updateContentByUuidAdmin(String uuid, String content) {
    final String sql = "UPDATE %s SET `content` = ?, `updated_at` = NOW() WHERE `uuid` = ?"
        .formatted(T_COMMENT);
    try {
      return jdbc.update(sql, content, uuid);
    } catch (DataAccessException e) {
      // NOW() 미지원 환경 재시도
      final String sql2 = "UPDATE %s SET `content` = ? WHERE `uuid` = ?".formatted(T_COMMENT);
      return jdbc.update(sql2, content, uuid);
    }
  }

  /** 작성자 본인일 때만 uuid로 내용 수정 */
  public int updateContentByUuidAndAuthor(String uuid, String content, String authorId) {
    final String sql = "UPDATE %s SET `content` = ?, `updated_at` = NOW() WHERE `uuid` = ? AND `author_id` = ?"
        .formatted(T_COMMENT);
    try {
      return jdbc.update(sql, content, uuid, authorId);
    } catch (DataAccessException e) {
      final String sql2 = "UPDATE %s SET `content` = ? WHERE `uuid` = ? AND `author_id` = ?"
          .formatted(T_COMMENT);
      return jdbc.update(sql2, content, uuid, authorId);
    }
  }

  /* ───────────────── 삭제 ───────────────── */

  /** 관리자 등 강제 삭제: uuid 단독으로 삭제 */
  public int deleteByUuid(String uuid) {
    final String sql = "DELETE FROM %s WHERE `uuid` = ?".formatted(T_COMMENT);
    return jdbc.update(sql, uuid);
  }

  /** 작성자 본인만 삭제: uuid + author_id가 일치할 때만 삭제 */
  public int deleteByUuidAndAuthor(String uuid, String authorId) {
    final String sql = "DELETE FROM %s WHERE `uuid` = ? AND `author_id` = ?".formatted(T_COMMENT);
    return jdbc.update(sql, uuid, authorId);
  }

  /* 레거시 호환(숫자 PK가 없는 스키마이므로 의미 없음) */
  public int delete(Long id) { return 0; }
}
