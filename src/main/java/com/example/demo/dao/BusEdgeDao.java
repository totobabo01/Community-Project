package com.example.demo.dao;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.springframework.stereotype.Repository;

@Repository
public class BusEdgeDao {

    private final DataSource ds;

    public BusEdgeDao(DataSource ds) {
        this.ds = ds;
    }

    // ✅ 최단경로용: edges 읽기 row DTO
    public static class EdgeRow {
        public final String fromStopId;
        public final String toStopId;
        public final double distM;

        public EdgeRow(String fromStopId, String toStopId, double distM) {
            this.fromStopId = fromStopId;
            this.toStopId = toStopId;
            this.distM = distM;
        }
    }

    // ✅ (선택) 디버깅/화면표시용: 이름까지 포함
    public static class EdgeRowWithNames {
        public final String fromStopId;
        public final String fromStopName;
        public final String toStopId;
        public final String toStopName;
        public final double distM;

        public EdgeRowWithNames(String fromStopId, String fromStopName,
                                String toStopId, String toStopName,
                                double distM) {
            this.fromStopId = fromStopId;
            this.fromStopName = fromStopName;
            this.toStopId = toStopId;
            this.toStopName = toStopName;
            this.distM = distM;
        }
    }

    /**
     * ✅ edge upsert (이름까지 DB 컬럼에 저장)
     *
     * 전제:
     * - bus_edges에 from_stop_name / to_stop_name 컬럼이 있어야 함
     * - stops(stop_id, name)에서 이름을 LEFT JOIN으로 한번에 가져와서 저장
     */
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
    ) {
        String sql =
            "INSERT INTO bus_edges (" +
            " city_code, route_id, from_stop_id, to_stop_id," +
            " from_stop_name, to_stop_name," +
            " from_lat, from_lon, to_lat, to_lon," +
            " seq_from, seq_to, dist_m" +
            ") " +
            "SELECT ?, ?, ?, ?, " +
            "       s1.name AS from_stop_name, " +
            "       s2.name AS to_stop_name, " +
            "       ?, ?, ?, ?, ?, ?, ? " +
            "FROM (SELECT 1) x " +
            "LEFT JOIN stops s1 ON s1.stop_id = ? " +
            "LEFT JOIN stops s2 ON s2.stop_id = ? " +
            "ON DUPLICATE KEY UPDATE " +
            " from_stop_name = VALUES(from_stop_name), " +
            " to_stop_name   = VALUES(to_stop_name), " +
            " from_lat=VALUES(from_lat), from_lon=VALUES(from_lon), " +
            " to_lat=VALUES(to_lat), to_lon=VALUES(to_lon), " +
            " seq_from=VALUES(seq_from), seq_to=VALUES(seq_to), " +
            " dist_m=VALUES(dist_m), updated_at=CURRENT_TIMESTAMP";

        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            int i = 1;

            // 1~4: 키 값
            ps.setString(i++, cityCode);
            ps.setString(i++, routeId);
            ps.setString(i++, fromStopId);
            ps.setString(i++, toStopId);

            // 5~11: 좌표/순번/거리
            if (fromLat == null) ps.setNull(i++, java.sql.Types.DOUBLE); else ps.setDouble(i++, fromLat);
            if (fromLon == null) ps.setNull(i++, java.sql.Types.DOUBLE); else ps.setDouble(i++, fromLon);
            if (toLat == null) ps.setNull(i++, java.sql.Types.DOUBLE); else ps.setDouble(i++, toLat);
            if (toLon == null) ps.setNull(i++, java.sql.Types.DOUBLE); else ps.setDouble(i++, toLon);

            if (seqFrom == null) ps.setNull(i++, java.sql.Types.INTEGER); else ps.setInt(i++, seqFrom);
            if (seqTo == null) ps.setNull(i++, java.sql.Types.INTEGER); else ps.setInt(i++, seqTo);

            if (distM == null) ps.setNull(i++, java.sql.Types.DOUBLE); else ps.setDouble(i++, distM);

            // 12~13: JOIN용 stop_id
            ps.setString(i++, fromStopId);
            ps.setString(i++, toStopId);

            ps.executeUpdate();

        } catch (Exception e) {
            throw new RuntimeException("BusEdgeDao.upsertEdge 실패: " + e.getMessage(), e);
        }
    }

    // ✅ 최단경로용: city_code 기준 edge 전부 읽기
    public List<EdgeRow> findEdgesByCity(String cityCode) {
        String sql =
            "SELECT from_stop_id, to_stop_id, dist_m " +
            "FROM bus_edges " +
            "WHERE city_code=?";

        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, cityCode);

            List<EdgeRow> out = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String from = rs.getString("from_stop_id");
                    String to = rs.getString("to_stop_id");
                    double dist = rs.getDouble("dist_m");

                    if (from == null || from.isBlank()) continue;
                    if (to == null || to.isBlank()) continue;
                    if (!Double.isFinite(dist) || dist <= 0) continue;

                    out.add(new EdgeRow(from, to, dist));
                }
            }
            return out;

        } catch (Exception e) {
            throw new RuntimeException("BusEdgeDao.findEdgesByCity 실패: " + e.getMessage(), e);
        }
    }

    // ✅ (선택) 이름까지 확인하고 싶을 때
    public List<EdgeRowWithNames> findEdgesWithNamesByCity(String cityCode) {
        String sql =
            "SELECT from_stop_id, from_stop_name, to_stop_id, to_stop_name, dist_m " +
            "FROM bus_edges " +
            "WHERE city_code=?";

        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, cityCode);

            List<EdgeRowWithNames> out = new ArrayList<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String fromId = rs.getString("from_stop_id");
                    String fromNm = rs.getString("from_stop_name");
                    String toId = rs.getString("to_stop_id");
                    String toNm = rs.getString("to_stop_name");
                    double dist = rs.getDouble("dist_m");

                    if (fromId == null || fromId.isBlank()) continue;
                    if (toId == null || toId.isBlank()) continue;
                    if (!Double.isFinite(dist) || dist <= 0) continue;

                    out.add(new EdgeRowWithNames(fromId, fromNm, toId, toNm, dist));
                }
            }
            return out;

        } catch (Exception e) {
            throw new RuntimeException("BusEdgeDao.findEdgesWithNamesByCity 실패: " + e.getMessage(), e);
        }
    }

    // (선택) 디버깅: 총 edge 개수 확인
    public long countByCity(String cityCode) {
        String sql = "SELECT COUNT(*) FROM bus_edges WHERE city_code=?";

        try (Connection conn = ds.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, cityCode);

            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) return rs.getLong(1);
                return 0;
            }

        } catch (Exception e) {
            throw new RuntimeException("BusEdgeDao.countByCity 실패: " + e.getMessage(), e);
        }
    }
}
