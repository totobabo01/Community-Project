package com.example.demo.dto;   // 이 클래스가 속한 패키지 이름을 지정. 다른 파일에서 import 할 때 이 경로를 사용하게 됨.

import java.time.LocalDateTime; // Java 8 날짜/시간 타입 중 하나인 LocalDateTime을 사용하기 위해 import.

// big_posts 테이블의 한 줄(한 개 게시글)을 담는 그릇 역할을 하는 DTO 클래스
public class BigPostDto {

    private Long id;                 // 글 번호(PK). DB의 big_posts.id 컬럼과 매핑.
    private String title;            // 게시글 제목. big_posts.title 컬럼과 매핑.
    private String content;          // 게시글 내용. big_posts.content 컬럼과 매핑.
    private String writerId;         // 작성자의 아이디(또는 이름). big_posts.writer_id 컬럼과 매핑.
    private LocalDateTime createdAt; // 글이 작성된 날짜/시간. big_posts.created_at 컬럼과 매핑.

    // ───── 기본 생성자 ─────
    public BigPostDto() {
        // 아무 값도 세팅하지 않는 기본 생성자.
        // 스프링이나 Jackson, MyBatis, JdbcTemplate 등이
        // "일단 객체부터 하나 만들고, 나중에 setter로 값 채우기" 패턴을 쓸 때 필요함.
    }

    // ───── getter / setter ─────
    // 아래부터는 각 필드를 읽고/쓰는 메서드들.
    // ▶ getXxx() : 값 읽기
    // ▶ setXxx() : 값 넣기

    public Long getId() {   // id 값을 읽어오는 메서드
        return id;          // 현재 객체(this)의 id 필드를 리턴
    }

    public void setId(Long id) { // id 값을 외부에서 넣어줄 때 사용하는 메서드
        this.id = id;            // 매개변수로 받은 id를 이 객체의 필드 id에 저장
    }

    public String getTitle() {   // title 값을 읽는 메서드
        return title;            // 현재 객체의 title 필드를 반환
    }

    public void setTitle(String title) { // title 값을 설정하는 메서드
        this.title = title;              // 전달받은 title 값을 필드에 대입
    }

    public String getContent() { // content 값을 읽는 메서드
        return content;          // 현재 객체의 content 내용을 반환
    }

    public void setContent(String content) { // content 값을 설정하는 메서드
        this.content = content;              // 전달받은 content를 필드에 저장
    }

    public String getWriterId() { // writerId 값을 읽는 메서드
        return writerId;          // 현재 객체의 writerId 필드를 반환
    }

    public void setWriterId(String writerId) { // writerId 값을 설정하는 메서드
        this.writerId = writerId;              // 전달받은 writerId를 필드에 저장
    }

    public LocalDateTime getCreatedAt() { // createdAt 값을 읽는 메서드
        return createdAt;                 // 현재 객체의 createdAt 필드를 반환
    }

    public void setCreatedAt(LocalDateTime createdAt) { // createdAt 값을 설정하는 메서드
        this.createdAt = createdAt;                     // 전달받은 createdAt을 필드에 저장
    }
}
