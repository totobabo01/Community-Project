// src/main/java/com/example/demo/dao/PostDao.java
package com.example.demo.dao;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import com.example.demo.dto.PostDto;

@Repository
public class PostDao {

    private final JdbcTemplate jdbc;

    public PostDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 게시판 코드로 목록 조회 (최신순) */
    public List<PostDto> findByBoard(String code) {
        final String sql = """
            SELECT post_id, board_code, title, content,
                   writer_id, writer_name, created_at, updated_at
              FROM post
             WHERE board_code = ?
             ORDER BY created_at DESC
            """;

        return jdbc.query(sql, (rs, i) -> {
            PostDto d = new PostDto();
            d.setPostId(rs.getLong("post_id"));
            d.setBoardCode(rs.getString("board_code"));
            d.setTitle(rs.getString("title"));
            d.setContent(rs.getString("content"));
            d.setWriterId(rs.getString("writer_id"));
            d.setWriterName(rs.getString("writer_name"));

            Timestamp cts = rs.getTimestamp("created_at");
            if (cts != null) d.setCreatedAt(cts.toLocalDateTime());

            Timestamp uts = rs.getTimestamp("updated_at");
            if (uts != null) d.setUpdatedAt(uts.toLocalDateTime());

            return d;
        }, code);
    }

    /** 게시글 등록 후 생성된 PK 반환 */
    public Long insert(PostDto d) {
        final String sql = """
            INSERT INTO post (board_code, title, content, writer_id, writer_name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
            """;

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(conn -> {
            PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, d.getBoardCode());
            ps.setString(2, d.getTitle());
            ps.setString(3, d.getContent());
            ps.setString(4, d.getWriterId());
            ps.setString(5, d.getWriterName());
            return ps;
        }, kh);

        Number key = kh.getKey();
        return key != null ? key.longValue() : null;
    }

    /** 제목/내용 수정 (수정시각 갱신) */
    public int update(PostDto d) {
        final String sql = """
            UPDATE post
               SET title = ?,
                   content = ?,
                   updated_at = NOW()
             WHERE post_id = ?
            """;
        return jdbc.update(sql, d.getTitle(), d.getContent(), d.getPostId());
    }

    /** 게시글 삭제 */
    public int delete(Long id) {
        return jdbc.update("DELETE FROM post WHERE post_id = ?", id);
    }
}
