// src/main/java/com/example/demo/dto/CommentDto.java
package com.example.demo.dto;                           // DTO 패키지 위치

import java.time.LocalDateTime;                         // 생성/수정 시각 표현용

/**
 * 댓글 DTO (UUID 기반 스키마 + 레거시 스키마 동시 호환)
 *
 * 현재 스키마 예:
 *   comment(uuid, post_uuid, parent_uuid, depth, content, author_id, status, created_at, updated_at)
 *
 * 레거시 스키마 예(혼용 대비):
 *   comment_id(BIGINT), post_id(BIGINT), writer_id, writer_name, content, created_at
 */
public class CommentDto {

    /* ---------- 현재 스키마(문자열 키) ---------- */
    /** 댓글 UUID (PK) */
    private String uuid;                                 // 현재 스키마의 주 식별자
    /** 게시글 UUID (FK) */
    private String postUuid;                             // 어떤 게시글에 속하는지(외래키, 문자열)
    /** 부모 댓글 UUID (대댓글용, 최상위는 null) */
    private String parentUuid;                           // 대댓글일 경우 부모 댓글의 uuid
    /** 댓글 깊이(0=최상위, 1=대댓글, …) */
    private Integer depth;                               // 트리 구조 표현(0부터 시작)

    /* ---------- 레거시 스키마(숫자 키) ---------- */
    /** 댓글 ID (숫자 PK가 있는 스키마 호환용) */
    private Long commentId;                              // 옛 스키마의 숫자형 PK 호환
    /** 게시글 ID (숫자 FK 스키마 호환용) */
    private Long postId;                                 // 옛 스키마의 숫자형 FK 호환
    /** 문자열형 포스트 키(레거시 호환: 예전 시스템에서 문자열 키를 썼던 경우) */
    private String postIdStr;                            // 과거 문자열 기반 포스트 키 호환(있을 수도, 없을 수도)

    /* ---------- 공통 필드 ---------- */
    /** 작성자 ID (현재 스키마의 author_id) */
    private String writerId;                             // 사용자 식별용 ID(로그인명 등)
    /** 작성자 표시명 (현재 스키마에 별도 컬럼 없으면 writerId를 재사용) */
    private String writerName;                           // 화면에 표시할 이름(별도 컬럼 없으면 writerId 재사용 가능)
    /** 본문 내용 */
    private String content;                              // 댓글 텍스트
    /** 상태(PUBLISHED, HIDDEN 등) — 스키마에 있으면 사용 */
    private String status;                               // 노출 상태(스키마 지원 시)
    /** 작성 시각 */
    private LocalDateTime createdAt;                     // 생성 시간
    /** 수정 시각 */
    private LocalDateTime updatedAt;                     // 마지막 수정 시간

    /* ---------- 생성자 ---------- */
    public CommentDto() {}                               // 기본 생성자(프레임워크/직렬화용)

    /** 레거시 스키마용 보조 생성자 */
    public CommentDto(Long commentId, Long postId, String writerId, String writerName,
                      String content, LocalDateTime createdAt) {
        this.commentId = commentId;                      // 숫자 PK
        this.postId = postId;                            // 숫자 FK
        this.writerId = writerId;                        // 작성자 ID
        this.writerName = writerName;                    // 작성자 표시명
        this.content = content;                          // 본문
        this.createdAt = createdAt;                      // 생성시각
    }

    /* ---------- getters ---------- */
    public String getUuid() { return uuid; }             // uuid 읽기
    public String getPostUuid() { return postUuid; }     // postUuid 읽기
    public String getParentUuid() { return parentUuid; } // parentUuid 읽기
    public Integer getDepth() { return depth; }          // depth 읽기

    public Long getCommentId() { return commentId; }     // commentId 읽기(레거시)
    public Long getPostId() { return postId; }           // postId 읽기(레거시)
    public String getPostIdStr() { return postIdStr; }   // postIdStr 읽기(레거시 문자열 키)

    public String getWriterId() { return writerId; }     // 작성자 ID 읽기
    public String getWriterName() { return writerName; } // 작성자 표시명 읽기
    public String getContent() { return content; }       // 본문 읽기
    public String getStatus() { return status; }         // 상태 읽기
    public LocalDateTime getCreatedAt() { return createdAt; } // 생성시각 읽기
    public LocalDateTime getUpdatedAt() { return updatedAt; } // 수정시각 읽기

    /* ---------- setters ---------- */
    public void setUuid(String uuid) { this.uuid = uuid; }                       // uuid 쓰기
    public void setPostUuid(String postUuid) { this.postUuid = postUuid; }       // postUuid 쓰기
    public void setParentUuid(String parentUuid) { this.parentUuid = parentUuid; } // parentUuid 쓰기
    public void setDepth(Integer depth) { this.depth = depth; }                  // depth 쓰기

    public void setCommentId(Long commentId) { this.commentId = commentId; }     // commentId 쓰기(레거시)
    public void setPostId(Long postId) { this.postId = postId; }                 // postId 쓰기(레거시)
    public void setPostIdStr(String postIdStr) { this.postIdStr = postIdStr; }   // postIdStr 쓰기(레거시 문자열 키)

    public void setWriterId(String writerId) { this.writerId = writerId; }       // 작성자 ID 쓰기
    public void setWriterName(String writerName) { this.writerName = writerName; } // 표시명 쓰기
    public void setContent(String content) { this.content = content; }           // 본문 쓰기
    public void setStatus(String status) { this.status = status; }               // 상태 쓰기
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; } // 생성시각 쓰기
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; } // 수정시각 쓰기

    /* ---------- helpers ---------- */

    /**
     * DAO에서 “게시글 키”로 사용할 통합 키.
     * 우선순위: postUuid → postIdStr → postId
     */
    public Object anyPostId() {                                         // 혼재 스키마 대응: 사용 가능한 게시글 키 반환
        if (postUuid != null && !postUuid.isBlank()) return postUuid;   // 1) 문자열 uuid가 최우선
        if (postIdStr != null && !postIdStr.isBlank()) return postIdStr;// 2) 문자열 기반 레거시 키
        return postId;                                                  // 3) 숫자 FK(없을 수 있음)
    }

    /**
     * DAO에서 “댓글 키”로 사용할 통합 키.
     * 우선순위: uuid → commentId
     */
    public Object anyCommentKey() {                                     // 혼재 스키마 대응: 사용 가능한 댓글 키 반환
        if (uuid != null && !uuid.isBlank()) return uuid;               // 1) 문자열 uuid 우선
        return commentId;                                               // 2) 숫자 PK(없을 수 있음)
    }
}
