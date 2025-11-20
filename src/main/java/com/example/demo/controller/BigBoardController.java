// src/main/java/com/example/demo/controller/BigBoardController.java
package com.example.demo.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.BigPostDao;
import com.example.demo.dto.BigPostDto;
import com.example.demo.dto.PageDTO;

@RestController
@RequestMapping("/api/big-board")   // 이 컨트롤러의 기본 URL prefix
public class BigBoardController {

    private final BigPostDao bigPostDao;

    // 스프링이 BigPostDao를 주입하기 위한 생성자
    public BigBoardController(BigPostDao bigPostDao) {
        this.bigPostDao = bigPostDao;
    }

    /**
     * 대용량 게시판 목록 조회
     * 예: GET /api/big-board/posts?page=0&size=20
     */
    @GetMapping("/posts")
    public PageDTO<BigPostDto> list(
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        // 파라미터 방어 코드 (음수/0 처리)
        if (page < 0) page = 0;
        if (size <= 0 || size > 100) size = 20;

        long total = bigPostDao.countAll();                 // 전체 행 개수
        List<BigPostDto> items = bigPostDao.findPage(page, size); // 현재 페이지 데이터

        // ✅ PageDTO 생성 방식은 네 프로젝트에서 쓰는 생성자 형태에 맞춰야 함
        // 보통 이런 형태라면 아래 코드가 맞음:
        return new PageDTO<>(items, total, page, size);

        /*
        만약 PageDTO에 기본 생성자 + setter만 있고 위 생성자가 없다면 이렇게 써도 됨:

        PageDTO<BigPostDto> dto = new PageDTO<>();
        dto.setItems(items);         // 또는 setContent(...) 등, 실제 필드 이름에 맞게
        dto.setTotalElements(total);
        dto.setPage(page);
        dto.setSize(size);
        return dto;
        */
    }
}
