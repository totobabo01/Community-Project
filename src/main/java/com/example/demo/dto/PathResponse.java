package com.example.demo.dto;

import java.util.List;

public class PathResponse {
    public String cityCode;
    public String fromStopId;
    public String toStopId;

    public String mode;    // BUS | TRAM | BUS_TRAM
    public String weight;  // DIST | TIME

    public boolean found;
    public double totalDistM;
    public double totalTimeS;

    // ✅ 최단경로 stopId 나열
    public List<String> stopIds;

    // ✅ 지도용 polyline (lat/lon)
    public List<Point> polyline;

    // ✅✅✅ [추가] 마커 찍기용 정류장 상세 목록
    // 프론트에서 stops[i].lat/lon/name/stopId 등을 바로 사용 가능
    public List<StopDto> stops;

    public String message;

    public static class Point {
        public double lat;
        public double lon;
        public Point() {}
        public Point(double lat, double lon) { this.lat = lat; this.lon = lon; }
    }
}
