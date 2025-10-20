// src/main/java/com/example/demo/controller/BoardController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.CommentDao;
import com.example.demo.dao.PostDao;
import com.example.demo.dto.CommentDto;
import com.example.demo.dto.PostDto;

@RestController
@RequestMapping("/api")
public class BoardController {

    private final PostDao postDao;
    private final CommentDao commentDao;

    public BoardController(PostDao postDao, CommentDao commentDao) {
        this.postDao = postDao;
        this.commentDao = commentDao;
    }

    /* =========================
     * 게시글
     * ========================= */

    /** 게시판 코드별 게시글 목록 */
    @GetMapping("/boards/{code}/posts")
    public List<PostDto> list(@PathVariable String code) {
        return postDao.findByBoard(code);
    }

    /** 게시글 생성 */
    @PostMapping("/boards/{code}/posts")
    public ResponseEntity<PostDto> create(@PathVariable String code,
                                          @RequestBody PostDto req,
                                          Authentication auth) {
        req.setBoardCode(code);
        if (auth != null) {
            req.setWriterId(auth.getName());
            req.setWriterName(auth.getName()); // 필요하면 별도 프로필 닉네임으로 교체
        }
        Long id = postDao.insert(req);
        req.setPostId(id);
        return ResponseEntity.ok(req);
    }

    /** 게시글 수정(제목/내용 등) */
    @PutMapping("/posts/{id}")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody PostDto req) {
        req.setPostId(id);
        return postDao.update(req) > 0
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    /** 게시글 삭제 */
    @DeleteMapping("/posts/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        return postDao.delete(id) > 0
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }

    /* =========================
     * 댓글
     * ========================= */

    /** 특정 게시글의 댓글 목록 */
    @GetMapping("/posts/{postId}/comments")
    public List<CommentDto> comments(@PathVariable Long postId) {
        return commentDao.findByPost(postId);
    }

    /** 댓글 생성 */
    @PostMapping("/posts/{postId}/comments")
    public ResponseEntity<CommentDto> addComment(@PathVariable Long postId,
                                                 @RequestBody CommentDto req,
                                                 Authentication auth) {
        req.setPostId(postId);
        if (auth != null) {
            req.setWriterId(auth.getName());
            req.setWriterName(auth.getName());
        }
        Long newId = commentDao.insert(req);
        req.setCommentId(newId);
        return ResponseEntity.ok(req);
    }

    /** 댓글 삭제 */
    @DeleteMapping("/comments/{id}")
    public ResponseEntity<?> deleteComment(@PathVariable Long id) {
        return commentDao.delete(id) > 0
                ? ResponseEntity.ok().build()
                : ResponseEntity.notFound().build();
    }
}
