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

    // ✅ 마커 찍기용 정류장 상세 목록
    public List<StopDto> stops;

    // ✅✅✅ [추가] 구간(세그먼트) 정보: 혼합 경로 색 분리용
    // 프론트에서 path[i].mode === 'BUS' / 'TRAM' / 'WALK' 보고
    // 파랑/핑크/점선으로 각각 그리면 됨
    public List<Segment> path;

    public String message;

    // ---------------------------
    // inner classes
    // ---------------------------

    // polyline용 점
    public static class Point {
        public double lat;
        public double lon;

        public Point() {}
        public Point(double lat, double lon) {
            this.lat = lat;
            this.lon = lon;
        }
    }

    // ✅ 구간(세그먼트) 정보
    public static class Segment {
        public String mode;   // BUS | TRAM | WALK
        public String from;   // stopId
        public String to;     // stopId

        public Segment() {}
        public Segment(String mode, String from, String to) {
            this.mode = mode;
            this.from = from;
            this.to = to;
        }
    }
}
