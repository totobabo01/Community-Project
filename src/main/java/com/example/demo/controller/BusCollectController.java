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
     * ✅ OBS(관측치) 저장
     * - 실제 수집 결과(소요시간 diffSec가 존재하는 데이터)를 bus_collect에 저장
     * - routeId="JOB" 는 여기서 금지 (JOB 등록은 /register 사용)
     */
    @PostMapping("/save")
    public ResponseEntity<?> save(@RequestBody BusCollectReq req) {
        try {
            // 🔒 방어: JOB는 save로 넣지 말고 register로 넣게 강제
            if ("JOB".equalsIgnoreCase(s(req.getRouteId()))) {
                throw new IllegalArgumentException("JOB 등록은 /api/buscollect/register 로 하세요.");
            }

            // diff_sec는 반드시 1 이상 (0이면 관측치 의미가 없음)
            if (req.getDiffSec() == null || req.getDiffSec() <= 0) {
                throw new IllegalArgumentException("diffSec(소요시간 초)는 1 이상이어야 합니다.");
            }

            // OBS는 enabled=0 고정(로그성 데이터)
            req.setEnabled(0);

            // OBS에서는 period/last_run은 의미 없음 -> 무시(DAO가 last_run_at NULL 저장)
            if (req.getPeriodSec() != null) req.setPeriodSec(null);

            long id = busCollectDao.insert(req);

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("id", id);
            out.put("message", "OBS 저장 완료");
            return ResponseEntity.ok(out);

        } catch (IllegalArgumentException iae) {
            return bad(iae.getMessage());
        } catch (Exception e) {
            return err("DB insert failed", e);
        }
    }

    /**
     * ✅ 자동수집 JOB 등록/갱신
     * - 규칙:
     *   route_id = "JOB"
     *   enabled  = 1
     *   period_sec 설정
     *   diff_sec = 0 (JOB는 관측치가 아님)
     *
     * 서버가 켜져있을 때 스케줄러는:
     * enabled=1 AND route_id='JOB' 만 읽어서 자동 수집함.
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody BusCollectReq req) {
        try {
            // 필수값 체크
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

            // 자동수집 ON
            req.setEnabled(1);

            // 주기 기본값 (최소 5초)
            if (req.getPeriodSec() == null || req.getPeriodSec() < 5) req.setPeriodSec(10);

            // ✅ upsert (없으면 INSERT, 있으면 UPDATE)
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

    /**
     * ✅ 자동수집 JOB 해제 (enabled=0)
     */
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

    /**
     * ✅ 등록된 자동수집 JOB 목록 조회 (확인/디버깅용)
     * - enabled 파라미터 없으면 전체
     * - enabled=1 이면 ON만, enabled=0 이면 OFF만
     */
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

    // ----------------- response helper -----------------
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

    // ----------------- util -----------------
    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String s(String v) {
        return v == null ? "" : v.trim();
    }
}
