// src/main/java/com/example/demo/controller/BigBoardController.java
package com.example.demo.controller;                 // 이 파일이 속한 패키지(폴더 구조와 매핑). controller 계층을 의미.

// ───────── 일반 유틸/날짜/컬렉션 import ─────────
import java.time.LocalDate;                         // 날짜(연-월-일)만 다루는 LocalDate 타입 사용을 위해 import.
import java.util.HashMap;                           // key-value 형태의 Map 구현체인 HashMap 사용을 위해 import.
import java.util.List;                              // List 인터페이스(목록)를 사용하기 위해 import.
import java.util.Map;                               // Map 인터페이스 사용을 위해 import.

import org.springframework.format.annotation.DateTimeFormat;  // 요청 파라미터를 날짜 형식으로 변환해주는 애노테이션.
import org.springframework.web.bind.annotation.DeleteMapping; // HTTP DELETE 요청을 처리할 메서드에 붙이는 애노테이션.
import org.springframework.web.bind.annotation.GetMapping;     // HTTP GET 요청을 처리할 메서드에 붙이는 애노테이션.
import org.springframework.web.bind.annotation.PathVariable;  // URL 경로의 일부를 변수로 받기 위한 애노테이션.
import org.springframework.web.bind.annotation.PostMapping;    // HTTP POST 요청을 처리할 메서드에 붙이는 애노테이션.
import org.springframework.web.bind.annotation.PutMapping;     // HTTP PUT 요청을 처리할 메서드에 붙이는 애노테이션.
import org.springframework.web.bind.annotation.RequestBody;   // HTTP 요청 바디(JSON 등)를 자바 객체로 매핑하기 위한 애노테이션.
import org.springframework.web.bind.annotation.RequestMapping;// 컨트롤러 또는 메서드의 기본 URL 경로를 지정.
import org.springframework.web.bind.annotation.RequestParam;  // 쿼리 스트링 파라미터를 메서드 인자로 받기 위한 애노테이션.
import org.springframework.web.bind.annotation.RestController;// JSON 응답을 반환하는 컨트롤러임을 명시하는 애노테이션 (@Controller + @ResponseBody).

import com.example.demo.dao.BigPostDao;             // 대용량 게시판용 DAO(데이터베이스 접근 객체) 클래스.
import com.example.demo.dto.BigPostDto;             // 게시글 정보를 담는 DTO(Data Transfer Object).
import com.example.demo.dto.PageDTO;                // 페이지네이션 정보(목록, 총 개수, 현재 페이지 등)를 담는 DTO.

// 이 클래스는 REST API를 제공하는 컨트롤러임을 의미.
@RestController
// "/api/big-board" 로 시작하는 URL 요청을 이 컨트롤러에서 처리하겠다는 의미.
@RequestMapping("/api/big-board")
public class BigBoardController {

    // 대용량 게시판 데이터를 DB에서 조회/저장하는 DAO 의존성.
    private final BigPostDao bigPostDao;

    // 한 페이지당 보여줄 게시글 수를 고정(1000개)으로 지정.
    private static final int PAGE_SIZE = 1000;

    // 전체 게시글 수를 '대략 1억개'라고 가정하는 상수.
    // 검색이 아닐 때(일반 목록 조회) 대략적인 페이징 계산에 사용.
    private static final long APPROX_TOTAL = 100_000_000L; // 1억

    // 생성자 주입 방식으로 DAO를 받아서 필드에 저장.
    // 스프링이 BigPostDao 빈을 자동으로 넣어줌.
    public BigBoardController(BigPostDao bigPostDao) {
        this.bigPostDao = bigPostDao;
    }

