// src/main/java/com/example/demo/dto/PostDto.java
package com.example.demo.dto;

import java.time.LocalDateTime;

public class PostDto {

    /** 숫자 PK 스키마(post_id 등)일 때 사용 */
    private Long postId;

    /** 문자열/UUID PK 스키마(uuid 등)일 때 사용 */
    private String uuid;

    /** 게시판 코드(BUS, NORM 등) */
    private String boardCode;

    private String title;
    private String content;

    private String writerId;
    private String writerName;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // ───────────── constructors ─────────────
    public PostDto() {}

    public PostDto(Long postId, String uuid, String boardCode, String title, String content,
                   String writerId, String writerName,
                   LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.postId = postId;
        this.uuid = uuid;
        this.boardCode = boardCode;
        this.title = title;
        this.content = content;
        this.writerId = writerId;
        this.writerName = writerName;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    // ───────────── getters / setters ─────────────
    public Long getPostId() { return postId; }
    public void setPostId(Long postId) { this.postId = postId; }

    public String getUuid() { return uuid; }
    public void setUuid(String uuid) { this.uuid = uuid; }

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

    // ───────────── convenience helpers ─────────────
    /** 숫자 PK가 존재하는지 */
    public boolean hasNumericId() {
        return postId != null;
    }

    /** 문자열 키(우선 uuid, 없으면 숫자 id를 문자열로) – 컨트롤러/프런트 일관 처리용 */
    public String getKey() {
        if (uuid != null && !uuid.isBlank()) return uuid;
        if (postId != null) return String.valueOf(postId);
        return null;
    }

    /** 문자열 키로 세팅 (uuid 스키마면 uuid에, 숫자면 postId에 파싱해서 세팅) */
    public void setKey(String key) {
        if (key == null || key.isBlank()) {
            this.uuid = null;
            this.postId = null;
            return;
        }
        // 숫자로만 구성되어 있으면 postId로, 아니면 uuid로 저장
        if (key.matches("\\d+")) {
            try {
                this.postId = Long.parseLong(key);
                this.uuid = null;
            } catch (NumberFormatException e) {
                this.uuid = key;
                this.postId = null;
            }
        } else {
            this.uuid = key;
            this.postId = null;
        }
    }

    /** 숫자 또는 문자열 중 사용 가능한 PK(Object) – DAO 내부에서 편하게 쓸 때 */
    public Object anyId() {
        if (postId != null) return postId;
        if (uuid != null && !uuid.isBlank()) return uuid;
        return null;
    }

    @Override
    public String toString() {
        return "PostDto{" +
                "postId=" + postId +
                ", uuid='" + uuid + '\'' +
                ", boardCode='" + boardCode + '\'' +
                ", title='" + title + '\'' +
                ", writerId='" + writerId + '\'' +
                ", writerName='" + writerName + '\'' +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
}
