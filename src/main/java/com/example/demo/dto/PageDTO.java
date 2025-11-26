// src/main/java/com/example/demo/dto/PageDTO.java
package com.example.demo.dto;

import java.util.Collections;
import java.util.List;

/**
 * 공통 페이지 응답 DTO
 *
 * - content       : 현재 페이지의 데이터 목록
 * - totalElements : 전체 행 개수 (SELECT COUNT(*) 결과)
 * - page          : 현재 페이지 번호 (0-base)
 * - size          : 페이지 크기 (한 페이지 당 행 개수)
 * - totalPages    : 전체 페이지 수
 *
 * ※ 예전 버전처럼 totalPages 를 20,000 으로 자르지 않음.
 *    => DB에 2천만 개 넣었으면 20,000 페이지 이상/이하도 그대로 반영됨.
 */
public class PageDTO<T> {

    private List<T> content;      // 현재 페이지 데이터
    private long totalElements;   // 전체 행 개수
    private int page;             // 현재 페이지(0-base)
    private int size;             // 페이지 크기
    private int totalPages;       // 전체 페이지 수

    public PageDTO(List<T> content, long totalElements, int page, int size) {
        this.content = (content != null) ? content : Collections.emptyList();
        this.totalElements = totalElements;

        // page / size 기본값 보정
        this.page = Math.max(page, 0);
        this.size = (size <= 0) ? this.content.size() : size;

        // totalPages 계산
        if (this.size <= 0) {
            // size 가 0 이거나 알 수 없는 경우, 최소 1페이지로 처리
            this.totalPages = 1;
        } else {
            long pages = (totalElements + this.size - 1) / this.size; // 올림
            if (pages < 1L) {
                pages = 1L;
            }
            // ★ 더 이상 pages 를 20,000 으로 자르지 않음
            this.totalPages = (int) pages;
        }
    }

    // ───────── getter / setter ─────────

    public List<T> getContent() {
        return content;
    }

    public void setContent(List<T> content) {
        this.content = content;
    }

    public long getTotalElements() {
        return totalElements;
    }

    public void setTotalElements(long totalElements) {
        this.totalElements = totalElements;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public int getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(int totalPages) {
        this.totalPages = totalPages;
    }
}
