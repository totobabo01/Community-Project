// src/main/java/com/example/demo/controller/StatsController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.StatsDao;
import com.example.demo.dto.StatsDto;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsDao statsDao;

    public StatsController(StatsDao statsDao) {
        this.statsDao = statsDao;
    }

    /**
     * 호출 예시
     *  /api/stats/top10?board=NORM&metric=posts       (사용자별 글 개수 Top10)
     *  /api/stats/top10?board=NORM&metric=views       (게시글 조회수(view_cnt) Top10)
     *  /api/stats/top10?board=NORM&metric=views_sum   (사용자별 조회수 합 Top10)
     *
     *  /api/stats/top10?board=BIG&metric=posts
     *  /api/stats/top10?board=BIG&metric=views
     *  /api/stats/top10?board=BIG&metric=views_sum
     */
    @GetMapping("/top10")
    public ResponseEntity<List<StatsDto>> top10(
            @RequestParam(name = "board", defaultValue = "NORM") String board,
            @RequestParam(name = "metric", defaultValue = "posts") String metric
    ) {
        // ✅ board/metric 정규화
        String b = (board == null) ? "NORM" : board.trim().toUpperCase();
        String m = (metric == null) ? "posts" : metric.trim().toLowerCase();

        // ✅ 허용 값만 통과
        if (!"BIG".equals(b) && !"NORM".equals(b)) {
            b = "NORM";
        }

        // ✅ metric: posts | views | views_sum
        if (!"posts".equals(m) && !"views".equals(m) && !"views_sum".equals(m)) {
            m = "posts";
        }

        // ✅ 조회
        // - BIG: posts/views_sum 은 요약테이블(big_board_user_stats) 기반이어야 빠름
        // - BIG: views 는 "게시글 view_cnt Top10" (SUM 아님) → big_posts에서 직접 뽑아야 'view_cnt 그대로'가 됨
        List<StatsDto> rows = "BIG".equals(b) ? statsDao.top10Big(m) : statsDao.top10Norm(m);

        // ✅ 캐시 방지
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(rows);
    }
}
