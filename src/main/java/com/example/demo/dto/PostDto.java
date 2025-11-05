// src/main/java/com/example/demo/dto/PostDto.java                  // 표준 Maven/Gradle 소스 경로 + 파일명

package com.example.demo.dto;                                      // DTO 클래스 패키지(네임스페이스)

import java.time.LocalDateTime;                                    // 생성/수정 시각 표현용 타입(java.time)

/**
 * 게시글 데이터 전송 객체(DTO)
 * - 숫자 PK(post_id 등)와 문자열/UUID PK 모두를 **동시에 호환**하도록 설계
 * - 컨트롤러 ↔ 서비스 ↔ DAO 레이어 사이를 안전하게 오간다(영속성/도메인 엔티티 아님)
 */
public class PostDto {                                             // 게시글 데이터를 옮길 DTO

    /** 숫자 PK 스키마(post_id 등)일 때 사용 */
    private Long postId;                                           // 숫자 기본키(레거시/숫자 PK 스키마)

    /** 문자열/UUID PK 스키마(uuid 등)일 때 사용 */
    private String uuid;                                           // 문자열/UUID 기본키(현행 스키마 우선)

    /** 게시판 코드(BUS, NORM 등) */
    private String boardCode;                                      // 게시판 식별 코드(또는 매핑된 값)

    private String title;                                          // 제목
    private String content;                                        // 본문(텍스트/HTML/마크다운 등)

    private String writerId;                                       // 작성자 ID(로그인 ID/이메일 등)
    private String writerName;                                     // 작성자 표시명(닉네임 등)

    private LocalDateTime createdAt;                               // 생성 시각(타임존 정보 없음)
    private LocalDateTime updatedAt;                               // 수정 시각(타임존 정보 없음)

    // ───────────── constructors ─────────────
    public PostDto() {}                                            // 기본 생성자(프레임워크/직렬화용)

    public PostDto(Long postId, String uuid, String boardCode, String title, String content,
                   String writerId, String writerName,
                   LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.postId = postId;                                      // 숫자 PK 초기화
        this.uuid = uuid;                                          // UUID PK 초기화
        this.boardCode = boardCode;                                // 게시판 코드 초기화
        this.title = title;                                        // 제목 초기화
        this.content = content;                                    // 본문 초기화
        this.writerId = writerId;                                  // 작성자 ID 초기화
        this.writerName = writerName;                              // 작성자 표시명 초기화
        this.createdAt = createdAt;                                // 생성 시각 초기화
        this.updatedAt = updatedAt;                                // 수정 시각 초기화
    }

    // ───────────── getters / setters ─────────────
    public Long getPostId() { return postId; }                     // postId 게터
    public void setPostId(Long postId) { this.postId = postId; }   // postId 세터

    public String getUuid() { return uuid; }                       // uuid 게터
    public void setUuid(String uuid) { this.uuid = uuid; }         // uuid 세터

    public String getBoardCode() { return boardCode; }             // boardCode 게터
    public void setBoardCode(String boardCode) { this.boardCode = boardCode; } // boardCode 세터

    public String getTitle() { return title; }                     // title 게터
    public void setTitle(String title) { this.title = title; }     // title 세터

    public String getContent() { return content; }                 // content 게터
    public void setContent(String content) { this.content = content; } // content 세터

    public String getWriterId() { return writerId; }               // writerId 게터
    public void setWriterId(String writerId) { this.writerId = writerId; } // writerId 세터

    public String getWriterName() { return writerName; }           // writerName 게터
    public void setWriterName(String writerName) { this.writerName = writerName; } // writerName 세터

    public LocalDateTime getCreatedAt() { return createdAt; }      // createdAt 게터
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; } // createdAt 세터

    public LocalDateTime getUpdatedAt() { return updatedAt; }      // updatedAt 게터
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; } // updatedAt 세터

    // ───────────── convenience helpers ─────────────

    /** 숫자 PK가 존재하는지 여부(레거시 스키마 판별/분기 등에 사용) */
    public boolean hasNumericId() {                                // 숫자 PK 존재 체크
        return postId != null;
    }

    /**
     * 프런트/라우팅에서 일관된 “문자열 키” 제공
     * - 우선순위: uuid → postId(문자열로 변환)
     * - URL path variable, 링크 생성 등에 유용
     */
    public String getKey() {
        if (uuid != null && !uuid.isBlank()) return uuid;          // 1) uuid가 있으면 그대로
        if (postId != null) return String.valueOf(postId);         // 2) 없으면 숫자 PK를 문자열로
        return null;                                               // 3) 둘 다 없으면 null
    }

    /**
     * 문자열 키를 역으로 세팅
     * - 숫자면 postId에 파싱 저장
     * - 그 외면 uuid로 저장
     * - 빈 문자열/null이면 둘 다 초기화
     */
    public void setKey(String key) {
        if (key == null || key.isBlank()) {                        // 빈 키 방어
            this.uuid = null;
            this.postId = null;
            return;
        }
        if (key.matches("\\d+")) {                                 // 정수 형태라면
            try {
                this.postId = Long.parseLong(key);                 // postId로 파싱
                this.uuid = null;                                  // uuid는 초기화(서로 배타)
            } catch (NumberFormatException e) {                    // 경계(숫자 범위 초과 등) 발생 시
                this.uuid = key;                                   // 안전하게 uuid로 취급
                this.postId = null;
            }
        } else {
            this.uuid = key;                                       // 숫자가 아니면 uuid로 저장
            this.postId = null;
        }
    }

    /**
     * DAO에서 WHERE 바인딩 시 편한 “범용 PK(Object)”
     * - 우선순위: postId(Long) → uuid(String)
     * - null이면 식별 불가 상태
     */
    public Object anyId() {
        if (postId != null) return postId;                         // 1) 숫자 PK 우선
        if (uuid != null && !uuid.isBlank()) return uuid;          // 2) 그 다음 uuid
        return null;                                               // 3) 없으면 null
    }

    @Override
    public String toString() {                                     // 디버깅/로그용 문자열 표현
        return "PostDto{" +
                "postId=" + postId +
                ", uuid='" + uuid + '\'' +
                ", boardCode='" + boardCode + '\'' +
                ", title='" + title + '\'' +
                // content는 길 수 있어 보통 로깅에서 생략하는 편(필요 시 추가)
                ", writerId='" + writerId + '\'' +
                ", writerName='" + writerName + '\'' +
                ", createdAt=" + createdAt +
                ", updatedAt=" + updatedAt +
                '}';
    }
}
