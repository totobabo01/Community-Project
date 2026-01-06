package com.example.demo.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.BusCollectDao;
import com.example.demo.dto.BusCollectReq;

@RestController
@RequestMapping("/api/buscollect")
public class BusCollectController {

    private final BusCollectDao busCollectDao;

    public BusCollectController(BusCollectDao busCollectDao) {
        this.busCollectDao = busCollectDao;
    }

    /**
     * ✅ OBS/LOG 저장
     * - OBS(진짜 관측치): mode=ARRIVAL_TO_EDGE 같은 케이스 -> diffSec > 0 필수
     * - LOG(공통노선 없음 등): mode=API_NO_COMMON_SAVE_BOTH_STOPS -> diffSec=0도 허용
     *
     * - routeId="JOB" 는 여기서 금지 (JOB 등록은 /register 사용)
     */
    @PostMapping("/save")
    public ResponseEntity<?> save(@RequestBody BusCollectReq req) {
        try {
            if ("JOB".equalsIgnoreCase(s(req.getRouteId()))) {
                throw new IllegalArgumentException("JOB 등록은 /api/buscollect/register 로 하세요.");
            }

            // 필수값 최소 체크 (LOG도 저장하려면 diffSec 강제하면 안 됨)
            if (req.getCityCode() == null) throw new IllegalArgumentException("cityCode가 필요합니다.");
            if (isBlank(req.getRouteId())) throw new IllegalArgumentException("routeId가 필요합니다.");
            if (isBlank(req.getFromStopId())) throw new IllegalArgumentException("fromStopId가 필요합니다.");
            if (isBlank(req.getToStopId())) throw new IllegalArgumentException("toStopId가 필요합니다.");
            if (isBlank(req.getMode())) req.setMode("LOG");

            // ✅ OBS 판별: 너가 “진짜 이동 소요시간 관측치”로 쓰는 모드만 강제
            boolean isObsMode =
                    "ARRIVAL_TO_EDGE".equalsIgnoreCase(s(req.getMode()))
                 || "API_COMMON_ROUTE".equalsIgnoreCase(s(req.getMode()));

            if (isObsMode) {
                // OBS는 반드시 의미있는 diffSec
                if (req.getDiffSec() == null || req.getDiffSec() <= 0) {
                    throw new IllegalArgumentException("OBS 모드는 diffSec(소요시간 초)가 1 이상이어야 합니다.");
                }
            } else {
                // LOG는 diffSec가 없거나 0이어도 저장되게
                if (req.getDiffSec() == null || req.getDiffSec() < 0) req.setDiffSec(0);
            }

            // LOG/OBS 둘 다 enabled=0 고정(로그성 데이터)
            req.setEnabled(0);

            // LOG/OBS는 period/last_run은 의미 없음 -> periodSec는 NULL로 저장(깔끔)
            req.setPeriodSec(null);

            long id = busCollectDao.insert(req);

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("id", id);
            out.put("mode", req.getMode());
            out.put("diffSec", req.getDiffSec());
            out.put("message", isObsMode ? "OBS 저장 완료" : "LOG 저장 완료");
            return ResponseEntity.ok(out);

        } catch (IllegalArgumentException iae) {
            return bad(iae.getMessage());
        } catch (Exception e) {
            return err("DB insert failed", e);
        }
    }

    /**
     * ✅ 자동수집 JOB 등록/갱신
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody BusCollectReq req) {
        try {
            if (req.getCityCode() == null) throw new IllegalArgumentException("cityCode가 필요합니다.");
            if (isBlank(req.getFromStopId())) throw new IllegalArgumentException("fromStopId가 필요합니다.");
            if (isBlank(req.getToStopId())) throw new IllegalArgumentException("toStopId가 필요합니다.");

            if (isBlank(req.getMode())) req.setMode("BUS");

            // JOB 설정 강제
            req.setRouteId("JOB");
            req.setRouteNo(null);
            req.setDiffSec(0);
            req.setFromArrSec(null);
            req.setToArrSec(null);

            req.setEnabled(1);

            if (req.getPeriodSec() == null || req.getPeriodSec() < 5) req.setPeriodSec(10);

            long id = busCollectDao.upsertJob(req);

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("id", id);
            out.put("enabled", 1);
            out.put("periodSec", req.getPeriodSec());
            out.put("message", "자동수집 JOB 등록/갱신 완료");
            return ResponseEntity.ok(out);

        } catch (IllegalArgumentException iae) {
            return bad(iae.getMessage());
        } catch (Exception e) {
            return err("JOB register failed", e);
        }
    }

    @PostMapping("/disable")
    public ResponseEntity<?> disable(@RequestBody BusCollectReq req) {
        try {
            if (req.getCityCode() == null) throw new IllegalArgumentException("cityCode가 필요합니다.");
            if (isBlank(req.getFromStopId())) throw new IllegalArgumentException("fromStopId가 필요합니다.");
            if (isBlank(req.getToStopId())) throw new IllegalArgumentException("toStopId가 필요합니다.");
            if (isBlank(req.getMode())) req.setMode("BUS");

            int updated = busCollectDao.disableJob(
                    req.getCityCode(),
                    req.getFromStopId(),
                    req.getToStopId(),
                    req.getMode()
            );

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("updated", updated);
            out.put("message", "자동수집 JOB 해제 완료");
            return ResponseEntity.ok(out);

        } catch (IllegalArgumentException iae) {
            return bad(iae.getMessage());
        } catch (Exception e) {
            return err("JOB disable failed", e);
        }
    }

    @GetMapping("/jobs")
    public ResponseEntity<?> jobs(@RequestParam(name = "enabled", required = false) Integer enabled) {
        try {
            List<Map<String, Object>> list = busCollectDao.listJobs(enabled);

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("count", list.size());
            out.put("items", list);
            return ResponseEntity.ok(out);

        } catch (Exception e) {
            return err("JOB list failed", e);
        }
    }

    private ResponseEntity<Map<String, Object>> bad(String msg) {
        Map<String, Object> out = new HashMap<>();
        out.put("ok", false);
        out.put("message", msg);
        return ResponseEntity.badRequest().body(out);
    }

    private ResponseEntity<Map<String, Object>> err(String msg, Exception e) {
        Map<String, Object> out = new HashMap<>();
        out.put("ok", false);
        out.put("message", msg);
        out.put("detail", e.getMessage());
        return ResponseEntity.internalServerError().body(out);
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String s(String v) {
        return v == null ? "" : v.trim();
    }
}
