package com.example.demo.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

import com.example.demo.dto.BusCollectReq;

@Repository
public class BusCollectDao {

    private final DataSource dataSource;

    public BusCollectDao(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public long insert(BusCollectReq req) throws Exception {
        if (req == null) throw new IllegalArgumentException("body is null");
        if (req.cityCode == null) throw new IllegalArgumentException("cityCode is required");
        if (req.routeId == null || req.routeId.isBlank()) throw new IllegalArgumentException("routeId is required");
        if (req.fromStopId == null || req.fromStopId.isBlank()) throw new IllegalArgumentException("fromStopId is required");
        if (req.toStopId == null || req.toStopId.isBlank()) throw new IllegalArgumentException("toStopId is required");
        if (req.diffSec == null) throw new IllegalArgumentException("diffSec is required");
        if (req.mode == null || req.mode.isBlank()) req.mode = "ARRIVAL_TO_EDGE";

        String sql = """
            INSERT INTO bus_collect
            (city_code, route_id, route_no,
             from_stop_id, to_stop_id, from_stop_name, to_stop_name,
             from_arr_sec, to_arr_sec, diff_sec, mode)
            VALUES
            (?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?, ?)
        """;

        try (Connection con = dataSource.getConnection();
             PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {

            ps.setInt(1, req.cityCode);
            ps.setString(2, req.routeId);
            ps.setString(3, req.routeNo);

            ps.setString(4, req.fromStopId);
            ps.setString(5, req.toStopId);
            ps.setString(6, req.fromStopName);
            ps.setString(7, req.toStopName);

            if (req.fromArrSec == null) ps.setNull(8, java.sql.Types.INTEGER);
            else ps.setInt(8, req.fromArrSec);

            if (req.toArrSec == null) ps.setNull(9, java.sql.Types.INTEGER);
            else ps.setInt(9, req.toArrSec);

            ps.setInt(10, req.diffSec);
            ps.setString(11, req.mode);

            ps.executeUpdate();

            try (var rs = ps.getGeneratedKeys()) {
                if (rs.next()) return rs.getLong(1);
            }
            return -1;
        }
    }
}
