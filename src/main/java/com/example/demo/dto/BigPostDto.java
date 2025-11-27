// src/main/java/com/example/demo/dto/BigPostDto.java
package com.example.demo.dto;

import java.time.LocalDateTime;

/**
 * big_posts 테이블의 한 행(게시글 1개)을 담는 DTO.
 *  - id          ↔ big_posts.id
 *  - title       ↔ big_posts.title
 *  - content     ↔ big_posts.content
 *  - writerId    ↔ big_posts.writer_id
 *  - createdAt   ↔ big_posts.created_at
 *  - updatedAt   ↔ big_posts.updated_at
 */
public class BigPostDto {

    private Long id;                 // 글 번호(PK)
    private String title;            // 제목
    private String content;          // 내용
    private String writerId;         // 작성자 아이디
    private LocalDateTime createdAt; // 작성일시
    private LocalDateTime updatedAt; // 수정일시

    // 기본 생성자 (프레임워크/Jackson 등이 사용)
    public BigPostDto() {
    }

    // 모든 필드를 한 번에 넣는 생성자 (편의용, 안 써도 상관 없음)
    public BigPostDto(Long id,
                      String title,
                      String content,
                      String writerId,
                      LocalDateTime createdAt,
                      LocalDateTime updatedAt) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.writerId = writerId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    // ───── getter / setter ─────

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getWriterId() {
        return writerId;
    }

    public void setWriterId(String writerId) {
        this.writerId = writerId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
