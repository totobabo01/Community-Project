package com.example.demo.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.example.demo.dto.BusCollectReq;

@Repository
public class BusCollectDao {

    private final DataSource dataSource;

    public BusCollectDao(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    // ✅ OBS 저장 (관측치 로그)
    public long insert(BusCollectReq req) throws Exception {
        if (req == null) throw new IllegalArgumentException("body is null");
        if (req.getCityCode() == null) throw new IllegalArgumentException("cityCode is required");
        if (isBlank(req.getRouteId())) throw new IllegalArgumentException("routeId is required");
        if (isBlank(req.getFromStopId())) throw new IllegalArgumentException("fromStopId is required");
        if (isBlank(req.getToStopId())) throw new IllegalArgumentException("toStopId is required");
        if (req.getDiffSec() == null) throw new IllegalArgumentException("diffSec is required");

        // 🔒 2중 방어: JOB는 insert로 못 넣게
        if ("JOB".equalsIgnoreCase(req.getRouteId().trim())) {
            throw new IllegalArgumentException("routeId=JOB 는 insert 대상이 아닙니다. /upsertJob을 사용하세요.");
        }

        if (isBlank(req.getMode())) req.setMode("OBS");

        // ✅✅ period_sec 는 NOT NULL 이므로, OBS insert에서는 아예 컬럼에서 빼서 DEFAULT(10) 사용
        String sql = """
            INSERT INTO bus_collect
            (city_code, route_id, route_no,
             from_stop_id, to_stop_id, from_stop_name, to_stop_name,
             from_arr_sec, to_arr_sec, diff_sec, mode,
             enabled, last_run_at)
            VALUES
            (?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?)
        """;

        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            ps.setInt(1, req.getCityCode());
            ps.setString(2, req.getRouteId());
            ps.setString(3, req.getRouteNo());

            ps.setString(4, req.getFromStopId());
            ps.setString(5, req.getToStopId());
            ps.setString(6, req.getFromStopName());
            ps.setString(7, req.getToStopName());

            if (req.getFromArrSec() == null) ps.setNull(8, Types.INTEGER);
            else ps.setInt(8, req.getFromArrSec());

            if (req.getToArrSec() == null) ps.setNull(9, Types.INTEGER);
            else ps.setInt(9, req.getToArrSec());

            // diffSec는 0도 허용(공통노선 없는 케이스 기록용)
            ps.setInt(10, req.getDiffSec());
            ps.setString(11, req.getMode());

            // OBS는 기본 enabled=0
            int enabled = (req.getEnabled() == null ? 0 : req.getEnabled());
            ps.setInt(12, enabled);

            // OBS는 last_run_at NULL
            ps.setNull(13, Types.TIMESTAMP);

            ps.executeUpdate();

            try (ResultSet rs = ps.getGeneratedKeys()) {
                if (rs.next()) return rs.getLong(1);
            }
            return -1;
        }
    }

    // ✅ JOB 등록/갱신 (enabled=1, route_id='JOB')
    public long upsertJob(BusCollectReq req) throws Exception {
        if (req == null) throw new IllegalArgumentException("body is null");
        if (req.getCityCode() == null) throw new IllegalArgumentException("cityCode is required");
        if (isBlank(req.getFromStopId())) throw new IllegalArgumentException("fromStopId is required");
        if (isBlank(req.getToStopId())) throw new IllegalArgumentException("toStopId is required");

        if (isBlank(req.getMode())) req.setMode("BUS");

        int periodSec = (req.getPeriodSec() == null || req.getPeriodSec() < 5) ? 10 : req.getPeriodSec();

        try (Connection con = dataSource.getConnection()) {

            Long existId = null;

            String findSql = """
                SELECT id
                FROM bus_collect
                WHERE city_code=?
                  AND route_id='JOB'
                  AND from_stop_id=?
                  AND to_stop_id=?
                  AND mode=?
                ORDER BY id DESC
                LIMIT 1
            """;
            try (PreparedStatement ps = con.prepareStatement(findSql)) {
                ps.setInt(1, req.getCityCode());
                ps.setString(2, req.getFromStopId());
                ps.setString(3, req.getToStopId());
                ps.setString(4, req.getMode());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) existId = rs.getLong(1);
                }
            }

