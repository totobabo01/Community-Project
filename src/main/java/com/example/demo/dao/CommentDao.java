// src/main/java/com/example/demo/dao/CommentDao.java
package com.example.demo.dao;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.CommentDto;

@Repository
public class CommentDao {
  private final JdbcTemplate jdbc;
  public CommentDao(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public List<CommentDto> findByPost(Long postId) {
    final String sql = """
      SELECT comment_id, post_id, writer_id, writer_name, content, created_at
      FROM comment
      WHERE post_id = ?
      ORDER BY comment_id ASC
    """;

    // ✅ queryForList(...) 쓰지 말고, query(...) + RowMapper 로 DTO 로 매핑
    return jdbc.query(sql, (rs, i) -> {
      CommentDto c = new CommentDto();
      c.setCommentId(rs.getLong("comment_id"));
      c.setPostId(rs.getLong("post_id"));
      c.setWriterId(rs.getString("writer_id"));
      c.setWriterName(rs.getString("writer_name"));
      c.setContent(rs.getString("content"));
      c.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
      return c;
    }, postId);
  }

  public Long insert(CommentDto d) {
    jdbc.update("""
      INSERT INTO comment(post_id, writer_id, writer_name, content)
      VALUES (?, ?, ?, ?)
    """, d.getPostId(), d.getWriterId(), d.getWriterName(), d.getContent());
    return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
  }

  public int delete(Long id) {
    return jdbc.update("DELETE FROM comment WHERE comment_id = ?", id);
  }
}
