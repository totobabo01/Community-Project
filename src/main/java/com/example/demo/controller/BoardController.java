// src/main/java/com/example/demo/controller/BoardController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
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
     * 공통 유틸
     * ========================= */
    private static boolean isAdmin(Authentication auth) {
        return auth != null && auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(a -> "ROLE_ADMIN".equalsIgnoreCase(a));
    }
    private static String username(Authentication auth) {
        return auth == null ? null : auth.getName();
    }

    /* =========================
     * 게시글
     * ========================= */

    /** 게시판 코드별 목록 (code 예: BUS, NORM) */
    @GetMapping("/boards/{code}/posts")
    public List<PostDto> list(@PathVariable String code) {
        return postDao.findByBoard(code);
    }

    /** 게시글 생성 (숫자 PK면 postId 반환, UUID 스키마면 dto.uuid 채워짐) */
    @PostMapping("/boards/{code}/posts")
    public ResponseEntity<PostDto> create(@PathVariable String code,
                                          @RequestBody PostDto req,
                                          Authentication auth) {
        req.setBoardCode(code);
        if (auth != null) {
            req.setWriterId(auth.getName());
            req.setWriterName(auth.getName());
        }
        Long id = postDao.insert(req); // 숫자 PK면 값, UUID 스키마면 req.uuid 세팅됨
        req.setPostId(id);
        return ResponseEntity.ok(req);
    }

    /** 게시글 수정 - 숫자/문자 공통. 관리자=무제한, 일반=본인만 */
    @PutMapping("/posts/{id}")
    public ResponseEntity<?> updateById(@PathVariable String id,
                                        @RequestBody PostDto req,
                                        Authentication auth) {
        if (id != null && id.matches("\\d+")) req.setPostId(Long.parseLong(id));
        else req.setUuid(id);

        int affected = isAdmin(auth)
                ? postDao.update(req)
                : postDao.updateIfOwner(req, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();
        return isAdmin(auth) ? ResponseEntity.notFound().build()
                             : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /** 게시글 수정 - 문자열 PK 라우트. 관리자=무제한, 일반=본인만 */
    @PutMapping("/posts/key/{key}")
    public ResponseEntity<?> updateByKey(@PathVariable String key,
                                         @RequestBody PostDto req,
                                         Authentication auth) {
        if (key != null && key.matches("\\d+")) req.setPostId(Long.parseLong(key));
        else req.setUuid(key);

        int affected = isAdmin(auth)
                ? postDao.update(req)
                : postDao.updateIfOwner(req, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();
        return isAdmin(auth) ? ResponseEntity.notFound().build()
                             : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /** 게시글 삭제 - 숫자/문자 공통. 관리자=무제한, 일반=본인만 */
    @DeleteMapping("/posts/{id}")
    public ResponseEntity<?> delete(@PathVariable String id, Authentication auth) {
        int affected = isAdmin(auth)
                ? postDao.deleteAny(id)
                : postDao.deleteIfOwner(id, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();
        return isAdmin(auth) ? ResponseEntity.notFound().build()
                             : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /** 게시글 삭제 - 문자열 PK 라우트. 관리자=무제한, 일반=본인만 */
    @DeleteMapping("/posts/key/{key}")
    public ResponseEntity<?> deleteByKey(@PathVariable String key, Authentication auth) {
        int affected = isAdmin(auth)
                ? postDao.deleteAny(key)
                : postDao.deleteIfOwner(key, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();
        return isAdmin(auth) ? ResponseEntity.notFound().build()
                             : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /* =========================
     * 댓글 (comment: uuid, post_uuid, author_id, content, ...)
     * ========================= */

    /** 댓글 목록 - postUuid(문자열 키) */
    @GetMapping("/posts/{postUuid}/comments")
    public List<CommentDto> comments(@PathVariable String postUuid) {
        return commentDao.findByPost(postUuid);
    }

    /** 댓글 목록 - 키 라우트(동일) */
    @GetMapping("/posts/key/{postUuid}/comments")
    public List<CommentDto> commentsByKey(@PathVariable String postUuid) {
        return commentDao.findByPostKey(postUuid);
    }

    /** 댓글 생성 - postUuid 기준 (서버에서 uuid 생성, 응답 DTO에 uuid 세팅됨) */
    @PostMapping("/posts/{postUuid}/comments")
    public ResponseEntity<CommentDto> addComment(@PathVariable String postUuid,
                                                 @RequestBody CommentDto req,
                                                 Authentication auth) {
        req.setPostUuid(postUuid);
        if (auth != null) {
            req.setWriterId(auth.getName());
            req.setWriterName(auth.getName());
        }
        commentDao.insert(req); // 내부에서 uuid 생성 후 req.setUuid(...)
        return ResponseEntity.ok(req);
    }

    /** 댓글 생성 - 키 라우트(동일 동작) */
    @PostMapping("/posts/key/{postUuid}/comments")
    public ResponseEntity<CommentDto> addCommentByKey(@PathVariable String postUuid,
                                                      @RequestBody CommentDto req,
                                                      Authentication auth) {
        return addComment(postUuid, req, auth);
    }

    /** 댓글 수정 - uuid 기반. 관리자=무제한, 일반=본인만 */
    @PutMapping("/comments/key/{uuid}")
    public ResponseEntity<?> updateCommentByUuid(@PathVariable String uuid,
                                                 @RequestBody CommentDto req,
                                                 Authentication auth) {
        if (auth == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String content = req.getContent();
        if (content == null || content.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("content is required");
        }

        int affected = isAdmin(auth)
                ? commentDao.updateContentByUuidAdmin(uuid, content)
                : commentDao.updateContentByUuidAndAuthor(uuid, username(auth), content);

        if (affected > 0) return ResponseEntity.ok().build();
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /** 댓글 삭제 - uuid 사용: 본인만 삭제(관리자는 예외적으로 허용) */
    @DeleteMapping("/comments/key/{uuid}")
    public ResponseEntity<?> deleteCommentByUuid(@PathVariable String uuid, Authentication auth) {
        if (auth == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();

        int affected = isAdmin(auth)
                ? commentDao.deleteByUuid(uuid)
                : commentDao.deleteByUuidAndAuthor(uuid, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();
        return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /* 레거시 호환: 숫자 PK 삭제 엔드포인트(현재 스키마에서는 효과 없음) */
    @DeleteMapping("/comments/{id}")
    public ResponseEntity<?> deleteComment(@PathVariable Long id) {
        return commentDao.delete(id) > 0 ? ResponseEntity.ok().build()
                                         : ResponseEntity.notFound().build();
    }
}
