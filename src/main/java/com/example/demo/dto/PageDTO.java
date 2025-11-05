package com.example.demo.dto;           // DTO 클래스가 위치한 패키지 선언
import java.util.List;                  // 목록 타입(List) 사용을 위한 import

public class PageDTO<T> {               // 제네릭 타입 T에 대한 페이지 DTO(아무 타입의 리스트도 담을 수 있음)
  private List<T> content;              // 현재 페이지의 데이터 목록
  private long totalElements;           // 전체 데이터 개수(모든 페이지 합계)
  private int totalPages;               // 총 페이지 수(= ceil(totalElements / size))
  private int page;                     // 현재 페이지 번호(0-base 또는 1-base는 사용하는 쪽 규칙에 따름)
  private int size;                     // 페이지 크기(한 페이지에 몇 개 보여줄지)

  public PageDTO() {}                   // 기본 생성자(직렬화/프레임워크 바인딩용)

  public PageDTO(List<T> content, long total, int page, int size) { // 값 채워주는 생성자
    this.content = content;                                        // 현재 페이지의 목록 세팅
    this.totalElements = total;                                     // 전체 개수 세팅
    this.page = page;                                               // 현재 페이지 인덱스 세팅
    this.size = size;                                               // 페이지 크기 세팅
    this.totalPages = (int)Math.ceil(                               // 총 페이지 수 계산:
        (double)total / Math.max(1, size)                           //  - size가 0이면 오류이므로 최소 1로 방어
    );                                                              //  - 올림(ceil)으로 마지막 불완전 페이지 포함
  }

  public List<T> getContent() { return content; }                   // 목록 getter
  public void setContent(List<T> content) { this.content = content; } // 목록 setter

  public long getTotalElements() { return totalElements; }          // 전체 개수 getter
  public void setTotalElements(long totalElements) { this.totalElements = totalElements; } // 전체 개수 setter

  public int getTotalPages() { return totalPages; }                 // 총 페이지 수 getter
  public void setTotalPages(int totalPages) { this.totalPages = totalPages; } // 총 페이지 수 setter(외부에서 재계산 반영 가능)

  public int getPage() { return page; }                             // 현재 페이지 getter
  public void setPage(int page) { this.page = page; }               // 현재 페이지 setter

  public int getSize() { return size; }                             // 페이지 크기 getter
  public void setSize(int size) { this.size = size; }               // 페이지 크기 setter
}
