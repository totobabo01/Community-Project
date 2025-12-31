package com.example.demo.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

import org.springframework.stereotype.Service;

import com.example.demo.dao.BusEdgeDao;
import com.example.demo.dao.StopDao;
import com.example.demo.dto.PathResponse;
import com.example.demo.dto.StopDto;

@Service
public class ShortestPathService {

    // ✅ 프론트에서 mode=MIXED 보내도 enum 파싱 에러 안 나게
    public enum Mode { BUS, TRAM, BUS_TRAM, MIXED }
    public enum Weight { DIST, TIME }

    private final BusEdgeDao busEdgeDao;
    private final StopDao stopDao;

    // 속도(추정) - 필요하면 튜닝
    private static final double BUS_SPEED_MPS  = 6.0;   // 약 21.6km/h
    private static final double TRAM_SPEED_MPS = 10.0;  // 약 36km/h
    private static final double WALK_SPEED_MPS = 1.25;  // 약 4.5km/h

    // ✅ 환승 도보 연결 최대 거리(m) (중요!)
    // 너무 작으면 BUS→TRAM이 계속 끊김 / 너무 크면 이상한 환승이 생김
    private static final double TRANSFER_MAX_M = 400.0;

    public ShortestPathService(BusEdgeDao busEdgeDao, StopDao stopDao) {
        this.busEdgeDao = busEdgeDao;
        this.stopDao = stopDao;
    }

    public PathResponse shortest(String cityCode, String fromStopId, String toStopId, Mode mode, Weight weight) {

        PathResponse res = new PathResponse();
        res.cityCode = cityCode;
        res.fromStopId = fromStopId;
        res.toStopId = toStopId;

        // 내부 모드/가중치 확정
        Mode effectiveMode = (mode == null ? Mode.BUS_TRAM : mode);
        if (effectiveMode == Mode.MIXED) effectiveMode = Mode.BUS_TRAM;

        Weight effectiveWeight = (weight == null ? Weight.DIST : weight);

        res.mode = effectiveMode.name();
        res.weight = effectiveWeight.name();

        // 입력 검증
        if (fromStopId == null || fromStopId.isBlank() ||
            toStopId == null || toStopId.isBlank()) {
            res.found = false;
            res.message = "fromStopId / toStopId가 비었습니다.";
            return res;
        }

        // edges 로드
        List<BusEdgeDao.EdgeRow> edges = busEdgeDao.findEdgesByCity(cityCode);
        if (edges == null || edges.isEmpty()) {
            res.found = false;
            res.message = "bus_edges 데이터가 없습니다.";
            return res;
        }

        // stop 캐시
        Map<String, StopDto> stopCache = new HashMap<>();

        // 그래프
        Map<String, List<Edge>> adj = new HashMap<>();

        // 1) 기존 엣지(bu_edges)로 그래프 구성
        for (BusEdgeDao.EdgeRow e : edges) {
            StopDto from = getStopCached(stopCache, cityCode, e.fromStopId);
            StopDto to   = getStopCached(stopCache, cityCode, e.toStopId);
            if (from == null || to == null) continue;

            if (!allowByMode(effectiveMode, from.getType(), to.getType())) continue;

            double dist = e.distM;
            double timeS = dist / speedByType(from.getType());
            double cost = (effectiveWeight == Weight.DIST) ? dist : timeS;

            addUndirected(adj, from.getStopId(), to.getStopId(), dist, timeS, cost);
        }

        // 2) ✅✅✅ 혼합(BUS_TRAM)일 때 “환승 도보 엣지” 자동 생성
        if (effectiveMode == Mode.BUS_TRAM) {
            addTransferWalkEdges(adj, stopCache, cityCode, effectiveWeight);
        }

        // 다익스트라
        DijkstraResult dr = dijkstra(adj, fromStopId, toStopId);
        if (!dr.found) {
            res.found = false;
            res.message = "경로를 찾지 못했습니다. edges 연결이 부족합니다. (BUS-TRAM 환승 엣지 필요)";
            return res;
        }

        List<String> nodePath = reconstructPath(dr.prev, fromStopId, toStopId);
        if (nodePath.isEmpty()) {
            res.found = false;
            res.message = "경로 복원 실패(prev 끊김)";
            return res;
        }

        res.stopIds = nodePath;
        res.found = true;

        // 거리/시간 + polyline + stops + segments(path)
        double totalDist = 0.0;
        double totalTime = 0.0;

        List<PathResponse.Point> poly = new ArrayList<>();
        List<StopDto> stops = new ArrayList<>();
        List<PathResponse.Segment> segs = new ArrayList<>();

        for (int i = 0; i < nodePath.size(); i++) {
            StopDto s = getStopCached(stopCache, cityCode, nodePath.get(i));
            if (s != null) {
                stops.add(s);
                // PathResponse.Point는 (lat, lon)
                poly.add(new PathResponse.Point(s.getLat(), s.getLon()));
            }

            if (i < nodePath.size() - 1) {
                String aId = nodePath.get(i);
                String bId = nodePath.get(i + 1);

                Edge edge = findEdge(adj, aId, bId);
                if (edge != null) {
                    totalDist += edge.distM;
                    totalTime += edge.timeS;
                }

                // 구간 모드 결정: 같은 타입이면 BUS/TRAM, 다르면 WALK
                StopDto a = stopCache.get(aId);
                StopDto b = stopCache.get(bId);

                String segMode = "BUS";
                if (a != null && b != null) {
                    StopDto.StopType ta = a.getType();
                    StopDto.StopType tb = b.getType();

                    if (ta == StopDto.StopType.TRAM && tb == StopDto.StopType.TRAM) segMode = "TRAM";
                    else if (ta == StopDto.StopType.BUS && tb == StopDto.StopType.BUS) segMode = "BUS";
                    else segMode = "WALK";
                } else {
                    // 캐시가 없으면 안전하게 WALK
                    segMode = "WALK";
                }

                segs.add(new PathResponse.Segment(segMode, aId, bId));
            }
        }

        res.totalDistM = totalDist;
        res.totalTimeS = totalTime;
        res.polyline = poly;
        res.stops = stops;
        res.path = segs; // ✅✅✅ List<Object> 절대 금지
        res.message = "OK";
        return res;
    }

