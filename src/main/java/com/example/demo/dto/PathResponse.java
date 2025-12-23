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

    public List<String> stopIds;
    public List<Point> polyline;

    public String message;

    public static class Point {
        public double lat;
        public double lon;
        public Point() {}
        public Point(double lat, double lon) { this.lat = lat; this.lon = lon; }
    }
}
