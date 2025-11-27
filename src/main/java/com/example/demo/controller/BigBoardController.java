// src/main/java/com/example/demo/controller/BigBoardController.java
package com.example.demo.controller;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.BigPostDao;
import com.example.demo.dto.BigPostDto;
import com.example.demo.dto.PageDTO;

@RestController
@RequestMapping("/api/big-board")
public class BigBoardController {

    private final BigPostDao bigPostDao;

    // 한 페이지당 1000개
    private static final int PAGE_SIZE = 1000;

    // 대략적인 전체 개수 (검색 안 할 때만 사용)
    private static final long APPROX_TOTAL = 100_000_000L; // 1억

    public BigBoardController(BigPostDao bigPostDao) {
        this.bigPostDao = bigPostDao;
    }

    // ─────────────────────────────────────────
    // ① 목록 + 검색 API
    //    GET /api/big-board/posts
    // ─────────────────────────────────────────
    @GetMapping("/posts")
    public PageDTO<BigPostDto> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "type", required = false) String type,
            @RequestParam(name = "keyword", required = false) String keyword,
            @RequestParam(name = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(name = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        boolean hasKeyword = (keyword != null && !keyword.isBlank());
        boolean hasDate = (from != null || to != null);
        boolean searchMode = (hasKeyword || hasDate);

        // ── 검색이 아닐 때: 1억개 기준 id 범위 조회 ──
        if (!searchMode) {
            if (page < 0) page = 0;

            long total = APPROX_TOTAL;
            long totalPagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE;
            int totalPages = (int) Math.max(totalPagesLong, 1L);
            if (page >= totalPages) page = totalPages - 1;

            List<BigPostDto> items = bigPostDao.findPage(page, PAGE_SIZE);
            // PageDTO 안에서 totalPages 는 total / size 로 다시 계산됨
            return new PageDTO<>(items, total, page, PAGE_SIZE);
        }

        // ── 검색 모드: 조건에 맞는 글만 COUNT + 페이지 조회 ──
        if (page < 0) page = 0;

        // COUNT(*) (writer_id / created_at / title 인덱스 잘 잡혀 있어야 빠름)
        long total = bigPostDao.searchCount(type, keyword, from, to);
        int size = PAGE_SIZE;

        long totalPagesLong = (total + size - 1L) / size;
        int totalPages = (int) Math.max(totalPagesLong, 1L);
        if (page >= totalPages) page = totalPages - 1;

        // ★ OFFSET 없이 id 구간 + 검색조건으로만 조회하는 메서드
        List<BigPostDto> items =
                bigPostDao.searchPageByIdRange(type, keyword, from, to, page, size);

        return new PageDTO<>(items, total, page, size);
    }

    // ─────────────────────────────────────────
    // ② 메타 정보 (정확한 전체 COUNT, 필요할 때만 사용)
    // ─────────────────────────────────────────
    @GetMapping("/meta")
    public Map<String, Object> meta() {
        long total = bigPostDao.countAll();
        long pagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE;
        int pages = (int) Math.max(pagesLong, 1L);

        Map<String, Object> map = new HashMap<>();
        map.put("total", total);
        map.put("pageSize", PAGE_SIZE);
        map.put("pages", pages);
        return map;
    }

    // ─────────────────────────────────────────
    // ③ chunk API (필요하면 사용)
    // ─────────────────────────────────────────
    @GetMapping("/chunk")
    public Map<String, Object> chunk(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "last", required = false) Long lastId,
            @RequestParam(name = "size", defaultValue = "100") int size
    ) {
        if (page < 0) page = 0;
        if (size <= 0) size = 100;
        if (size > PAGE_SIZE) size = PAGE_SIZE;

        List<BigPostDto> list = bigPostDao.findChunkInPage(page, PAGE_SIZE, lastId, size);

        Map<String, Object> result = new HashMap<>();
        result.put("page", page);
        result.put("size", size);
        result.put("list", list);
        return result;
    }

    // ─────────────────────────────────────────
    // ④ 단건 조회
    // ─────────────────────────────────────────
    @GetMapping("/{id}")
    public BigPostDto getOne(@PathVariable Long id) {
        return bigPostDao.findById(id);
    }

    // ─────────────────────────────────────────
    // ⑤ 글쓰기
    // ─────────────────────────────────────────
    @PostMapping
    public BigPostDto create(@RequestBody BigPostDto d) {
        if (d.getTitle() == null || d.getTitle().isBlank()) {
            throw new IllegalArgumentException("제목은 필수입니다.");
        }
        if (d.getContent() == null) {
            d.setContent("");
        }
        if (d.getWriterId() == null || d.getWriterId().isBlank()) {
            d.setWriterId("anonymous");
        }

        Long id = bigPostDao.insert(d);
        d.setId(id);
        return d;
    }

    // ─────────────────────────────────────────
    // ⑥ 수정
    // ─────────────────────────────────────────
    @PutMapping("/{id}")
    public BigPostDto update(@PathVariable Long id, @RequestBody BigPostDto d) {
        d.setId(id);
        bigPostDao.update(d);
        return bigPostDao.findById(id);
    }

    // ─────────────────────────────────────────
    // ⑦ 삭제
    // ─────────────────────────────────────────
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        bigPostDao.delete(id);
    }
}
