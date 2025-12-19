package com.example.demo.dto;

public class StopDto {
    private String stopId;
    private String name;
    private Double lat;
    private Double lon;
    private String type;     // BUS/TRAM
    private String cityCode; // 25

    public StopDto() {}

    public StopDto(String stopId, String name, Double lat, Double lon, String type, String cityCode) {
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

    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }

    public Double getLon() { return lon; }
    public void setLon(Double lon) { this.lon = lon; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getCityCode() { return cityCode; }
    public void setCityCode(String cityCode) { this.cityCode = cityCode; }
}
