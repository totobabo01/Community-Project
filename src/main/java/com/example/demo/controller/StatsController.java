// src/main/java/com/example/demo/controller/StatsController.java
package com.example.demo.controller; // ✅ 이 클래스가 들어있는 패키지 경로(컨트롤러 계층)

// ✅ DTO 리스트, HTTP 응답 객체를 만들기 위한 import들
import java.util.List; // ✅ 여러 개의 StatsDto를 담아 반환하기 위한 List

import org.springframework.http.CacheControl; // ✅ 응답 캐시 정책(noStore 등)을 설정하기 위해 사용
import org.springframework.http.ResponseEntity; // ✅ 상태코드/헤더/바디를 함께 담아 반환하는 응답 래퍼
import org.springframework.web.bind.annotation.GetMapping; // ✅ HTTP GET 요청을 특정 메서드에 매핑
import org.springframework.web.bind.annotation.RequestMapping; // ✅ 클래스 레벨에서 공통 URL prefix 지정
import org.springframework.web.bind.annotation.RequestParam; // ✅ 쿼리 파라미터(?board=...&metric=...)를 메서드 파라미터로 바인딩
import org.springframework.web.bind.annotation.RestController; // ✅ JSON을 바로 반환하는 REST 컨트롤러임을 선언

import com.example.demo.dao.StatsDao; // ✅ DB에서 통계 데이터를 조회하는 DAO 계층 클래스
import com.example.demo.dto.StatsDto; // ✅ 통계 결과 한 줄(행)을 표현하는 DTO

@RestController // ✅ 이 클래스의 메서드 반환값을 View가 아니라 JSON(ResponseBody)로 응답하게 함
@RequestMapping("/api/stats") // ✅ 이 컨트롤러의 모든 엔드포인트는 /api/stats 로 시작
public class StatsController { // ✅ 통계 관련 API 요청을 처리하는 컨트롤러 클래스

    private final StatsDao statsDao; // ✅ 통계 DB 조회 로직을 담당하는 DAO(생성자 주입용 final)

    public StatsController(StatsDao statsDao) { // ✅ 스프링이 StatsDao 빈을 주입해서 컨트롤러를 생성
        this.statsDao = statsDao; // ✅ 주입받은 DAO를 멤버 변수에 저장
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
    @GetMapping("/top10") // ✅ GET /api/stats/top10 으로 들어오는 요청을 이 메서드가 처리
    public ResponseEntity<List<StatsDto>> top10( // ✅ 응답은 StatsDto 리스트를 JSON으로 담은 ResponseEntity
            @RequestParam(name = "board", defaultValue = "NORM") String board, // ✅ 쿼리파라미터 board를 받음(없으면 "NORM")
            @RequestParam(name = "metric", defaultValue = "posts") String metric // ✅ 쿼리파라미터 metric을 받음(없으면 "posts")
    ) {
        // ✅ board/metric 정규화
        String b = (board == null) ? "NORM" : board.trim().toUpperCase(); // ✅ board가 null이면 NORM, 아니면 공백 제거 후 대문자화
        String m = (metric == null) ? "posts" : metric.trim().toLowerCase(); // ✅ metric이 null이면 posts, 아니면 공백 제거 후 소문자화

        // ✅ 허용 값만 통과
        if (!"BIG".equals(b) && !"NORM".equals(b)) { // ✅ board 값이 BIG도 NORM도 아니면
            b = "NORM"; // ✅ 안전하게 기본값 NORM으로 강제
        }

        // ✅ metric: posts | views | views_sum
        if (!"posts".equals(m) && !"views".equals(m) && !"views_sum".equals(m)) { // ✅ metric이 허용된 3개 중 하나가 아니면
            m = "posts"; // ✅ 안전하게 기본값 posts로 강제
        }

        // ✅ 조회
        // - BIG: posts/views_sum 은 요약테이블(big_board_user_stats) 기반이어야 빠름
        // - BIG: views 는 "게시글 view_cnt Top10" (SUM 아님) → big_posts에서 직접 뽑아야 'view_cnt 그대로'가 됨
        List<StatsDto> rows = "BIG".equals(b) ? statsDao.top10Big(m) : statsDao.top10Norm(m);
        // ✅ board가 BIG이면 statsDao.top10Big(m) 호출
        // ✅ board가 NORM이면 statsDao.top10Norm(m) 호출
        // ✅ 결과는 StatsDto 행 리스트로 받음(Top10 결과)

        // ✅ 캐시 방지
        return ResponseEntity.ok() // ✅ HTTP 200 OK 응답을 만들고
                .cacheControl(CacheControl.noStore()) // ✅ 브라우저/프록시가 응답을 저장(캐싱)하지 않도록 no-store 헤더 설정
                .body(rows); // ✅ 응답 바디에 rows(List<StatsDto>)를 넣어 JSON으로 반환
    }
}
