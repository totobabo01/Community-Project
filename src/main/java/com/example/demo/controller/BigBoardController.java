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

    public BigBoardController(BigPostDao bigPostDao) {
        this.bigPostDao = bigPostDao;
    }

    // =========================================================================
    // ① 1000개 단위 페이지 API — 페이지 버튼 클릭 시 사용되는 API
    // =========================================================================
    /**
     * 페이지네이션(1000개 단위) 목록 조회
     *
     * 예:
     *   GET /api/big-board/posts?page=0 → 최신 1000개
     *   GET /api/big-board/posts?page=1 → 그 다음 1000개
     *
     * 프론트에서는 BoardBaseCtrl가 이 API를 사용해서
     * 기본 1000개 페이지 단위 정보를 불러온 뒤,
     * 내부에서는 Lazy-loading으로 100개씩 추가 로드한다.
     */
    @GetMapping("/posts")
    public PageDTO<BigPostDto> list(
            @RequestParam(name = "page", defaultValue = "0") int page
    ) {
        if (page < 0) {
            page = 0;
        }

        final int pageSize = 1000; // 서버 페이지 하나 = 1000개

        long total = bigPostDao.countAll();
        List<BigPostDto> items = bigPostDao.findPage(page, pageSize);

        return new PageDTO<>(items, total, page, pageSize);
    }

    // =========================================================================
    // ② Lazy-loading API — offset 없음, Keyset 방식(id < lastId)
    // =========================================================================
    /**
     * Lazy-loading 전용 API (스크롤 내릴 때 100개씩 가져가는 방식)
     *
     * 예:
     *   GET /api/big-board/chunk?size=100
     *   GET /api/big-board/chunk?size=100&lastId=98000000
     *
     * 특징:
     *   - offset 사용하지 않음
     *   - WHERE id < lastId 조건으로 인덱스 타고 내려가기 때문에 매우 빠름
     *   - 대용량(1억 rows)에서도 즉시 반응하는 방식
     */
    @GetMapping("/chunk")
    public Map<String, Object> chunk(
            @RequestParam(required = false) Long lastId,
            @RequestParam(defaultValue = "100") int size
    ) {
        List<BigPostDto> list = bigPostDao.findChunk(lastId, size);

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);

        return result;
    }
}
