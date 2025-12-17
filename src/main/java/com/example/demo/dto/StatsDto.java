// src/main/java/com/example/demo/dto/StatsDto.java
package com.example.demo.dto; // ✅ DTO들이 모여있는 패키지 선언(데이터 전달용 클래스 위치)

/**
 * 게시판 통계 Top10 결과 DTO                                    // ✅ 이 클래스가 어떤 데이터를 담는지 설명하는 Javadoc
 *  - name  : 사용자 ID                                         // ✅ 통계 대상(보통 작성자/사용자 식별자)
 *  - value : 게시글 수(posts) 또는 조회수 합(views)             // ✅ 통계 값(차트에 찍힐 숫자)
 */
public class StatsDto { // ✅ 통계 결과 한 행(이름 + 값)을 담는 DTO 클래스

    private String name; // ✅ 사용자 ID(또는 표시용 이름) 저장 필드
    private long value;  // ✅ 통계 수치(게시글 수/조회수/조회수 합 등) 저장 필드

    public StatsDto() {  // ✅ 기본 생성자(스프링/Jackson이 JSON 변환할 때 필요할 때가 많음)
    } // ✅ 기본 생성자 끝

    public StatsDto(String name, long value) { // ✅ name/value를 한번에 채워서 만들 수 있는 생성자
        this.name = name;   // ✅ 전달받은 name을 필드에 저장
        this.value = value; // ✅ 전달받은 value를 필드에 저장
    } // ✅ 파라미터 생성자 끝

    public String getName() { // ✅ name 값을 가져오는 getter(자바빈 규칙)
        return name;          // ✅ 현재 객체의 name 필드를 반환
    } // ✅ getName 끝

    public void setName(String name) { // ✅ name 값을 설정하는 setter(자바빈 규칙)
        // ✅ 공백/NULL 방어 (프론트에서 표시 깔끔)                 // ✅ null이거나 양쪽 공백이 있는 이름을 정리해서 UI 표시를 안정화
        this.name = (name == null) ? "" : name.trim(); // ✅ null이면 빈문자열로, 아니면 좌우 공백 제거 후 저장
    } // ✅ setName 끝

    public long getValue() { // ✅ value 값을 가져오는 getter
        return value;        // ✅ 현재 객체의 value 필드를 반환
    } // ✅ getValue 끝

    public void setValue(long value) { // ✅ value 값을 설정하는 setter
        // ✅ 음수 방어 (혹시 모를 데이터 이상치)                   // ✅ DB/연산 오류로 음수가 들어오는 상황을 차단
        this.value = Math.max(0L, value); // ✅ value가 0보다 작으면 0으로 보정, 아니면 그대로 저장
    } // ✅ setValue 끝
} // ✅ StatsDto 클래스 끝
