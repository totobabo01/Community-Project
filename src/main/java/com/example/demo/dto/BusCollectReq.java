package com.example.demo.dto;

import java.time.LocalDateTime;

public class BusCollectReq {

    // ===== 기존 필드 =====
    private Integer cityCode;

    private String routeId;
    private String routeNo;

    private String fromStopId;
    private String toStopId;
    private String fromStopName;
    private String toStopName;

    private Integer fromArrSec;
    private Integer toArrSec;
    private Integer diffSec;

    // ARRIVAL_TO_EDGE | RAW_ARRIVAL | BUS | MIXED 등
    private String mode;

    // ===== ✅ 자동수집용 추가 필드(너가 DB에 추가한 컬럼) =====
    // enabled: 1이면 자동수집 JOB로 사용, 0이면 일반 OBS 로그로 사용
    private Integer enabled;

    // 자동수집 주기(초)
    private Integer periodSec;

    // 마지막 실행 시각(스케줄러가 주기 제어에 사용)
    private LocalDateTime lastRunAt;

    // ===== 생성자 =====
    public BusCollectReq() {}

    // ===== getter / setter =====
    public Integer getCityCode() { return cityCode; }
    public void setCityCode(Integer cityCode) { this.cityCode = cityCode; }

    public String getRouteId() { return routeId; }
    public void setRouteId(String routeId) { this.routeId = routeId; }

    public String getRouteNo() { return routeNo; }
    public void setRouteNo(String routeNo) { this.routeNo = routeNo; }

    public String getFromStopId() { return fromStopId; }
    public void setFromStopId(String fromStopId) { this.fromStopId = fromStopId; }

    public String getToStopId() { return toStopId; }
    public void setToStopId(String toStopId) { this.toStopId = toStopId; }

    public String getFromStopName() { return fromStopName; }
    public void setFromStopName(String fromStopName) { this.fromStopName = fromStopName; }

    public String getToStopName() { return toStopName; }
    public void setToStopName(String toStopName) { this.toStopName = toStopName; }

    public Integer getFromArrSec() { return fromArrSec; }
    public void setFromArrSec(Integer fromArrSec) { this.fromArrSec = fromArrSec; }

    public Integer getToArrSec() { return toArrSec; }
    public void setToArrSec(Integer toArrSec) { this.toArrSec = toArrSec; }

    public Integer getDiffSec() { return diffSec; }
    public void setDiffSec(Integer diffSec) { this.diffSec = diffSec; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }

    public Integer getPeriodSec() { return periodSec; }
    public void setPeriodSec(Integer periodSec) { this.periodSec = periodSec; }

    public LocalDateTime getLastRunAt() { return lastRunAt; }
    public void setLastRunAt(LocalDateTime lastRunAt) { this.lastRunAt = lastRunAt; }

    // ===== 편의 메서드(선택) =====
    public boolean isJob() {
        return routeId != null && routeId.trim().equalsIgnoreCase("JOB");
    }
}
