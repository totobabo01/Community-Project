// src/main/java/com/example/demo/dto/PostDto.java
package com.example.demo.dto;

import java.time.LocalDateTime;

/**
 * 게시글 DTO
 * - 필드를 private 으로 두고 표준 getter/setter 제공 (컨트롤러/DAO에서 세터 호출 가능)
 * - 기본 생성자 필수(Jackson 역직렬화용)
 */
public class PostDto {

    private Long postId;
    private String boardCode;
    private String title;
    private String content;
    private String writerId;
    private String writerName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public PostDto() {}

    // --- getters / setters ---
    public Long getPostId() { return postId; }
    public void setPostId(Long postId) { this.postId = postId; }

    public String getBoardCode() { return boardCode; }
    public void setBoardCode(String boardCode) { this.boardCode = boardCode; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getWriterId() { return writerId; }
    public void setWriterId(String writerId) { this.writerId = writerId; }

    public String getWriterName() { return writerName; }
    public void setWriterName(String writerName) { this.writerName = writerName; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
