// src/main/java/com/example/demo/dto/StatsDto.java
package com.example.demo.dto;

/**
 * 게시판 통계 Top10 결과 DTO
 *  - name  : 사용자 ID
 *  - value : 게시글 수(posts) 또는 조회수 합(views)
 */
public class StatsDto {

    private String name;
    private long value;

    public StatsDto() {
    }

    public StatsDto(String name, long value) {
        this.name = name;
        this.value = value;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        // ✅ 공백/NULL 방어 (프론트에서 표시 깔끔)
        this.name = (name == null) ? "" : name.trim();
    }

    public long getValue() {
        return value;
    }

    public void setValue(long value) {
        // ✅ 음수 방어 (혹시 모를 데이터 이상치)
        this.value = Math.max(0L, value);
    }
}
