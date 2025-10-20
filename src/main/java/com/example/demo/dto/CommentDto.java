// src/main/java/com/example/demo/dto/CommentDto.java
package com.example.demo.dto;

import java.time.LocalDateTime;

public class CommentDto {
    private Long commentId;
    private Long postId;
    private String writerId;
    private String writerName;
    private String content;
    private LocalDateTime createdAt;

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

    // ---- getters ----
    public Long getCommentId() { return commentId; }
    public Long getPostId() { return postId; }
    public String getWriterId() { return writerId; }
    public String getWriterName() { return writerName; }
    public String getContent() { return content; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    // ---- setters ----
    public void setCommentId(Long commentId) { this.commentId = commentId; }
    public void setPostId(Long postId) { this.postId = postId; }
    public void setWriterId(String writerId) { this.writerId = writerId; }
    public void setWriterName(String writerName) { this.writerName = writerName; }
    public void setContent(String content) { this.content = content; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