            if (existId != null) {
                String updSql = """
                    UPDATE bus_collect
                    SET enabled=1,
                        period_sec=?,
                        from_stop_name=COALESCE(?, from_stop_name),
                        to_stop_name=COALESCE(?, to_stop_name)
                    WHERE id=?
                """;
                try (PreparedStatement ps = con.prepareStatement(updSql)) {
                    ps.setInt(1, periodSec);
                    ps.setString(2, req.getFromStopName());
                    ps.setString(3, req.getToStopName());
                    ps.setLong(4, existId);
                    ps.executeUpdate();
                }
                return existId;
            }

            String insSql = """
                INSERT INTO bus_collect
                (city_code, route_id, route_no,
                 from_stop_id, to_stop_id, from_stop_name, to_stop_name,
                 from_arr_sec, to_arr_sec, diff_sec, mode,
                 enabled, period_sec, last_run_at)
                VALUES
                (?, 'JOB', NULL,
                 ?, ?, ?, ?,
                 NULL, NULL, 0, ?,
                 1, ?, NULL)
            """;
            try (PreparedStatement ps = con.prepareStatement(insSql, Statement.RETURN_GENERATED_KEYS)) {
                ps.setInt(1, req.getCityCode());
                ps.setString(2, req.getFromStopId());
                ps.setString(3, req.getToStopId());
                ps.setString(4, req.getFromStopName());
                ps.setString(5, req.getToStopName());
                ps.setString(6, req.getMode());
                ps.setInt(7, periodSec);

                ps.executeUpdate();

                try (ResultSet rs = ps.getGeneratedKeys()) {
                    if (rs.next()) return rs.getLong(1);
                }
                return -1;
            }
        }
    }

    public int disableJob(int cityCode, String fromStopId, String toStopId, String mode) throws Exception {
        if (isBlank(fromStopId)) throw new IllegalArgumentException("fromStopId is required");
        if (isBlank(toStopId)) throw new IllegalArgumentException("toStopId is required");
        if (isBlank(mode)) mode = "BUS";

        String sql = """
            UPDATE bus_collect
            SET enabled=0
            WHERE city_code=?
              AND route_id='JOB'
              AND from_stop_id=?
              AND to_stop_id=?
              AND mode=?
        """;

        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setInt(1, cityCode);
            ps.setString(2, fromStopId);
            ps.setString(3, toStopId);
            ps.setString(4, mode);
            return ps.executeUpdate();
        }
    }

    public List<Map<String, Object>> listJobs(Integer enabled) throws Exception {
        String base = """
            SELECT id, city_code, from_stop_id, to_stop_id,
                   from_stop_name, to_stop_name,
                   mode, enabled, period_sec, last_run_at, collected_at
            FROM bus_collect
            WHERE route_id='JOB'
        """;

        String sql = (enabled == null)
                ? base + " ORDER BY id DESC"
                : base + " AND enabled=? ORDER BY id DESC";

        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {

            if (enabled != null) ps.setInt(1, enabled);

            try (ResultSet rs = ps.executeQuery()) {
                return toList(rs);
            }
        }
    }

    public int touchLastRunAt(long jobId) throws Exception {
        String sql = "UPDATE bus_collect SET last_run_at = NOW() WHERE id = ?";
        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setLong(1, jobId);
            return ps.executeUpdate();
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private List<Map<String, Object>> toList(ResultSet rs) throws Exception {
        List<Map<String, Object>> out = new ArrayList<>();
        ResultSetMetaData md = rs.getMetaData();
        int n = md.getColumnCount();

        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= n; i++) {
                row.put(md.getColumnLabel(i), rs.getObject(i));
            }
            out.add(row);
        }
        return out;
    }
}
