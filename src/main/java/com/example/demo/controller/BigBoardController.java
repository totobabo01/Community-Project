// src/main/java/com/example/demo/controller/BigBoardController.java
package com.example.demo.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
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

    // 한 “페이지 번호”가 담당하는 DB 범위
    //   PAGE_SIZE = 1000 이면
    //   page 0  → 최신 0 ~ 999
    //   page 1  → 1000 ~ 1999
    //   ...
    private static final int PAGE_SIZE = 1000;

    // 무한 스크롤 chunk 기본 크기
    private static final int DEFAULT_CHUNK_SIZE = 100;

    public BigBoardController(BigPostDao bigPostDao) {
        this.bigPostDao = bigPostDao;
    }

    // ─────────────────────────────────────────
    // ① 기본 페이지 API (/api/big-board/posts)
    //    - BoardBaseCtrl.loadPosts() 가 사용하는 엔드포인트
    //    - page 는 0-base (0, 1, 2, ...)
    //    - BigPostDao.findPage() 안에서는 OFFSET 없이
    //      id 범위를 계산해서 BETWEEN 으로만 조회
    // ─────────────────────────────────────────
    @GetMapping("/posts")
    public PageDTO<BigPostDto> list(
            @RequestParam(name = "page", defaultValue = "0") int page
    ) {
        // 음수 방지
        if (page < 0) {
            page = 0;
        }

        // 실제 DB 전체 건수
        long total = bigPostDao.countAll(); // SELECT COUNT(*) FROM big_posts

        // 데이터가 하나도 없으면 바로 빈 페이지 리턴
        if (total == 0L) {
            return new PageDTO<>(List.of(), 0L, 0, PAGE_SIZE);
        }

        // 총 페이지 수 (올림 계산)
        long totalPagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE;
        int totalPages = (int) Math.max(totalPagesLong, 1L); // 최소 1페이지는 유지

        // 존재하지 않는 페이지로 들어오면 마지막 페이지로 보정
        if (page >= totalPages) {
            page = totalPages - 1;
        }

        // OFFSET 없이 id 범위로만 조회하는 Dao 메서드
        List<BigPostDto> items = bigPostDao.findPage(page, PAGE_SIZE);

        // PageDTO 안에서 totalPages 는 다시 계산됨
        return new PageDTO<>(items, total, page, PAGE_SIZE);
    }

    // ─────────────────────────────────────────
    // ② 메타 정보: 총 건수 / 페이지 수 / 페이지 크기
    //    - 프론트에서 필요하면 이걸로 pages, total, pageSize 세팅
    // ─────────────────────────────────────────
    @GetMapping("/meta")
    public Map<String, Object> meta() {
        long total = bigPostDao.countAll();                    // SELECT COUNT(*) FROM big_posts
        long pagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE; // 올림
        int pages = (int) Math.max(pagesLong, 1L);             // 최소 1페이지는 유지

        Map<String, Object> map = new HashMap<>();
        map.put("total", total);        // 전체 건수
        map.put("pageSize", PAGE_SIZE); // 서버 기준 페이지 크기
        map.put("pages", pages);        // 총 페이지 수(화면용, 1-base 갯수)
        return map;
    }

    // ─────────────────────────────────────────
    // ③ 무한 스크롤용 Keyset 기반 chunk API
    //
    //   * lastId : 직전에 받은 마지막 글 id
    //             (처음 호출 시 null → 최신 글부터)
    //   * size   : 이번에 더 가져올 개수 (기본 100, 최대 1000)
    //
    //   Dao:
    //     - lastId == null  → findFirstChunk(size)
    //     - lastId != null  → findChunkAfter(lastId, size)
    //
    //   OFFSET 을 전혀 사용하지 않으므로
    //   2천만 개 이상이어도 속도 저하를 최소화할 수 있음.
    // ─────────────────────────────────────────
    @GetMapping("/chunk")
    public Map<String, Object> chunk(
            @RequestParam(name = "lastId", required = false) Long lastId,
            @RequestParam(name = "size", defaultValue = "100") int size
    ) {
        // size 안전 보정
        if (size <= 0) {
            size = DEFAULT_CHUNK_SIZE;
        }
        if (size > PAGE_SIZE) {
            size = PAGE_SIZE; // 한 번에 1000개 이상은 가져오지 않도록 제한
        }

        // 실제 데이터 가져오기 (OFFSET 사용 X)
        List<BigPostDto> list;
        if (lastId == null) {
            // 최초 호출: 최신 글들부터 size 개
            list = bigPostDao.findFirstChunk(size);
        } else {
            // 이후 호출: lastId 보다 작은 글들 중 size 개
            list = bigPostDao.findChunkAfter(lastId, size);
        }

        // 이번 요청으로 새로 계산된 lastId (가장 아래 글 id)
        Long newLastId = lastId;
        if (!list.isEmpty()) {
            newLastId = list.get(list.size() - 1).getId();
        }

        // 더 가져올 수 있는지에 대한 대략적인 플래그
        boolean hasMore = !list.isEmpty();

        Map<String, Object> result = new HashMap<>();
        result.put("size", size);      // 이번에 가져온 chunk 크기
        result.put("list", list);      // 글 목록
        result.put("lastId", newLastId); // 다음 호출 시 사용할 anchor id
        result.put("hasMore", hasMore);  // 더 가져올 수 있는지 여부(단순 기준)
        return result;
    }
}
