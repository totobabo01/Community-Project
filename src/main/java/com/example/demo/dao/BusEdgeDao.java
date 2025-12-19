package com.example.demo.dao;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

@Repository
public class BusEdgeDao {

    @Value("${spring.datasource.url}")
    private String url;

    @Value("${spring.datasource.username}")
    private String username;

    @Value("${spring.datasource.password}")
    private String password;

    // ✅ edge upsert
    public void upsertEdge(
            String cityCode,
            String routeId,
            String fromStopId,
            String toStopId,
            Double fromLat,
            Double fromLon,
            Double toLat,
            Double toLon,
            Integer seqFrom,
            Integer seqTo,
            Double distM
    ) throws Exception {

        String sql =
            "INSERT INTO bus_edges (" +
            " city_code, route_id, from_stop_id, to_stop_id," +
            " from_lat, from_lon, to_lat, to_lon," +
            " seq_from, seq_to, dist_m" +
            ") VALUES (?,?,?,?,?,?,?,?,?,?,?) " +
            "ON DUPLICATE KEY UPDATE " +
            " from_lat=VALUES(from_lat), from_lon=VALUES(from_lon)," +
            " to_lat=VALUES(to_lat), to_lon=VALUES(to_lon)," +
            " seq_from=VALUES(seq_from), seq_to=VALUES(seq_to)," +
            " dist_m=VALUES(dist_m), updated_at=CURRENT_TIMESTAMP";

        try (Connection conn = DriverManager.getConnection(url, username, password);
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, cityCode);
            ps.setString(2, routeId);
            ps.setString(3, fromStopId);
            ps.setString(4, toStopId);

            if (fromLat == null) ps.setNull(5, java.sql.Types.DOUBLE); else ps.setDouble(5, fromLat);
            if (fromLon == null) ps.setNull(6, java.sql.Types.DOUBLE); else ps.setDouble(6, fromLon);
            if (toLat == null) ps.setNull(7, java.sql.Types.DOUBLE); else ps.setDouble(7, toLat);
            if (toLon == null) ps.setNull(8, java.sql.Types.DOUBLE); else ps.setDouble(8, toLon);

            if (seqFrom == null) ps.setNull(9, java.sql.Types.INTEGER); else ps.setInt(9, seqFrom);
            if (seqTo == null) ps.setNull(10, java.sql.Types.INTEGER); else ps.setInt(10, seqTo);

            if (distM == null) ps.setNull(11, java.sql.Types.DOUBLE); else ps.setDouble(11, distM);

            ps.executeUpdate();
        }
    }
}