    // =========================================================
    // ✅ 혼합 환승: BUS 정류장 ↔ TRAM 정류장 가까운 것들을 WALK 엣지로 연결
    // =========================================================
    private void addTransferWalkEdges(Map<String, List<Edge>> adj,
                                      Map<String, StopDto> stopCache,
                                      String cityCode,
                                      Weight weight) {

        // ✅ StopDao에 findByCity(cityCode) 추가해둔 상태여야 함
        List<StopDto> all = stopDao.findByCity(cityCode);
        if (all == null || all.isEmpty()) return;

        List<StopDto> buses = new ArrayList<>();
        List<StopDto> trams = new ArrayList<>();

        for (StopDto s : all) {
            if (s == null) continue;
            if (s.getStopId() == null) continue;

            stopCache.putIfAbsent(s.getStopId(), s);

            if (s.getType() == StopDto.StopType.BUS) buses.add(s);
            else if (s.getType() == StopDto.StopType.TRAM) trams.add(s);
        }

        if (buses.isEmpty() || trams.isEmpty()) return;

        int added = 0;

        // BUS 하나당 “가장 가까운 TRAM 1개”만 연결 (과도한 엣지 방지)
        for (StopDto b : buses) {
            StopDto best = null;
            double bestD = Double.POSITIVE_INFINITY;

            for (StopDto t : trams) {
                double d = haversineM(b.getLon(), b.getLat(), t.getLon(), t.getLat());
                if (d < bestD) {
                    bestD = d;
                    best = t;
                }
            }

            if (best != null && bestD <= TRANSFER_MAX_M) {
                double dist = bestD;
                double timeS = dist / WALK_SPEED_MPS;
                double cost = (weight == Weight.DIST) ? dist : timeS;

                addUndirected(adj, b.getStopId(), best.getStopId(), dist, timeS, cost);
                added++;
            }
        }

        // (선택) TRAM 하나당 가장 가까운 BUS도 연결하고 싶으면 아래도 추가 가능
        // 지금은 BUS→TRAM만으로도 대부분 연결됨.

        // 디버그용 로그를 넣고 싶으면 여기서 added 출력
        // System.out.println("[transferEdges] added=" + added);
    }

