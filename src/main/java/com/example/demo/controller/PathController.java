package com.example.demo.controller;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.StopDao;
import com.example.demo.dto.PathResponse;
import com.example.demo.dto.StopDto;
import com.example.demo.service.ShortestPathService;
import com.example.demo.service.ShortestPathService.Mode;
import com.example.demo.service.ShortestPathService.Weight;

@RestController
@RequestMapping("/api/path")
public class PathController {

    private final ShortestPathService pathService;
    private final StopDao stopDao;

    public PathController(ShortestPathService pathService, StopDao stopDao) {
        this.pathService = pathService;
        this.stopDao = stopDao;
    }

    // ✅ 정류장 검색:
    // - keyword가 있으면: 자동완성 검색(findByName)
    // - keyword가 비어있으면: 전체 목록(findAll) (출발/도착에서 검색만 눌렀을 때)
    @GetMapping("/stops/search")
    public ResponseEntity<List<StopDto>> searchStops(
            @RequestParam String cityCode,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "20") int limit
    ) {
        String kw = (keyword == null) ? "" : keyword.trim();

        // ✅ keyword 비었으면 전체 조회
        if (kw.isEmpty()) {
            // 전체는 20개는 너무 적을 수 있어서, 프론트에서 limit을 300~1000 주는 걸 추천
            List<StopDto> list = stopDao.findAll(cityCode, type, limit);
            return ResponseEntity.ok(list);
        }

        // ✅ keyword 있으면 기존처럼 검색
        List<StopDto> list = stopDao.findByName(cityCode, kw, type, limit);
        return ResponseEntity.ok(list);
    }

    // ✅ 최단경로
    @GetMapping("/shortest")
    public ResponseEntity<PathResponse> shortest(
            @RequestParam String cityCode,
            @RequestParam String fromStopId,
            @RequestParam String toStopId,
            @RequestParam(defaultValue = "BUS_TRAM") String mode,
            @RequestParam(defaultValue = "DIST") String weight
    ) {
        Mode m = Mode.valueOf(mode.toUpperCase());
        Weight w = Weight.valueOf(weight.toUpperCase());

        PathResponse res = pathService.shortest(cityCode, fromStopId, toStopId, m, w);
        return ResponseEntity.ok(res);
    }
}
