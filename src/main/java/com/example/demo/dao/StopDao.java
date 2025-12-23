package com.example.demo.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.example.demo.dto.StopDto;

@Repository
public class StopDao {

    private final DataSource ds;

    public StopDao(DataSource ds) {
        this.ds = ds;
    }

    // ✅ UNIQUE(city_code, stop_id) 기준 UPSERT
    public int upsert(StopDto s) {
        final String sql =
            "INSERT INTO stops (stop_id, name, lat, lon, type, city_code) " +
            "VALUES (?, ?, ?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE " +
            "name = VALUES(name), " +
            "lat  = VALUES(lat), " +
            "lon  = VALUES(lon), " +
            "type = VALUES(type), " +
            "updated_at = CURRENT_TIMESTAMP";

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString(1, s.getStopId());
            ps.setString(2, s.getName());
            ps.setDouble(3, s.getLat());
            ps.setDouble(4, s.getLon());
            ps.setString(5, s.getType().name());
            ps.setString(6, s.getCityCode());

            return ps.executeUpdate();

        } catch (Exception e) {
            throw new RuntimeException("StopDao.upsert 실패: " + e.getMessage(), e);
        }
    }

    // ✅ stopId로 1건 조회 (최단경로 polyline 만들 때 필요)
    public StopDto findById(String cityCode, String stopId) {
        final String sql =
            "SELECT stop_id, name, lat, lon, type, city_code " +
            "FROM stops WHERE city_code=? AND stop_id=? LIMIT 1";

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            ps.setString(1, cityCode);
            ps.setString(2, stopId);

            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return null;
                return map(rs);
            }

        } catch (Exception e) {
            throw new RuntimeException("StopDao.findById 실패: " + e.getMessage(), e);
        }
    }

    // ✅ 이름 검색(자동완성)
    public List<StopDto> findByName(String cityCode, String keyword, String type, int limit) {
        keyword = (keyword == null) ? "" : keyword.trim();
        type = (type == null || type.isBlank()) ? null : type.trim().toUpperCase();
        limit = (limit <= 0) ? 20 : Math.min(limit, 200);

        String sql =
            "SELECT stop_id, name, lat, lon, type, city_code " +
            "FROM stops " +
            "WHERE city_code=? AND name LIKE ? " +
            (type != null ? "AND type=? " : "") +
            "ORDER BY name ASC " +
            "LIMIT ?";

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            int idx = 1;
            ps.setString(idx++, cityCode);
            ps.setString(idx++, "%" + keyword + "%");
            if (type != null) ps.setString(idx++, type);
            ps.setInt(idx++, limit);

            List<StopDto> out = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
            return out;

        } catch (Exception e) {
            throw new RuntimeException("StopDao.findByName 실패: " + e.getMessage(), e);
        }
    }

    // ✅✅ [추가] 전체 정류장 조회 (검색어 없이 '검색' 눌렀을 때 후보 목록용)
    // - type이 있으면 type으로 필터링 가능(BUS/TRAM 등)
    // - limit 기본 500, 최대 5000 정도로 제한 권장
    public List<StopDto> findAll(String cityCode, String type, int limit) {
        type = (type == null || type.isBlank()) ? null : type.trim().toUpperCase();
        limit = (limit <= 0) ? 500 : Math.min(limit, 5000);

        String sql =
            "SELECT stop_id, name, lat, lon, type, city_code " +
            "FROM stops " +
            "WHERE city_code=? " +
            (type != null ? "AND type=? " : "") +
            "ORDER BY name ASC " +
            "LIMIT ?";

        try (Connection c = ds.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {

            int idx = 1;
            ps.setString(idx++, cityCode);
            if (type != null) ps.setString(idx++, type);
            ps.setInt(idx++, limit);

            List<StopDto> out = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.add(map(rs));
            }
            return out;

        } catch (Exception e) {
            throw new RuntimeException("StopDao.findAll 실패: " + e.getMessage(), e);
        }
    }

    private StopDto map(ResultSet rs) throws Exception {
        String stopId = rs.getString("stop_id");
        String name = rs.getString("name");
        double lat = rs.getDouble("lat");
        double lon = rs.getDouble("lon");
        String typeStr = rs.getString("type");
        String cityCode = rs.getString("city_code");

        StopDto.StopType type = StopDto.StopType.valueOf(typeStr.toUpperCase());
        return new StopDto(stopId, name, lat, lon, type, cityCode);
    }
}
