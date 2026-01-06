package com.example.demo.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.example.demo.dao.BusCollectDao;
import com.example.demo.dto.BusCollectReq;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class AutoCollectService {

    private final BusCollectDao busCollectDao;
    private final RestTemplate rest = new RestTemplate();
    private final ObjectMapper om = new ObjectMapper();

    private final String BASE = "http://127.0.0.1:8091";

    public AutoCollectService(BusCollectDao busCollectDao) {
        this.busCollectDao = busCollectDao;
    }

    @Scheduled(fixedDelay = 3000)
    public void tick() {
        try {
            List<Map<String, Object>> jobs = busCollectDao.listJobs(1);
            if (jobs == null || jobs.isEmpty()) return;

            long now = System.currentTimeMillis();

            for (Map<String, Object> j : jobs) {
                if (j == null) continue;

                long jobId = toLong(j.get("id"), -1L);
                int cityCode = toInt(j.get("city_code"), 0);
                String fromStopId = toStr(j.get("from_stop_id"));
                String toStopId = toStr(j.get("to_stop_id"));
                String mode = toStr(j.get("mode"));
                if (isBlank(mode)) mode = "BUS";

                if (jobId <= 0 || cityCode <= 0 || isBlank(fromStopId) || isBlank(toStopId)) continue;

                int periodSec = toInt(j.get("period_sec"), 10);
                if (periodSec < 5) periodSec = 10;

                long lastRunMs = 0L;
                Object last = j.get("last_run_at");
                if (last instanceof Timestamp) lastRunMs = ((Timestamp) last).getTime();

                if (lastRunMs > 0 && (now - lastRunMs) < periodSec * 1000L) continue;

                // ✅ 이제는 "성공/실패"와 무관하게 로그는 쌓는다
                collectOnce(jobId, cityCode, fromStopId, toStopId, mode);

                // ✅ tick 주기 제어는 job 기준으로 계속 갱신
                busCollectDao.touchLastRunAt(jobId);
            }

        } catch (Exception e) {
            System.out.println("[AutoCollect] tick error: " + e.getMessage());
        }
    }

    /**
     * ✅ 공통 노선 없어도 LOG 저장
     */
    private void collectOnce(long jobId, int cityCode, String fromStopId, String toStopId, String mode) {
        try {
            List<Map<String, Object>> fromArr = fetchArrival(cityCode, fromStopId);
            List<Map<String, Object>> toArr   = fetchArrival(cityCode, toStopId);

            System.out.println("[AutoCollect] jobId=" + jobId + " fromArr=" + fromArr.size() + " toArr=" + toArr.size());

            // 1) 둘 중 하나라도 비면 → NO_DATA 로그 저장
            if (fromArr.isEmpty() || toArr.isEmpty()) {
                insertLog(cityCode, fromStopId, toStopId, "NO_DATA", null,
                        bestAnyEta(fromArr), bestAnyEta(toArr), 0,
                        "LOG_NO_DATA");
                return;
            }

            Map<String, Integer> fromBest = bestEtaByRoute(fromArr);
            Map<String, Integer> toBest   = bestEtaByRoute(toArr);

            System.out.println("[AutoCollect] routes fromBest=" + fromBest.size() + " toBest=" + toBest.size());

            // 2) routeId별 ETA 추출이 안 되면 → PARSE_FAIL 로그
            if (fromBest.isEmpty() || toBest.isEmpty()) {
                insertLog(cityCode, fromStopId, toStopId, "PARSE_FAIL", null,
                        bestAnyEta(fromArr), bestAnyEta(toArr), 0,
                        "LOG_PARSE_FAIL");
                return;
            }

            // 3) 공통 노선 찾기 (diff>0 최소)
            String pickedRouteId = null;
            Integer pickedDiff = null;

            for (String rid : fromBest.keySet()) {
                Integer a = fromBest.get(rid);
                Integer b = toBest.get(rid);
                if (a == null || b == null) continue;

                int diff = b - a;
                if (diff <= 0) continue;

                if (pickedDiff == null || diff < pickedDiff) {
                    pickedDiff = diff;
                    pickedRouteId = rid;
                }
            }

            // 4) 공통 노선이 있으면 정상 OBS 저장
            if (pickedRouteId != null && pickedDiff != null) {
                String routeNo = pickRouteNo(fromArr, pickedRouteId);
                insertLog(cityCode, fromStopId, toStopId, pickedRouteId, routeNo,
                        fromBest.get(pickedRouteId), toBest.get(pickedRouteId), pickedDiff,
                        mode);
                System.out.println("[AutoCollect] ✅ saved OBS routeId=" + pickedRouteId + " diff=" + pickedDiff);
                return;
            }

            // 5) 공통 노선이 없으면 → NO_COMMON 로그 저장 (diff=0)
            insertLog(cityCode, fromStopId, toStopId, "NO_COMMON", null,
                    bestAnyEta(fromArr), bestAnyEta(toArr), 0,
                    "LOG_NO_COMMON");

            System.out.println("[AutoCollect] no common route -> LOG saved");

        } catch (Exception e) {
            System.out.println("[AutoCollect] collectOnce error: " + e.getMessage());
            // 예외도 로그로 남기고 싶으면 여기서 insertLog(...) 추가 가능
        }
    }

    private void insertLog(int cityCode,
                           String fromStopId, String toStopId,
                           String routeId, String routeNo,
                           Integer fromArrSec, Integer toArrSec,
                           int diffSec,
                           String mode) throws Exception {

        BusCollectReq obs = new BusCollectReq();
        obs.setCityCode(cityCode);
        obs.setRouteId(routeId);      // ✅ NOT NULL 만족
        obs.setRouteNo(routeNo);

        obs.setFromStopId(fromStopId);
        obs.setToStopId(toStopId);

        obs.setFromArrSec(fromArrSec);
        obs.setToArrSec(toArrSec);

        obs.setDiffSec(diffSec);      // ✅ NOT NULL 만족 (0 허용)
        obs.setMode(mode);

        obs.setEnabled(0);
        obs.setPeriodSec(null);       // ✅ DAO에서 period_sec 컬럼을 INSERT에서 제외했으므로 OK
        busCollectDao.insert(obs);
    }

    // ---------------- fetch arrival ----------------

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchArrival(int cityCode, String nodeId) {
        String url = BASE + "/api/bus/arrival?cityCode=" + cityCode + "&nodeId=" + nodeId;

        String raw;
        try {
            raw = rest.getForObject(url, String.class);
        } catch (Exception e) {
            System.out.println("[AutoCollect] fetchArrival fail: " + e.getMessage());
            return Collections.emptyList();
        }

        if (raw == null || raw.trim().isEmpty()) return Collections.emptyList();

        try {
            Object res = om.readValue(raw, Object.class);

            if (res instanceof List<?>) {
                return ((List<?>) res).stream()
                        .filter(x -> x instanceof Map)
                        .map(x -> (Map<String, Object>) x)
                        .collect(Collectors.toList());
            }

            if (res instanceof Map<?, ?>) {
                Object item = digItem((Map<String, Object>) res);
                if (item instanceof List<?>) {
                    List<?> li = (List<?>) item;
                    return li.stream()
                            .filter(x -> x instanceof Map)
                            .map(x -> (Map<String, Object>) x)
                            .collect(Collectors.toList());
                }
                if (item instanceof Map<?, ?>) {
                    List<Map<String, Object>> one = new ArrayList<>();
                    one.add((Map<String, Object>) item);
                    return one;
                }
            }

        } catch (Exception e) {
            System.out.println("[AutoCollect] parseArrival fail: " + e.getMessage());
        }

        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private Object digItem(Map<String, Object> root) {
        if (root == null) return null;

        Object response = root.get("response");
        if (response instanceof Map<?, ?>) {
            Object body = ((Map<String, Object>) response).get("body");
            if (body instanceof Map<?, ?>) {
                Object items = ((Map<String, Object>) body).get("items");
                if (items instanceof Map<?, ?>) {
                    Object item = ((Map<String, Object>) items).get("item");
                    if (item != null) return item;
                }
            }
        }

        Object items2 = root.get("items");
        if (items2 instanceof Map<?, ?>) {
            Object item = ((Map<String, Object>) items2).get("item");
            if (item != null) return item;
        }

        return root.get("item");
    }

    // ---------------- compute ----------------

    private Map<String, Integer> bestEtaByRoute(List<Map<String, Object>> arr) {
        Map<String, Integer> m = new HashMap<>();
        for (Map<String, Object> x : arr) {
            if (x == null) continue;

            String rid = pickStr(x, "routeid", "routeId", "busRouteId", "route_id");
            Integer sec = pickInt(x, "arrtime", "arrTime", "remaintime", "remainTime", "arrivalSec", "arrsec", "arrSec");

            if (isBlank(rid) || sec == null || sec <= 0) continue;

            Integer prev = m.get(rid);
            if (prev == null || sec < prev) m.put(rid, sec);
        }
        return m;
    }

    // 리스트 전체에서 "가장 빠른 도착" 하나만(로그용)
    private Integer bestAnyEta(List<Map<String, Object>> arr) {
        if (arr == null || arr.isEmpty()) return null;
        Integer best = null;
        for (Map<String, Object> x : arr) {
            if (x == null) continue;
            Integer sec = pickInt(x, "arrtime", "arrTime", "remaintime", "remainTime", "arrivalSec", "arrsec", "arrSec");
            if (sec == null || sec <= 0) continue;
            if (best == null || sec < best) best = sec;
        }
        return best;
    }

    private String pickRouteNo(List<Map<String, Object>> arr, String rid) {
        if (isBlank(rid)) return null;
        for (Map<String, Object> x : arr) {
            if (x == null) continue;
            String r = pickStr(x, "routeid", "routeId", "busRouteId", "route_id");
            if (rid.equals(r)) return pickStr(x, "routeno", "routeNo", "route_no", "routeNm", "routenm");
        }
        return null;
    }

    private String pickStr(Map<String, Object> x, String... keys) {
        for (String k : keys) {
            Object v = x.get(k);
            if (v != null) {
                String s = String.valueOf(v).trim();
                if (!s.isEmpty()) return s;
            }
        }
        return null;
    }

    private Integer pickInt(Map<String, Object> x, String... keys) {
        for (String k : keys) {
            Object v = x.get(k);
            if (v == null) continue;
            try { return Integer.parseInt(String.valueOf(v).trim()); }
            catch (Exception ignore) {}
        }
        return null;
    }

    private static boolean isBlank(String s) { return s == null || s.trim().isEmpty(); }
    private static String toStr(Object v) { return v == null ? null : String.valueOf(v).trim(); }
    private static int toInt(Object v, int def) {
        if (v == null) return def;
        if (v instanceof Number) return ((Number) v).intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); } catch (Exception e) { return def; }
    }
    private static long toLong(Object v, long def) {
        if (v == null) return def;
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return def; }
    }
}
