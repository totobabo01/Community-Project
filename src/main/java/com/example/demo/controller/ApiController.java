package com.example.demo.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import com.example.demo.dao.BusEdgeDao;
import com.example.demo.dao.StopDao;
import com.example.demo.dto.StopDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import jakarta.annotation.PostConstruct;

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

    // ───────── 버스 노선 정보 (경로/노선목록) ─────────
    @Value("${tago.bus.route.base-url}")
    private String routeBaseUrl;

    @Value("${tago.bus.route.service-key}")
    private String routeServiceKey;

    private final RestTemplate rt = new RestTemplate();
    private final ObjectMapper om = new ObjectMapper();

    private final StopDao stopDao;
    private final BusEdgeDao busEdgeDao;

    public ApiController(StopDao stopDao, BusEdgeDao busEdgeDao) {
        this.stopDao = stopDao;
        this.busEdgeDao = busEdgeDao;
    }

    // =========================================================
    // ✅ 전체 정류장 캐시
    // =========================================================
    private volatile ArrayNode stopsCache = null;
    private volatile long stopsCacheAtMs = 0L;

    private final Object cacheLock = new Object();
    private static final long CACHE_TTL_MS = 10 * 60 * 1000;

    private final AtomicBoolean refreshRunning = new AtomicBoolean(false);

    private static final String DEFAULT_CITY_CODE = "25";

    // 대전(cityCode=25) 정류장 총량이 3069개 수준이면 numOfRows=5000 한 번 호출로 끝남
    private static final int DEFAULT_NUM_OF_ROWS = 5000;
    private static final int DEFAULT_MAX_PAGES = 5;

    // =========================================================
    // ✅ 서버 시작 시 캐시 워밍업
    // =========================================================
    @PostConstruct
    public void warmupStopsCacheOnStartup() {
        new Thread(() -> {
            try {
                System.out.println("[CACHE/WARMUP] start cityCode=" + DEFAULT_CITY_CODE +
                        " numOfRows=" + DEFAULT_NUM_OF_ROWS + " maxPages=" + DEFAULT_MAX_PAGES);
                ArrayNode loaded = loadAllStops(DEFAULT_CITY_CODE, DEFAULT_NUM_OF_ROWS, DEFAULT_MAX_PAGES);
                if (loaded != null) {
                    stopsCache = loaded;
                    stopsCacheAtMs = System.currentTimeMillis();
                    System.out.println("[CACHE/WARMUP] done size=" + loaded.size());
                }
            } catch (Exception e) {
                System.out.println("[CACHE/WARMUP] failed: " + e.getMessage());
            }
        }, "stops-cache-warmup").start();
    }

    // =========================================================
    // ✅ 1) 정류장 목록 - /api/bus/stops
    // =========================================================
    @GetMapping(value = "/stops", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> searchStops(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "500") int numOfRows
    ) {
        cityCode = clean(cityCode);
        keyword = clean(keyword);

        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        if (pageNo < 1) pageNo = 1;
        numOfRows = clamp(numOfRows, 1, 5000, 500);

        try {
            ArrayNode cache = ensureStopsCache(cityCode);
            ArrayNode filtered = filterStops(cache, keyword);

            int total = filtered.size();
            ArrayNode paged = slicePage(filtered, pageNo, numOfRows);

            ObjectNode out = buildTagoLikeStopsResponse(paged, total, pageNo, numOfRows);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .cacheControl(CacheControl.maxAge(30, TimeUnit.SECONDS))
                    .body(out);

        } catch (RestClientResponseException e) {
            System.out.println("[STOPS/CACHE] 에러 status=" + e.getRawStatusCode());
            System.out.println("[STOPS/CACHE] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("정류장 캐시 조회 중 서버 내부 오류: " + e.getMessage());
        }
    }

    // ================== 1-2) 전체 정류장 목록(캐시 버전) ==================
    @GetMapping(value = "/stops/all", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getAllStops(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam(defaultValue = "5000") int numOfRows,
            @RequestParam(defaultValue = "5") int maxPages,
            @RequestParam(value = "refresh", required = false, defaultValue = "false") boolean refresh
    ) {
        cityCode = clean(cityCode);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        numOfRows = clamp(numOfRows, 1, 5000, 5000);
        maxPages = clamp(maxPages, 1, 200, 5);

        long now = System.currentTimeMillis();

        if (refresh) {
            triggerStopsRefreshAsync(cityCode, numOfRows, maxPages);
            if (stopsCache != null) {
                System.out.println("[TAGO 전체정류장/REFRESH] trigger + return cache size=" + stopsCache.size());
                return ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .cacheControl(CacheControl.noCache())
                        .body(stopsCache);
            }
        }

        if (stopsCache != null) {
            long age = now - stopsCacheAtMs;

            if (age > CACHE_TTL_MS) {
                triggerStopsRefreshAsync(cityCode, numOfRows, maxPages);
            }

            System.out.println("[TAGO 전체정류장/CACHE HIT] size=" + stopsCache.size() + ", ageMs=" + age);

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .cacheControl(CacheControl.maxAge(30, TimeUnit.SECONDS))
                    .body(stopsCache);
        }

        System.out.println("[TAGO 전체정류장/CACHE MISS] 최초 로딩 시작 cityCode=" + cityCode);

        synchronized (cacheLock) {
            if (stopsCache == null) {
                try {
                    ArrayNode loaded = loadAllStops(cityCode, numOfRows, maxPages);
                    stopsCache = loaded;
                    stopsCacheAtMs = System.currentTimeMillis();
                    System.out.println("[TAGO 전체정류장/CACHE BUILD DONE] size=" + (loaded == null ? 0 : loaded.size()));
                } catch (RestClientResponseException e) {
                    System.out.println("[TAGO 전체정류장] 에러 status=" + e.getRawStatusCode());
                    System.out.println("[TAGO 전체정류장] response=" + e.getResponseBodyAsString());
                    return ResponseEntity.status(e.getRawStatusCode())
                            .contentType(MediaType.TEXT_PLAIN)
                            .body(e.getResponseBodyAsString());
                } catch (Exception e) {
                    e.printStackTrace();
                    return ResponseEntity.status(500)
                            .contentType(MediaType.TEXT_PLAIN)
                            .body("TAGO 전체정류장 호출 중 서버 내부 오류: " + e.getMessage());
                }
            }
        }

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.noCache())
                .body(stopsCache);
    }

    // 캐시 상태 확인용
    @GetMapping(value = "/stops/cache/status", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<?> stopsCacheStatus() {
        long now = System.currentTimeMillis();
        long age = stopsCacheAtMs == 0 ? -1 : (now - stopsCacheAtMs);
        String msg =
                "cache=" + (stopsCache != null ? "ON" : "OFF") +
                        ", size=" + (stopsCache != null ? stopsCache.size() : 0) +
                        ", ageMs=" + age +
                        ", refreshRunning=" + refreshRunning.get();
        return ResponseEntity.ok(msg);
    }

    // =========================================================
    // Step1: 전체 정류장 적재(import)
    // POST /api/bus/stops/import?cityCode=25&type=BUS
    // =========================================================
    @PostMapping(value = "/stops/import", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<?> importStops(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam(defaultValue = "BUS") String type
    ) {
        cityCode = clean(cityCode);
        type = clean(type);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        StopDto.StopType stopType = parseStopType(type);

        try {
            ArrayNode arr = stopsCache;

            if (arr == null) {
                System.out.println("[IMPORT] cache miss -> loadAllStops() first");
                arr = loadAllStops(cityCode, DEFAULT_NUM_OF_ROWS, DEFAULT_MAX_PAGES);
                stopsCache = arr;
                stopsCacheAtMs = System.currentTimeMillis();
            }

            if (arr == null) {
                return ResponseEntity.status(500).body("전체 정류장 데이터(ArrayNode)가 없습니다.");
            }

            int saved = 0;
            int skipped = 0;

            for (JsonNode n : arr) {
                String stopId = clean(firstText(n, "nodeid", "nodeId", "nodeno", "nodeNo"));
                String name = clean(firstText(n, "nodenm", "nodeNm", "name"));

                Double latObj = firstDouble(n, "gpslati", "gpsLat", "lat", "latitude");
                Double lonObj = firstDouble(n, "gpslong", "gpsLong", "lon", "lng", "longitude");

                if (stopId == null || stopId.isBlank()) { skipped++; continue; }
                if (name == null || name.isBlank()) name = "(no-name)";

                if (latObj == null || lonObj == null) { skipped++; continue; }

                double lat = latObj;
                double lon = lonObj;

                StopDto dto = new StopDto(stopId, name, lat, lon, stopType, cityCode);
                stopDao.upsert(dto);
                saved++;
            }

            System.out.println("[IMPORT] 서버 DB에 stops " + saved + "개 저장됨 (skipped=" + skipped +
                    ", cityCode=" + cityCode + ", type=" + stopType + ")");
            return ResponseEntity.ok("서버 DB에 stops " + saved + "개 저장됨 (skipped=" + skipped + ")");

        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).body("import 실패: " + e.getMessage());
        }
    }

    // =========================================================
    // ✅ 노선 목록
    // =========================================================
    @GetMapping(value = "/routeList", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getRouteList(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "500") int numOfRows
    ) {
        cityCode = clean(cityCode);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        String serviceKey = serviceKeyForUrl(routeServiceKey);
        String encodedCityCode = enc(cityCode);

        String url = String.format(
                "%s/getRouteNoList?serviceKey=%s&cityCode=%s&pageNo=%d&numOfRows=%d&_type=json",
                routeBaseUrl,
                serviceKey,
                encodedCityCode,
                pageNo,
                numOfRows
        );

        System.out.println("[TAGO 노선목록] URL = " + url);

        try {
            String body = rt.getForObject(url, String.class);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);
        } catch (RestClientResponseException e) {
            System.out.println("[TAGO 노선목록] 에러 status=" + e.getRawStatusCode());
            System.out.println("[TAGO 노선목록] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("TAGO 노선목록 호출 중 서버 내부 오류: " + e.getMessage());
        }
    }

    // =========================================================
    // Step2: "버스 클릭한 노선(routeId)"으로 간선(edge) 저장
    // =========================================================
    @PostMapping(value = "/edges/import", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<?> importEdgesForRoute(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam("routeId") String routeId
    ) {
        cityCode = clean(cityCode);
        routeId = clean(routeId);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        try {
            String body = callRoutePathRaw(cityCode, routeId, 1, 500);
            JsonNode root = om.readTree(body);

            JsonNode itemNode = root.path("response").path("body").path("items").path("item");
            if (itemNode.isMissingNode() || itemNode.isNull()) {
                return ResponseEntity.ok("edges 0개 저장(경로 없음)");
            }

            List<JsonNode> stops = new ArrayList<>();
            if (itemNode.isArray()) itemNode.forEach(stops::add);
            else stops.add(itemNode);

            stops.sort((a, b) -> {
                Integer ao = safeInt(firstText(a, "nodeord", "nodeOrd"), 0);
                Integer bo = safeInt(firstText(b, "nodeord", "nodeOrd"), 0);
                return Integer.compare(ao, bo);
            });

            int saved = 0;
            int skipped = 0;

            for (int i = 0; i < stops.size() - 1; i++) {
                JsonNode A = stops.get(i);
                JsonNode B = stops.get(i + 1);

                String fromId = clean(firstText(A, "nodeid", "nodeId", "nodeno", "nodeNo"));
                String toId = clean(firstText(B, "nodeid", "nodeId", "nodeno", "nodeNo"));
                if (fromId == null || toId == null) { skipped++; continue; }

                Double fromLat = firstDouble(A, "gpslati", "gpsLat", "lat", "latitude");
                Double fromLon = firstDouble(A, "gpslong", "gpsLong", "lon", "lng", "longitude");
                Double toLat = firstDouble(B, "gpslati", "gpsLat", "lat", "latitude");
                Double toLon = firstDouble(B, "gpslong", "gpsLong", "lon", "lng", "longitude");

                Integer seqFrom = safeInt(firstText(A, "nodeord", "nodeOrd"), null);
                Integer seqTo = safeInt(firstText(B, "nodeord", "nodeOrd"), null);

                Double distM = haversineMeters(fromLat, fromLon, toLat, toLon);

                busEdgeDao.upsertEdge(
                        cityCode, routeId,
                        fromId, toId,
                        fromLat, fromLon, toLat, toLon,
                        seqFrom, seqTo,
                        distM
                );

                saved++;
            }

            System.out.println("[IMPORT-EDGES] cityCode=" + cityCode + ", routeId=" + routeId +
                    " saved=" + saved + " skipped=" + skipped);

            return ResponseEntity.ok("edges " + saved + "개 저장됨 (routeId=" + routeId + ")");

        } catch (RestClientResponseException e) {
            System.out.println("[IMPORT-EDGES] 에러 status=" + e.getRawStatusCode());
            System.out.println("[IMPORT-EDGES] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("edges import 실패: " + e.getMessage());
        }
    }

    // =========================================================
    // 2) 노선별 버스 위치
    // =========================================================
    @GetMapping(value = {"/pos", "/location"}, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getBusPos(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam("routeId") String routeId,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "100") int numOfRows
    ) {
        cityCode = clean(cityCode);
        routeId = clean(routeId);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        String serviceKey = serviceKeyForUrl(locationServiceKey);
        String encodedCityCode = enc(cityCode);
        String encodedRouteId = enc(routeId);

        debugParam("routeId", routeId);

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

        try {
            String body = rt.getForObject(url, String.class);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);
        } catch (RestClientResponseException e) {
            System.out.println("[TAGO 노선 위치] 에러 status=" + e.getRawStatusCode());
            System.out.println("[TAGO 노선 위치] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("TAGO 노선 위치 호출 중 서버 내부 오류: " + e.getMessage());
        }
    }

    // =========================================================
    // 3) 정류장별 도착 정보
    // =========================================================
    @GetMapping(value = "/arrival", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getArrival(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam("nodeId") String nodeId,
            @RequestParam(defaultValue = "50") int numOfRows,
            @RequestParam(defaultValue = "1") int pageNo
    ) {
        cityCode = clean(cityCode);
        nodeId = clean(nodeId);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        debugParam("nodeId", nodeId);

        String serviceKey = serviceKeyForUrl(arrivalServiceKey);
        String encodedCityCode = enc(cityCode);
        String encodedNodeId = enc(nodeId);

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

        try {
            String body = rt.getForObject(url, String.class);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);
        } catch (RestClientResponseException e) {
            System.out.println("[TAGO 도착정보] 에러 status=" + e.getRawStatusCode());
            System.out.println("[TAGO 도착정보] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("TAGO 도착정보 호출 중 서버 내부 오류: " + e.getMessage());
        }
    }

    // =========================================================
    // 4) 노선 경유 정류장(경로)
    // =========================================================
    @GetMapping(value = "/routePath", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getRoutePath(
            @RequestParam(value = "cityCode", required = false, defaultValue = DEFAULT_CITY_CODE) String cityCode,
            @RequestParam("routeId") String routeId,
            @RequestParam(defaultValue = "1") int pageNo,
            @RequestParam(defaultValue = "500") int numOfRows
    ) {
        cityCode = clean(cityCode);
        routeId = clean(routeId);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        if (routeId == null || routeId.isBlank()) return ResponseEntity.badRequest()
                .contentType(MediaType.TEXT_PLAIN)
                .body("routeId is empty");

        debugParam("cityCode", cityCode);
        debugParam("routeId", routeId);

        String serviceKey = serviceKeyForUrl(routeServiceKey);
        String encodedCityCode = enc(cityCode);
        String encodedRouteId = enc(routeId);

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

            try {
                JsonNode root = om.readTree(body);
                JsonNode total = root.path("response").path("body").path("totalCount");
                int totalCount = total.isMissingNode() ? -1 : total.asInt(-1);

                if (totalCount == 0) {
                    System.out.println("[TAGO 노선경로] totalCount=0 → routeId 확인 필요. routeId=" + routeId + ", cityCode=" + cityCode);
                } else {
                    System.out.println("[TAGO 노선경로] totalCount=" + totalCount);
                }
            } catch (Exception ignore) {}

            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body);

        } catch (RestClientResponseException e) {
            System.out.println("[TAGO 노선경로] 에러 status=" + e.getRawStatusCode());
            System.out.println("[TAGO 노선경로] response=" + e.getResponseBodyAsString());
            return ResponseEntity.status(e.getRawStatusCode())
                    .contentType(MediaType.TEXT_PLAIN)
                    .body(e.getResponseBodyAsString());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("TAGO 노선경로 호출 중 서버 내부 오류: " + e.getMessage());
        }
    }

    // =========================================================
    // 내부: 캐시 갱신 트리거
    // =========================================================
    private void triggerStopsRefreshAsync(String cityCode, int numOfRows, int maxPages) {
        if (!refreshRunning.compareAndSet(false, true)) return;

        new Thread(() -> {
            try {
                System.out.println("[CACHE] stops refresh start... cityCode=" + cityCode);
                ArrayNode loaded = loadAllStops(cityCode, numOfRows, maxPages);
                if (loaded != null) {
                    stopsCache = loaded;
                    stopsCacheAtMs = System.currentTimeMillis();
                    System.out.println("[CACHE] stops refresh done. size=" + loaded.size());
                }
            } catch (Exception e) {
                System.out.println("[CACHE] stops refresh failed: " + e.getMessage());
            } finally {
                refreshRunning.set(false);
            }
        }, "stops-cache-refresh").start();
    }

    // ✅ 캐시 보장(없으면 로드)
    private ArrayNode ensureStopsCache(String cityCode) throws Exception {
        long now = System.currentTimeMillis();

        if (stopsCache != null) {
            long age = now - stopsCacheAtMs;
            if (age <= CACHE_TTL_MS) return stopsCache;

            triggerStopsRefreshAsync(cityCode, DEFAULT_NUM_OF_ROWS, DEFAULT_MAX_PAGES);
            return stopsCache;
        }

        synchronized (cacheLock) {
            if (stopsCache == null) {
                ArrayNode loaded = loadAllStops(cityCode, DEFAULT_NUM_OF_ROWS, DEFAULT_MAX_PAGES);
                stopsCache = loaded;
                stopsCacheAtMs = System.currentTimeMillis();
                System.out.println("[CACHE] build done size=" + (loaded == null ? 0 : loaded.size()));
            }
        }
        return stopsCache;
    }

    private ArrayNode filterStops(ArrayNode src, String keyword) {
        ArrayNode out = om.createArrayNode();
        if (src == null) return out;

        if (keyword == null || keyword.isBlank()) {
            for (JsonNode n : src) out.add(n);
            return out;
        }

        final String kw = keyword.toLowerCase(Locale.ROOT);
        for (JsonNode n : src) {
            String name = clean(firstText(n, "nodenm", "nodeNm", "name"));
            if (name != null && name.toLowerCase(Locale.ROOT).contains(kw)) {
                out.add(n);
            }
        }
        return out;
    }

    private ArrayNode slicePage(ArrayNode src, int pageNo, int numOfRows) {
        ArrayNode out = om.createArrayNode();
        if (src == null) return out;

        int total = src.size();
        int start = (pageNo - 1) * numOfRows;
        if (start < 0) start = 0;
        if (start >= total) return out;

        int end = Math.min(total, start + numOfRows);
        for (int i = start; i < end; i++) out.add(src.get(i));
        return out;
    }

    private ObjectNode buildTagoLikeStopsResponse(ArrayNode itemArr, int totalCount, int pageNo, int numOfRows) {
        ObjectNode root = om.createObjectNode();
        ObjectNode response = root.putObject("response");
        ObjectNode body = response.putObject("body");
        body.put("totalCount", totalCount);

        ObjectNode items = body.putObject("items");
        items.set("item", itemArr != null ? itemArr : om.createArrayNode());

        body.put("pageNo", pageNo);
        body.put("numOfRows", numOfRows);
        return root;
    }

    private ArrayNode loadAllStops(String cityCode, int numOfRows, int maxPages) throws Exception {
        ArrayNode merged = om.createArrayNode();

        for (int pageNo = 1; pageNo <= maxPages; pageNo++) {
            String body = callStopsPage(cityCode, pageNo, numOfRows);
            JsonNode itemNode = extractStopsItemArray(body);

            int added = 0;
            if (itemNode != null && itemNode.isArray()) {
                for (JsonNode one : itemNode) {
                    merged.add(one);
                    added++;
                }
            } else if (itemNode != null && !itemNode.isMissingNode() && !itemNode.isNull()) {
                merged.add(itemNode);
                added = 1;
            }

            System.out.println("[TAGO 전체정류장] page=" + pageNo + " added=" + added + " total=" + merged.size());

            if (added == 0) break;
            if (added < numOfRows) break;
        }

        return merged;
    }

    private String callStopsPage(String cityCode, int pageNo, int numOfRows) {
        cityCode = clean(cityCode);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        String serviceKey = serviceKeyForUrl(stationServiceKey);
        String encodedCityCode = enc(cityCode);

        String url = String.format(
                "%s/getSttnNoList?serviceKey=%s&cityCode=%s&pageNo=%d&numOfRows=%d&_type=json",
                stationBaseUrl,
                serviceKey,
                encodedCityCode,
                pageNo,
                numOfRows
        );

        System.out.println("[TAGO 전체정류장] URL(page=" + pageNo + ") = " + url);
        return rt.getForObject(url, String.class);
    }

    private String callRoutePathRaw(String cityCode, String routeId, int pageNo, int numOfRows) {
        cityCode = clean(cityCode);
        routeId = clean(routeId);
        if (cityCode == null || cityCode.isBlank()) cityCode = DEFAULT_CITY_CODE;

        String serviceKey = serviceKeyForUrl(routeServiceKey);
        String encodedCityCode = enc(cityCode);
        String encodedRouteId = enc(routeId);

        String url = String.format(
                "%s/getRouteAcctoThrghSttnList?serviceKey=%s&cityCode=%s&routeId=%s&pageNo=%d&numOfRows=%d&_type=json",
                routeBaseUrl,
                serviceKey,
                encodedCityCode,
                encodedRouteId,
                pageNo,
                numOfRows
        );

        System.out.println("[TAGO 노선경로(RAW)] URL = " + url);
        return rt.getForObject(url, String.class);
    }

    private JsonNode extractStopsItemArray(String bodyString) throws Exception {
        if (bodyString == null || bodyString.isBlank()) return null;

        JsonNode root = om.readTree(bodyString);
        JsonNode item = root.path("response").path("body").path("items").path("item");

        if (item.isMissingNode() || item.isNull()) return null;
        return item;
    }

    // ================== util ==================
    private int clamp(int v, int min, int max, int fallback) {
        if (v < min) return fallback;
        if (v > max) return max;
        return v;
    }

    private String clean(String s) {
        if (s == null) return null;
        s = s.trim();
        s = s.replace("\r", "").replace("\n", "").replace("\t", "");
        return s;
    }

    private String enc(String s) {
        s = clean(s);
        if (s == null) return "";
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private String serviceKeyForUrl(String key) {
        key = clean(key);
        if (key == null) return "";
        if (key.contains("%")) return key;
        return URLEncoder.encode(key, StandardCharsets.UTF_8);
    }

    private void debugParam(String name, String value) {
        String v = value;
        if (v == null) {
            System.out.println("[DEBUG] " + name + "=null");
            return;
        }
        System.out.println("[DEBUG] " + name + "='" + v + "' len=" + v.length());
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < v.length(); i++) {
            sb.append(String.format("%02X", (int) v.charAt(i)));
            if (i < v.length() - 1) sb.append(" ");
        }
        System.out.println("[DEBUG] " + name + " HEX=" + sb);
    }

    private String firstText(JsonNode n, String... keys) {
        if (n == null || n.isNull()) return null;
        for (String k : keys) {
            JsonNode v = n.get(k);
            if (v != null && !v.isNull()) {
                String s = v.asText();
                if (s != null && !s.isBlank()) return s;
            }
        }
        return null;
    }

    private Double firstDouble(JsonNode n, String... keys) {
        if (n == null || n.isNull()) return null;
        for (String k : keys) {
            JsonNode v = n.get(k);
            if (v != null && !v.isNull()) {
                try {
                    double d = Double.parseDouble(v.asText());
                    if (Double.isFinite(d)) return d;
                } catch (Exception ignore) {}
            }
        }
        return null;
    }

    private Integer safeInt(String s, Integer fallback) {
        try {
            if (s == null || s.isBlank()) return fallback;
            return Integer.parseInt(s.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private Double haversineMeters(Double lat1, Double lon1, Double lat2, Double lon2) {
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;

        double R = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private StopDto.StopType parseStopType(String type) {
        try {
            if (type == null) return StopDto.StopType.BUS;
            return StopDto.StopType.valueOf(type.trim().toUpperCase());
        } catch (Exception e) {
            return StopDto.StopType.BUS;
        }
    }
}