    // ─────────────────────────────────────────
    // ① 목록 + 검색 API
    //    GET /api/big-board/posts
    //    - page: 페이지 번호(0부터 시작)
    //    - type/keyword: 검색 유형(제목/작성자 등) + 검색어
    //    - from/to: 날짜 범위 검색
    //    응답: PageDTO<BigPostDto> (목록 + 총 개수 + 페이지 정보)
    // ─────────────────────────────────────────
    @GetMapping("/posts") // "/api/big-board/posts" 경로로 들어오는 GET 요청 처리
    public PageDTO<BigPostDto> list(
            // 쿼리스트링 ?page= 값. 없으면 기본값 0 사용.
            @RequestParam(name = "page", defaultValue = "0") int page,
            // 검색 타입(예: "title", "writer"). 없으면 null 허용.
            @RequestParam(name = "type", required = false) String type,
            // 검색 키워드(문자열). 없으면 null 허용.
            @RequestParam(name = "keyword", required = false) String keyword,
            // 날짜 검색 시작일. "2025-01-01" 같은 형식의 문자열을 LocalDate로 변환.
            @RequestParam(name = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            // 날짜 검색 종료일. 마찬가지로 ISO 형식의 날짜 문자열을 LocalDate로 변환.
            @RequestParam(name = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        // keyword 가 null 이 아니고 공백이 아니면 검색어가 있다고 판단.
        boolean hasKeyword = (keyword != null && !keyword.isBlank());
        // from 또는 to 중 하나라도 값이 있으면 날짜 검색 조건이 있다고 판단.
        boolean hasDate = (from != null || to != null);
        // 검색어 또는 날짜 조건 둘 중 하나라도 있으면 "검색 모드"로 처리.
        boolean searchMode = (hasKeyword || hasDate);

        // ── 검색이 아닐 때: 1억개 기준 id 범위 조회 ──
        if (!searchMode) { // searchMode == false, 즉 일반 목록 조회(검색 X)
            if (page < 0) page = 0; // page가 음수이면 0 페이지로 보정.

            long total = APPROX_TOTAL; // 대략적인 전체 개수로 1억 사용.
            // 전체 페이지 수 = (총 개수 + 페이지크기 -1) / 페이지크기 (올림 나눗셈).
            long totalPagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE;
            // 최소 1페이지는 있어야 하므로 Math.max 사용.
            int totalPages = (int) Math.max(totalPagesLong, 1L);
            // page 번호가 전체 페이지 수를 넘어가면 마지막 페이지로 보정.
            if (page >= totalPages) page = totalPages - 1;

            // DAO를 통해 해당 페이지 번호에 해당하는 게시글 목록 조회.
            // 내부에서는 OFFSET이 아니라 id 범위를 이용해서 성능을 높이는 전략일 가능성이 큼.
            List<BigPostDto> items = bigPostDao.findPage(page, PAGE_SIZE);
            // PageDTO 생성 시 total, page, size 등을 넘겨주면,
            // PageDTO 내부에서 totalPages 등 추가 계산을 해줄 수 있음.
            return new PageDTO<>(items, total, page, PAGE_SIZE);
        }

        // ── 검색 모드: 조건에 맞는 글만 COUNT + 페이지 조회 ──
        if (page < 0) page = 0; // 검색 모드에서도 page 음수는 0으로 보정.

        // 조건(type, keyword, from, to)에 맞는 전체 개수를 COUNT(*)로 가져옴.
        // writer_id / created_at / title 등 컬럼에 인덱스가 있어야 성능이 좋음.
        long total = bigPostDao.searchCount(type, keyword, from, to);
        int size = PAGE_SIZE; // 페이지 크기는 동일하게 1000.

        // 검색 결과 전체 페이지 수 계산 (위와 같은 올림 나눗셈 방식).
        long totalPagesLong = (total + size - 1L) / size;
        int totalPages = (int) Math.max(totalPagesLong, 1L);
        // page 가 전체 페이지 수보다 크면 마지막 페이지로 보정.
        if (page >= totalPages) page = totalPages - 1;

        // ★ OFFSET 없이, id 범위 + 검색조건만으로 페이지 데이터를 가져오는 DAO 메서드.
        //   즉, 추가 WHERE 조건과 BETWEEN 등을 활용해 성능을 최적화하도록 설계된 메서드라고 볼 수 있음.
        List<BigPostDto> items =
                bigPostDao.searchPageByIdRange(type, keyword, from, to, page, size);

        // PageDTO에 검색된 목록, 총 개수, 현재 페이지, 페이지 크기를 담아서 반환.
        return new PageDTO<>(items, total, page, size);
    }

    // ─────────────────────────────────────────
    // ② 메타 정보 (정확한 전체 COUNT, 필요할 때만 사용)
    //    GET /api/big-board/meta
    //    - 전체 게시글 수와 페이지 수를 "정확하게" 알고 싶을 때 호출.
    //    - COUNT(*)는 느릴 수 있으므로 너무 자주 호출하지 않는 용도.
    // ─────────────────────────────────────────
    @GetMapping("/meta") // "/api/big-board/meta" GET 요청 처리
    public Map<String, Object> meta() {
        // DB에 있는 전체 글 수를 정확하게 COUNT.
        long total = bigPostDao.countAll();
        // 전체 페이지 수 = (total + PAGE_SIZE - 1) / PAGE_SIZE (올림 나눗셈).
        long pagesLong = (total + PAGE_SIZE - 1L) / PAGE_SIZE;
        // 최소 1페이지 이상으로 보정.
        int pages = (int) Math.max(pagesLong, 1L);

        // key-value 구조의 응답을 만들기 위해 HashMap 생성.
        Map<String, Object> map = new HashMap<>();
        map.put("total", total);          // 전체 글 개수.
        map.put("pageSize", PAGE_SIZE);   // 페이지당 글 개수(1000).
        map.put("pages", pages);          // 전체 페이지 수.
        return map;                       // JSON 형태로 응답(body)에 실려 나감.
    }

    // ─────────────────────────────────────────
    // ③ chunk API (필요하면 사용)
    //    GET /api/big-board/chunk
    //    - page: 어떤 "페이지 번호"에 해당하는 범위 내에서
    //    - last: 마지막으로 읽은 게시글 id (keyset 페이징 anchor)
    //    - size: 이번에 추가로 가져올 개수(예: 100개)
    //    -> 무한 스크롤에서 추가로 100개씩 끊어서 가져올 때 사용.
    // ─────────────────────────────────────────
    @GetMapping("/chunk") // "/api/big-board/chunk" GET 요청 처리
    public Map<String, Object> chunk(
            // 어떤 페이지 번호 영역인지(0부터 시작). 없으면 기본 0.
            @RequestParam(name = "page", defaultValue = "0") int page,
            // 마지막으로 본 게시글의 id. 없으면(null) 처음 호출로 간주.
            @RequestParam(name = "last", required = false) Long lastId,
            // 이번 요청에서 몇 개를 가져올지(기본 100개).
            @RequestParam(name = "size", defaultValue = "100") int size
    ) {
        if (page < 0) page = 0;         // page가 음수면 0으로 보정.
        if (size <= 0) size = 100;      // size가 0 이하이면 기본값 100 사용.
        if (size > PAGE_SIZE) size = PAGE_SIZE; // 한 번에 PAGE_SIZE(1000)보다 많이는 못 가져가게 제한.

        // DAO에게 "해당 page 영역 내에서, lastId 이후에 있는 글을 size만큼 가져와라" 라고 요청.
        // → keyset 기반 chunk 조회. OFFSET을 쓰지 않아 성능이 좋음.
        List<BigPostDto> list = bigPostDao.findChunkInPage(page, PAGE_SIZE, lastId, size);

        // 응답용 Map 구성.
        Map<String, Object> result = new HashMap<>();
        result.put("page", page);   // 현재 기준 page 번호.
        result.put("size", size);   // 이번에 요청한 chunk 크기.
        result.put("list", list);   // 가져온 게시글 목록.
        return result;              // JSON으로 반환.
    }

    // ─────────────────────────────────────────
    // ④ 단건 조회
    //    GET /api/big-board/{id}
    //    - 특정 id의 게시글 한 건을 조회.
    // ─────────────────────────────────────────
    @GetMapping("/{id}")            // "/api/big-board/123" 같은 요청을 처리.
    public BigPostDto getOne(@PathVariable Long id) {
        // URL 경로에 들어온 {id} 값을 이용해 DAO에서 한 건 조회.
        return bigPostDao.findById(id); // 조회한 결과 DTO를 그대로 반환(JSON으로 응답).
    }

    // ─────────────────────────────────────────
    // ⑤ 글쓰기
    //    POST /api/big-board
    //    - 요청 바디(JSON)로 title, content, writerId 등을 받음.
    // ─────────────────────────────────────────
    @PostMapping
    public BigPostDto create(@RequestBody BigPostDto d) {
        // 제목이 없거나 공백이면 예외를 던져서 400 Bad Request 응답.
        if (d.getTitle() == null || d.getTitle().isBlank()) {
            throw new IllegalArgumentException("제목은 필수입니다.");
        }
        // content가 null이면 빈 문자열로 초기화(널포인트 방지).
        if (d.getContent() == null) {
            d.setContent("");
        }
        // writerId가 없으면 "anonymous" 기본값 사용.
        if (d.getWriterId() == null || d.getWriterId().isBlank()) {
            d.setWriterId("anonymous");
        }

        // DAO에 insert 요청. insert 후 생성된 PK(id)를 반환 받음.
        Long id = bigPostDao.insert(d);
        // DTO 객체에 생성된 id를 세팅.
        d.setId(id);
        // 최종적으로 id까지 채워진 DTO를 응답으로 반환.
        return d;
    }

    // ─────────────────────────────────────────
    // ⑥ 수정
    //    PUT /api/big-board/{id}
    //    - URL의 {id}와 요청 바디의 내용으로 해당 글을 수정.
    // ─────────────────────────────────────────
    @PutMapping("/{id}") // "/api/big-board/123" 에 PUT 요청 시 실행.
    public BigPostDto update(@PathVariable Long id, @RequestBody BigPostDto d) {
        // URL로 받은 id를 DTO 안에 세팅해서 어떤 글을 수정할지 명확히 지정.
        d.setId(id);
        // DAO에 update 요청. DB에서 해당 id 레코드를 수정.
        bigPostDao.update(d);
        // 수정된 결과를 다시 조회해서 반환(갱신된 created_at/updated_at 등을 포함).
        return bigPostDao.findById(id);
    }

    // ─────────────────────────────────────────
    // ⑦ 삭제
    //    DELETE /api/big-board/{id}
    //    - 특정 id 게시글을 삭제.
    // ─────────────────────────────────────────
    @DeleteMapping("/{id}") // "/api/big-board/123" 에 DELETE 요청 시 실행.
    public void delete(@PathVariable Long id) {
        // DAO에 삭제 요청. 반환값이 없으므로 void.
        bigPostDao.delete(id);
    }
}
