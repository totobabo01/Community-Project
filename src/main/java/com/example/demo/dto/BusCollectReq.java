package com.example.demo.dto;

public class BusCollectReq {
    public Integer cityCode;

    public String routeId;
    public String routeNo;

    public String fromStopId;
    public String toStopId;
    public String fromStopName;
    public String toStopName;

    public Integer fromArrSec;
    public Integer toArrSec;
    public Integer diffSec;

    public String mode; // ARRIVAL_TO_EDGE | RAW_ARRIVAL
}
