package com.example.demo.service;

import java.sql.Timestamp;
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

@Service
public class AutoCollectService {

    private final BusCollectDao busCollectDao;
    private final RestTemplate rest = new RestTemplate();

    // ✅ 서버 포트 맞춰 (나중에 application.yml로 빼는게 베스트)
    private final String BASE = "http://localhost:8091";

    public AutoCollectService(BusCollectDao busCollectDao) {
        this.busCollectDao = busCollectDao;
    }

    /**
     * ✅ 3초마다 JOB 확인 → period_sec에 따라 실행
     *  - enabled=1, route_id='JOB' 행만 대상
     *  - last_run_at 기준으로 period_sec 지나면 collectOnce 실행
     */
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

                if (jobId <= 0) continue;
                if (cityCode <= 0) continue;
                if (isBlank(fromStopId) || isBlank(toStopId)) continue;
                if (isBlank(mode)) mode = "BUS";

                int periodSec = toInt(j.get("period_sec"), 10);
                if (periodSec < 5) periodSec = 10;

                long lastRunMs = 0L;
                Object last = j.get("last_run_at");
                if (last instanceof Timestamp) {
                    lastRunMs = ((Timestamp) last).getTime(); // ✅ 자바11에서도 안전
                } else if (last != null) {
                    // 혹시 String으로 오는 경우 대비
                    // (보통 여기 안 들어오지만 안전하게)
                    // lastRunMs는 그대로 0 유지 (즉 즉시 실행될 수 있음)
                }

                // 아직 주기 안 지났으면 skip
                if (lastRunMs > 0 && (now - lastRunMs) < periodSec * 1000L) continue;

                // ✅ 수집 실행
                collectOnce(cityCode, fromStopId, toStopId, mode);

                // ✅ last_run_at 갱신 (DAO에 반드시 구현되어 있어야 함!)
                busCollectDao.touchLastRunAt(jobId);
            }

        } catch (Exception e) {
            System.out.println("[AutoCollect] tick error: " + e.getMessage());
        }
    }

    /**
     * ✅ 한 번 수집해서 OBS 저장
     * - /api/bus/arrival로 출발/도착 도착정보를 가져오고
     * - 공통 routeId 중 diffSec가 가장 작은 것을 선택해 저장
     */
    private void collectOnce(int cityCode, String fromStopId, String toStopId, String mode) {
        try {
            List<Map<String, Object>> fromArr = fetchArrival(cityCode, fromStopId);
            List<Map<String, Object>> toArr = fetchArrival(cityCode, toStopId);

            if (fromArr.isEmpty() || toArr.isEmpty()) return;

            Map<String, Integer> fromBest = bestEtaByRoute(fromArr);
            Map<String, Integer> toBest = bestEtaByRoute(toArr);

            if (fromBest.isEmpty() || toBest.isEmpty()) return;

            String pickedRouteId = null;
            Integer pickedDiff = null;

            // 공통 route 중 diff 최소인 route 선택
            for (String rid : fromBest.keySet()) {
                Integer a = fromBest.get(rid);
                Integer b = toBest.get(rid);
                if (a == null || b == null) continue;

                int diff = b - a;

                // ✅ 추정/이상값 저장 금지
                if (diff <= 0) continue;

                if (pickedDiff == null || diff < pickedDiff) {
                    pickedDiff = diff;
                    pickedRouteId = rid;
                }
            }

            if (pickedRouteId == null || pickedDiff == null) return;

            String routeNo = pickRouteNo(fromArr, pickedRouteId);

            BusCollectReq obs = new BusCollectReq();
            obs.setCityCode(cityCode);
            obs.setRouteId(pickedRouteId);
            obs.setRouteNo(routeNo);

            obs.setFromStopId(fromStopId);
            obs.setToStopId(toStopId);

            obs.setFromArrSec(fromBest.get(pickedRouteId));
            obs.setToArrSec(toBest.get(pickedRouteId));
            obs.setDiffSec(pickedDiff);

            obs.setMode(mode);

            // OBS는 무조건 enabled=0
            obs.setEnabled(0);

            // OBS에서는 periodSec 굳이 저장할 필요 없음 (DB 디폴트/NULL로 두는게 깔끔)
            obs.setPeriodSec(null);

            busCollectDao.insert(obs);

            System.out.println("[AutoCollect] saved OBS routeId=" + pickedRouteId + " diff=" + pickedDiff);

        } catch (Exception e) {
            System.out.println("[AutoCollect] collectOnce error: " + e.getMessage());
        }
    }

    // ---------------- fetch arrival ----------------

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fetchArrival(int cityCode, String nodeId) {
        String url = BASE + "/api/bus/arrival?cityCode=" + cityCode + "&nodeId=" + nodeId;

        Object res;
        try {
            res = rest.getForObject(url, Object.class);
        } catch (Exception e) {
            System.out.println("[AutoCollect] fetchArrival fail: " + e.getMessage());
            return Collections.emptyList();
        }

        if (res instanceof List<?>) {
            return ((List<?>) res).stream()
                    .filter(x -> x instanceof Map)
                    .map(x -> (Map<String, Object>) x)
                    .collect(Collectors.toList());
        }

        return Collections.emptyList();
    }

    // 출발/도착 도착정보 리스트에서 routeId별 가장 빠른 ETA(초)만 뽑기
    private Map<String, Integer> bestEtaByRoute(List<Map<String, Object>> arr) {
        Map<String, Integer> m = new HashMap<>();
        for (Map<String, Object> x : arr) {
            if (x == null) continue;

            String rid = pickStr(x, "routeid", "routeId", "busRouteId");
            Integer sec = pickInt(x, "arrtime", "arrTime", "arrsec", "arrSec", "arrmsgSec");

            if (isBlank(rid) || sec == null || sec <= 0) continue;

            Integer prev = m.get(rid);
            if (prev == null || sec < prev) m.put(rid, sec);
        }
        return m;
    }

    private String pickRouteNo(List<Map<String, Object>> arr, String rid) {
        if (isBlank(rid)) return null;

        for (Map<String, Object> x : arr) {
            if (x == null) continue;
            String r = pickStr(x, "routeid", "routeId", "busRouteId");
            if (rid.equals(r)) return pickStr(x, "routeno", "routeNo", "route_no");
        }
        return null;
    }

    // ---------------- util ----------------

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
            try {
                return Integer.parseInt(String.valueOf(v).trim());
            } catch (Exception ignore) {}
        }
        return null;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String toStr(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static int toInt(Object v, int def) {
        if (v == null) return def;
        if (v instanceof Number) return ((Number) v).intValue();
        try { return Integer.parseInt(String.valueOf(v).trim()); }
        catch (Exception e) { return def; }
    }

    private static long toLong(Object v, long def) {
        if (v == null) return def;
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); }
        catch (Exception e) { return def; }
    }
}
