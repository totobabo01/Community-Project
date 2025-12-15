// src/main/java/com/example/demo/dto/BigPostDto.java
package com.example.demo.dto;              // 이 클래스가 속한 패키지 이름. dto = Data Transfer Object 계층.

// 날짜/시간 정보를 담기 위해 사용하는 자바 표준 타입(LocalDateTime) import.
import java.time.LocalDateTime;

/**
 * big_posts 테이블의 한 행(게시글 1개)을 담는 DTO.
 *  - id          ↔ big_posts.id
 *  - title       ↔ big_posts.title
 *  - content     ↔ big_posts.content
 *  - writerId    ↔ big_posts.writer_id
 *  - viewCnt     ↔ big_posts.view_cnt   ✅ (추가: 조회수)
 *  - createdAt   ↔ big_posts.created_at
 *  - updatedAt   ↔ big_posts.updated_at
 *
 *  이 주석은 Javadoc 형식으로, IDE에서 마우스를 올리면 설명으로 보이고
 *  문서 자동 생성 도구에서도 사용될 수 있음.
 */
public class BigPostDto {

    // DB 컬럼 big_posts.id 에 대응되는 필드.
    // Long: 자바에서 64비트 정수, PK(AUTO_INCREMENT) 값과 매핑하기 좋음.
    private Long id;                 // 글 번호(PK)

    // big_posts.title 컬럼에 대응. 게시글 제목 텍스트.
    private String title;            // 제목

    // big_posts.content 컬럼에 대응. 게시글 본문 내용.
    private String content;          // 내용

    // big_posts.writer_id 컬럼에 대응. 작성자의 아이디(문자열) 저장.
    private String writerId;         // 작성자 아이디

    // ✅ big_posts.view_cnt 컬럼에 대응. 조회수(기본값 0)
    private long viewCnt;            // 조회수

    // big_posts.created_at 컬럼에 대응.
    // DB에서는 DATETIME/TIMESTAMP, 자바에서는 LocalDateTime 으로 받음.
    private LocalDateTime createdAt; // 작성일시

    // big_posts.updated_at 컬럼에 대응. 마지막 수정 시각.
    private LocalDateTime updatedAt; // 수정일시

    // 기본 생성자.
    //  - 프레임워크(Spring, Jackson 등)가 JSON → 객체로 바꿀 때
    //    리플렉션으로 이 생성자를 사용해서 객체를 만든 뒤 setter로 값 채움.
    public BigPostDto() {
    }

    // 모든 필드를 한 번에 초기화하는 생성자.
    //  - 코드에서 편하게 new BigPostDto(…전체 필드…) 할 때 쓰는 용도.
    //  - 사용 안 해도 상관은 없지만, 테스트나 수동 생성 시 유용함.
    public BigPostDto(Long id,
                      String title,
                      String content,
                      String writerId,
                      long viewCnt,                 // ✅ (추가)
                      LocalDateTime createdAt,
                      LocalDateTime updatedAt) {
        this.id = id;                 // 파라미터 id 값을 필드 this.id 에 대입.
        this.title = title;           // 파라미터 title → this.title
        this.content = content;       // 파라미터 content → this.content
        this.writerId = writerId;     // 파라미터 writerId → this.writerId
        this.viewCnt = viewCnt;       // ✅ 파라미터 viewCnt → this.viewCnt
        this.createdAt = createdAt;   // 파라미터 createdAt → this.createdAt
        this.updatedAt = updatedAt;   // 파라미터 updatedAt → this.updatedAt
    }

    // ───── getter / setter ─────
    // 각 필드는 private 이라서 외부에서 직접 접근 못 하고
    // public getter/setter 를 통해서만 읽고/쓰도록 캡슐화.

    // id 값을 읽을 때 사용하는 메서드.
    public Long getId() {
        return id;  // 현재 객체의 id 필드 값을 반환.
    }

    // id 값을 변경할 때 사용하는 메서드.
    public void setId(Long id) {
        this.id = id; // 파라미터로 받은 id 값을 this.id 에 저장.
    }

    // title(제목)을 읽는 getter.
    public String getTitle() {
        return title; // 현재 제목 반환.
    }

    // title(제목)을 수정하는 setter.
    public void setTitle(String title) {
        this.title = title; // 파라미터 title → 필드 title.
    }

    // content(내용)을 읽는 getter.
    public String getContent() {
        return content; // 내용 반환.
    }

    // content(내용)을 수정하는 setter.
    public void setContent(String content) {
        this.content = content; // 파라미터 content → 필드 content.
    }

    // writerId(작성자 아이디)를 읽는 getter.
    public String getWriterId() {
        return writerId; // 작성자 아이디 반환.
    }

    // writerId(작성자 아이디)를 수정하는 setter.
    public void setWriterId(String writerId) {
        this.writerId = writerId; // 파라미터 writerId → 필드 writerId.
    }

    // ✅ viewCnt(조회수)를 읽는 getter.
    public long getViewCnt() {
        return viewCnt; // 조회수 반환.
    }

    // ✅ viewCnt(조회수)를 수정하는 setter.
    public void setViewCnt(long viewCnt) {
        this.viewCnt = viewCnt; // 파라미터 viewCnt → 필드 viewCnt.
    }

    // createdAt(작성일시)을 읽는 getter.
    public LocalDateTime getCreatedAt() {
        return createdAt; // 작성 시각 반환.
    }

    // createdAt(작성일시)을 설정하는 setter.
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt; // 파라미터 createdAt → 필드 createdAt.
    }

    // updatedAt(수정일시)을 읽는 getter.
    public LocalDateTime getUpdatedAt() {
        return updatedAt; // 마지막 수정 시각 반환.
    }

    // updatedAt(수정일시)을 설정하는 setter.
    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt; // 파라미터 updatedAt → 필드 updatedAt.
    }
}
