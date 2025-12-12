// src/main/java/com/example/demo/controller/ApiController.java
package com.example.demo.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

@RestController
@RequestMapping("/api/bus")
public class ApiController {

    // ───────── 정류소 정보 ─────────
    @Value("${tago.bus.station.base-url}")
    private String stationBaseUrl;

    @Value("${tago.bus.station.service-key}")
    private String stationServiceKey;

    // ───────── 버스 위치 정보 ─────────
    @Value("${tago.bus.location.base-url}")
    private String locationBaseUrl;

    @Value("${tago.bus.location.service-key}")
    private String locationServiceKey;

    // ───────── 버스 도착 정보 ─────────
    @Value("${tago.bus.arrival.base-url}")
    private String arrivalBaseUrl;

    @Value("${tago.bus.arrival.service-key}")
    private String arrivalServiceKey;

    // ───────── 버스 노선 정보 (경로) ─────────
    @Value("${tago.bus.route.base-url}")
    private String routeBaseUrl;

    @Value("${tago.bus.route.service-key}")
    private String routeServiceKey;

    // 공용 RestTemplate
    private final RestTemplate rt = new RestTemplate();

    // ================== 1) 정류장 목록 ==================
    @GetMapping("/stops")
    public ResponseEntity<?> searchStops(
            @RequestParam("cityCode") String cityCode,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "500") int numOfRows
    ) {
        String serviceKey      = URLEncoder.encode(stationServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,       StandardCharsets.UTF_8);

        String url = String.format(
                "%s/getSttnNoList?serviceKey=%s&cityCode=%s&pageNo=%d&numOfRows=%d&_type=json",
                stationBaseUrl,
                serviceKey,
                encodedCityCode,
                pageNo,
                numOfRows
        );
        System.out.println("[TAGO 정류장검색] URL = " + url + " (keyword=" + keyword + ")");

        String body = rt.getForObject(url, String.class);
        return ResponseEntity.ok(body);
    }

    // ================== 2) 노선별 버스 위치 ==================
    @GetMapping({"/pos", "/location"})
    public ResponseEntity<?> getBusPos(
            @RequestParam("cityCode") String cityCode,
            @RequestParam("routeId") String routeId,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "100") int numOfRows
    ) {
        String serviceKey      = URLEncoder.encode(locationServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);
        String encodedRouteId  = URLEncoder.encode(routeId,          StandardCharsets.UTF_8);

        String url = String.format(
                "%s/getRouteAcctoBusLcList?serviceKey=%s&cityCode=%s&routeId=%s&pageNo=%d&numOfRows=%d&_type=json",
                locationBaseUrl,
                serviceKey,
                encodedCityCode,
                encodedRouteId,
                pageNo,
                numOfRows
        );

        System.out.println("[TAGO 노선 위치] URL = " + url);

        String body = rt.getForObject(url, String.class);
        return ResponseEntity.ok(body);
    }

    // ================== 3) 정류장별 도착 정보 ==================
    @GetMapping("/arrival")
    public ResponseEntity<?> getArrival(
            @RequestParam("cityCode") String cityCode,
            @RequestParam("nodeId") String nodeId,
            @RequestParam(defaultValue = "50") int numOfRows,
            @RequestParam(defaultValue = "1") int pageNo
    ) {
        String serviceKey      = URLEncoder.encode(arrivalServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,         StandardCharsets.UTF_8);
        String encodedNodeId   = URLEncoder.encode(nodeId,           StandardCharsets.UTF_8);

        String url = String.format(
                "%s/getSttnAcctoArvlPrearngeInfoList?serviceKey=%s&cityCode=%s&nodeId=%s&numOfRows=%d&pageNo=%d&_type=json",
                arrivalBaseUrl,
                serviceKey,
                encodedCityCode,
                encodedNodeId,
                numOfRows,
                pageNo
        );

        System.out.println("[TAGO 도착정보] URL = " + url);

        String body = rt.getForObject(url, String.class);
        return ResponseEntity.ok(body);
    }

    // ================== 4) 노선 경유 정류장(경로) ==================
    //  → BusRouteInfoInqireService 의
    //    getRouteAcctoThrghSttnList(노선별 경유정류소 목록) 사용
    @GetMapping("/routePath")
    public ResponseEntity<?> getRoutePath(
            @RequestParam("cityCode") String cityCode,   // TAGO 쪽에 그대로 넘김
            @RequestParam("routeId") String routeId,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "500") int numOfRows
    ) {
        String serviceKey      = URLEncoder.encode(routeServiceKey, StandardCharsets.UTF_8);
        String encodedCityCode = URLEncoder.encode(cityCode,       StandardCharsets.UTF_8);
        String encodedRouteId  = URLEncoder.encode(routeId,        StandardCharsets.UTF_8);

        String url = String.format(
                "%s/getRouteAcctoThrghSttnList?serviceKey=%s&cityCode=%s&routeId=%s&pageNo=%d&numOfRows=%d&_type=json",
                routeBaseUrl,
                serviceKey,
                encodedCityCode,
                encodedRouteId,
                pageNo,
                numOfRows
        );

        System.out.println("[TAGO 노선경로] URL = " + url);

        try {
            String body = rt.getForObject(url, String.class);
            return ResponseEntity.ok(body);
        } catch (RestClientResponseException e) {
            // TAGO 쪽에서 400/404/500 를 주면 여기로 옴 → 그대로 상태코드/바디 전달
            System.out.println("[TAGO 노선경로] 에러 status=" + e.getRawStatusCode());
            System.out.println("[TAGO 노선경로] response=" + e.getResponseBodyAsString());
            return ResponseEntity
                    .status(e.getRawStatusCode())
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity
                    .status(500)
                    .body("TAGO 노선경로 호출 중 서버 내부 오류: " + e.getMessage());
        }
    }
}