    private double haversineM(double lon1, double lat1, double lon2, double lat2) {
        double R = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat/2)*Math.sin(dLat/2)
                + Math.cos(Math.toRadians(lat1))*Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon/2)*Math.sin(dLon/2);
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return R * c;
    }

    // =========================================================
    // helpers
    // =========================================================
    private StopDto getStopCached(Map<String, StopDto> cache, String cityCode, String stopId) {
        StopDto hit = cache.get(stopId);
        if (hit != null) return hit;

        StopDto s = stopDao.findById(cityCode, stopId);
        if (s != null) cache.put(stopId, s);
        return s;
    }

    private boolean allowByMode(Mode mode, StopDto.StopType from, StopDto.StopType to) {
        if (mode == Mode.BUS_TRAM) return true;
        if (mode == Mode.BUS)  return from == StopDto.StopType.BUS  && to == StopDto.StopType.BUS;
        if (mode == Mode.TRAM) return from == StopDto.StopType.TRAM && to == StopDto.StopType.TRAM;
        return true;
    }

    private double speedByType(StopDto.StopType t) {
        return (t == StopDto.StopType.TRAM) ? TRAM_SPEED_MPS : BUS_SPEED_MPS;
    }

    private void addUndirected(Map<String, List<Edge>> adj, String a, String b, double distM, double timeS, double cost) {
        adj.computeIfAbsent(a, k -> new ArrayList<>()).add(new Edge(b, distM, timeS, cost));
        adj.computeIfAbsent(b, k -> new ArrayList<>()).add(new Edge(a, distM, timeS, cost));
    }

    // =========================================================
    // dijkstra
    // =========================================================
    private static class Edge {
        String to;
        double distM;
        double timeS;
        double cost;
        Edge(String to, double distM, double timeS, double cost) {
            this.to = to;
            this.distM = distM;
            this.timeS = timeS;
            this.cost = cost;
        }
    }

    private static class Node {
        String id;
        double cost;
        Node(String id, double cost) { this.id = id; this.cost = cost; }
    }

    private static class DijkstraResult {
        boolean found;
        Map<String, String> prev = new HashMap<>();
        Map<String, Double> dist = new HashMap<>();
    }

    private DijkstraResult dijkstra(Map<String, List<Edge>> adj, String start, String goal) {
        DijkstraResult r = new DijkstraResult();

        PriorityQueue<Node> pq = new PriorityQueue<>(Comparator.comparingDouble(n -> n.cost));
        r.dist.put(start, 0.0);
        pq.add(new Node(start, 0.0));

        while (!pq.isEmpty()) {
            Node cur = pq.poll();
            double best = r.dist.getOrDefault(cur.id, Double.POSITIVE_INFINITY);
            if (cur.cost != best) continue;

            if (cur.id.equals(goal)) {
                r.found = true;
                return r;
            }

            for (Edge e : adj.getOrDefault(cur.id, List.of())) {
                double nd = cur.cost + e.cost;
                double prevBest = r.dist.getOrDefault(e.to, Double.POSITIVE_INFINITY);
                if (nd < prevBest) {
                    r.dist.put(e.to, nd);
                    r.prev.put(e.to, cur.id);
                    pq.add(new Node(e.to, nd));
                }
            }
        }

        r.found = false;
        return r;
    }

    private List<String> reconstructPath(Map<String, String> prev, String start, String goal) {
        LinkedList<String> path = new LinkedList<>();
        String cur = goal;
        path.addFirst(cur);

        while (!cur.equals(start)) {
            String p = prev.get(cur);
            if (p == null) return List.of();
            cur = p;
            path.addFirst(cur);
        }
        return path;
    }

    private Edge findEdge(Map<String, List<Edge>> adj, String from, String to) {
        for (Edge e : adj.getOrDefault(from, List.of())) {
            if (e.to.equals(to)) return e;
        }
        return null;
    }
}
