package com.example.demo.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;

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
            if (s.getLat() == null) ps.setNull(3, java.sql.Types.DOUBLE);
            else ps.setDouble(3, s.getLat());

            if (s.getLon() == null) ps.setNull(4, java.sql.Types.DOUBLE);
            else ps.setDouble(4, s.getLon());

            ps.setString(5, s.getType());
            ps.setString(6, s.getCityCode());

            return ps.executeUpdate(); // insert=1, update=2(환경에 따라 다를 수 있음)
        } catch (Exception e) {
            throw new RuntimeException("StopDao.upsert 실패: " + e.getMessage(), e);
        }
    }
}
