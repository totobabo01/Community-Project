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

    public enum Mode { BUS, TRAM, BUS_TRAM }
    public enum Weight { DIST, TIME }

    private final BusEdgeDao busEdgeDao;
    private final StopDao stopDao;

    private static final double BUS_SPEED_MPS = 6.0;
    private static final double TRAM_SPEED_MPS = 10.0;

    public ShortestPathService(BusEdgeDao busEdgeDao, StopDao stopDao) {
        this.busEdgeDao = busEdgeDao;
        this.stopDao = stopDao;
    }

    public PathResponse shortest(String cityCode, String fromStopId, String toStopId, Mode mode, Weight weight) {

        PathResponse res = new PathResponse();
        res.cityCode = cityCode;
        res.fromStopId = fromStopId;
        res.toStopId = toStopId;
        res.mode = mode.name();
        res.weight = weight.name();

        if (fromStopId == null || fromStopId.isBlank() || toStopId == null || toStopId.isBlank()) {
            res.found = false;
            res.message = "fromStopId / toStopId가 비었습니다.";
            return res;
        }

        List<BusEdgeDao.EdgeRow> edges = busEdgeDao.findEdgesByCity(cityCode);
        if (edges.isEmpty()) {
            res.found = false;
            res.message = "bus_edges 데이터가 없습니다.";
            return res;
        }

        // stop 캐시 (DB hit 줄이기)
        Map<String, StopDto> stopCache = new HashMap<>();

        // 그래프 구성
        Map<String, List<Edge>> adj = new HashMap<>();

        for (BusEdgeDao.EdgeRow e : edges) {
            StopDto from = getStopCached(stopCache, cityCode, e.fromStopId);
            StopDto to   = getStopCached(stopCache, cityCode, e.toStopId);
            if (from == null || to == null) continue;

            if (!allowByMode(mode, from.getType(), to.getType())) continue;

            double dist = e.distM;
            double timeS = dist / speedByType(from.getType());
            double cost = (weight == Weight.DIST) ? dist : timeS;

            adj.computeIfAbsent(from.getStopId(), k -> new ArrayList<>())
               .add(new Edge(to.getStopId(), dist, timeS, cost));

            // ✅ 버스는 방향 데이터가 부족한 경우가 많아서 “양방향” 옵션을 기본으로 넣는 게 체감 좋음
            //    (원치 않으면 아래 블록 주석처리)
            adj.computeIfAbsent(to.getStopId(), k -> new ArrayList<>())
               .add(new Edge(from.getStopId(), dist, timeS, cost));
        }

        DijkstraResult dr = dijkstra(adj, fromStopId, toStopId);
        if (!dr.found) {
            res.found = false;
            res.message = "경로를 찾지 못했습니다. edges 연결이 부족하거나, 해당 stopId들이 그래프에 없습니다.";
            return res;
        }

        List<String> path = reconstructPath(dr.prev, fromStopId, toStopId);
        if (path.isEmpty()) {
            res.found = false;
            res.message = "경로 복원 실패(prev 끊김)";
            return res;
        }

        res.stopIds = path;
        res.found = true;

        double totalDist = 0.0;
        double totalTime = 0.0;

        List<PathResponse.Point> poly = new ArrayList<>();
        for (int i = 0; i < path.size(); i++) {
            StopDto s = getStopCached(stopCache, cityCode, path.get(i));
            if (s != null) poly.add(new PathResponse.Point(s.getLat(), s.getLon()));

            if (i < path.size() - 1) {
                String a = path.get(i);
                String b = path.get(i + 1);
                Edge edge = findEdge(adj, a, b);
                if (edge != null) {
                    totalDist += edge.distM;
                    totalTime += edge.timeS;
                }
            }
        }

        res.totalDistM = totalDist;
        res.totalTimeS = totalTime;
        res.polyline = poly;
        res.message = "OK";
        return res;
    }

    // ───────── helpers ─────────

    private StopDto getStopCached(Map<String, StopDto> cache, String cityCode, String stopId) {
        StopDto hit = cache.get(stopId);
        if (hit != null) return hit;
        StopDto s = stopDao.findById(cityCode, stopId);
        if (s != null) cache.put(stopId, s);
        return s;
    }

    private boolean allowByMode(Mode mode, StopDto.StopType from, StopDto.StopType to) {
        if (mode == Mode.BUS_TRAM) return true;
        if (mode == Mode.BUS) return from == StopDto.StopType.BUS && to == StopDto.StopType.BUS;
        if (mode == Mode.TRAM) return from == StopDto.StopType.TRAM && to == StopDto.StopType.TRAM;
        return true;
    }

    private double speedByType(StopDto.StopType t) {
        return (t == StopDto.StopType.TRAM) ? TRAM_SPEED_MPS : BUS_SPEED_MPS;
    }

    private static class Edge {
        String to;
        double distM;
        double timeS;
        double cost;
        Edge(String to, double distM, double timeS, double cost) {
            this.to = to; this.distM = distM; this.timeS = timeS; this.cost = cost;
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
