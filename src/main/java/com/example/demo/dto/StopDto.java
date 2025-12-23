package com.example.demo.dto;

public class StopDto {

    public enum StopType { BUS, TRAM }

    private String stopId;
    private String name;
    private double lat;
    private double lon;
    private StopType type;   // BUS/TRAM
    private String cityCode; // "25"

    public StopDto() {}

    public StopDto(String stopId, String name, double lat, double lon, StopType type, String cityCode) {
        this.stopId = stopId;
        this.name = name;
        this.lat = lat;
        this.lon = lon;
        this.type = type;
        this.cityCode = cityCode;
    }

    public String getStopId() { return stopId; }
    public void setStopId(String stopId) { this.stopId = stopId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }

    public double getLon() { return lon; }
    public void setLon(double lon) { this.lon = lon; }

    public StopType getType() { return type; }
    public void setType(StopType type) { this.type = type; }

    public String getCityCode() { return cityCode; }
    public void setCityCode(String cityCode) { this.cityCode = cityCode; }

    @Override
    public String toString() {
        return "StopDto{stopId='" + stopId + "', name='" + name + "', lat=" + lat + ", lon=" + lon +
                ", type=" + type + ", cityCode='" + cityCode + "'}";
    }
}
