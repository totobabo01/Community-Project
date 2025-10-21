// src/main/java/com/example/demo/dto/CommentDto.java
package com.example.demo.dto;

import java.time.LocalDateTime;

/**
 * 댓글 DTO
 *
 * 스키마 호환을 위해 두 형태를 모두 지원합니다.
 * 1) 현재 스키마:  comment(uuid, post_uuid, parent_uuid, content, author_id, status, created_at, updated_at)
 * 2) 레거시 스키마: comment_id(Long), post_id(Long), writer_id, writer_name, content, created_at
 *
 * - UUID 스키마를 우선 사용하되, 레거시 필드가 올 수도 있으므로 공존시킵니다.
 */
public class CommentDto {

    /* ───── 현재 스키마(문자열 키) ───── */
    /** 댓글의 UUID (PK) */
    private String uuid;
    /** 연결된 글의 UUID (FK) */
    private String postUuid;
    /** 대댓글용 부모 댓글 UUID (옵션) */
    private String parentUuid;

    /* ───── 레거시 스키마(숫자 키) ───── */
    private Long commentId;   // 숫자 PK가 있는 스키마용 (없으면 null)
    private Long postId;      // 숫자 FK (없으면 null)
    /** 숫자 FK 대신 문자열/UUID를 쓰던 레거시 호환용 */
    private String postIdStr;

    /* ───── 공통 필드 ───── */
    private String writerId;      // 현재 스키마의 author_id와 매핑
    private String writerName;    // 현재 스키마에는 별도 컬럼이 없으므로 필요 시 writerId와 동일하게 사용
    private String content;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public CommentDto() {}

    public CommentDto(Long commentId, Long postId, String writerId, String writerName,
                      String content, LocalDateTime createdAt) {
        this.commentId = commentId;
        this.postId = postId;
        this.writerId = writerId;
        this.writerName = writerName;
        this.content = content;
        this.createdAt = createdAt;
    }

    /* ───── getters ───── */
    public String getUuid() { return uuid; }
    public String getPostUuid() { return postUuid; }
    public String getParentUuid() { return parentUuid; }

    public Long getCommentId() { return commentId; }
    public Long getPostId() { return postId; }
    public String getPostIdStr() { return postIdStr; }

    public String getWriterId() { return writerId; }
    public String getWriterName() { return writerName; }
    public String getContent() { return content; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }

    /* ───── setters ───── */
    public void setUuid(String uuid) { this.uuid = uuid; }
    public void setPostUuid(String postUuid) { this.postUuid = postUuid; }
    public void setParentUuid(String parentUuid) { this.parentUuid = parentUuid; }

    public void setCommentId(Long commentId) { this.commentId = commentId; }
    public void setPostId(Long postId) { this.postId = postId; }
    public void setPostIdStr(String postIdStr) { this.postIdStr = postIdStr; }

    public void setWriterId(String writerId) { this.writerId = writerId; }
    public void setWriterName(String writerName) { this.writerName = writerName; }
    public void setContent(String content) { this.content = content; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    /* ───── helpers ───── */

    /**
     * DAO에서 바인딩할 때 사용할 “범용 포스트 키”.
     * 우선순위: postUuid → postIdStr → postId
     */
    public Object anyPostId() {
        if (postUuid != null && !postUuid.isBlank()) return postUuid;
        if (postIdStr != null && !postIdStr.isBlank()) return postIdStr;
        return postId;
    }

    /**
     * 댓글 자체를 식별할 때 사용할 “범용 댓글 키”.
     * 우선순위: uuid → commentId
     */
    public Object anyCommentKey() {
        if (uuid != null && !uuid.isBlank()) return uuid;
        return commentId;
    }
}
