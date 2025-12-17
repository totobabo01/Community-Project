// src/main/java/com/example/demo/controller/BigBoardController.java
package com.example.demo.controller;

// ───────── 일반 유틸/날짜/컬렉션 import ─────────
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

    private static final int PAGE_SIZE = 1000;
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
            return new PageDTO<>(items, total, page, PAGE_SIZE);
        }

        // ── 검색 모드 ──
        if (page < 0) page = 0;

        long total = bigPostDao.searchCount(type, keyword, from, to);
        int size = PAGE_SIZE;

        long totalPagesLong = (total + size - 1L) / size;
        int totalPages = (int) Math.max(totalPagesLong, 1L);
        if (page >= totalPages) page = totalPages - 1;

        List<BigPostDto> items =
                bigPostDao.searchPageByIdRange(type, keyword, from, to, page, size);

        return new PageDTO<>(items, total, page, size);
    }

    // ─────────────────────────────────────────
    // ② 메타 정보 (정확한 COUNT)
    //    GET /api/big-board/meta
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
    // ③ chunk API
    //    GET /api/big-board/chunk
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
    // ✅ 공통 단건 조회 로직(조회수 +1 포함)
    // ─────────────────────────────────────────
    private BigPostDto loadOneWithViewCount(Long id) {
        if (id == null) return null;

        // ✅ 조회수 1 증가
        bigPostDao.increaseViewCnt(id);

        // ✅ 증가된 view_cnt까지 포함해서 다시 조회 후 반환
        return bigPostDao.findById(id);
    }

    // ─────────────────────────────────────────
    // ④-1 단건 조회 (기존)
    //    GET /api/big-board/{id}
    // ─────────────────────────────────────────
    @GetMapping("/{id}")
    public BigPostDto getOne(@PathVariable Long id) {
        return loadOneWithViewCount(id);
    }

    // ─────────────────────────────────────────
    // ④-2 단건 조회 (✅ 프론트 호환용 alias)
    //    GET /api/big-board/posts/{id}
    //    - 프론트(BoardViewCtrl)가 이 주소를 호출 중이라 404 해결용
    // ─────────────────────────────────────────
    @GetMapping("/posts/{id}")
    public BigPostDto getOneByPostsPath(@PathVariable Long id) {
        return loadOneWithViewCount(id);
    }

    // ─────────────────────────────────────────
    // ⑤ 글쓰기
    //    POST /api/big-board
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

        // ✅ viewCnt는 DB DEFAULT 0 이므로 안전하게 0으로 고정
        d.setViewCnt(0);

        Long id = bigPostDao.insert(d);
        d.setId(id);

        return d;
    }

    // ─────────────────────────────────────────
    // ⑥ 수정
    //    PUT /api/big-board/{id}
    // ─────────────────────────────────────────
    @PutMapping("/{id}")
    public BigPostDto update(@PathVariable Long id, @RequestBody BigPostDto d) {
        d.setId(id);

        if (d.getTitle() == null || d.getTitle().isBlank()) {
            throw new IllegalArgumentException("제목은 필수입니다.");
        }
        if (d.getContent() == null) {
            d.setContent("");
        }
        if (d.getWriterId() == null || d.getWriterId().isBlank()) {
            d.setWriterId("anonymous");
        }

        bigPostDao.update(d);
        return bigPostDao.findById(id);
    }

    // ─────────────────────────────────────────
    // ⑦ 삭제
    //    DELETE /api/big-board/{id}
    // ─────────────────────────────────────────
    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        bigPostDao.delete(id);
    }
}
