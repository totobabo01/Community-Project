package com.example.demo.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.dao.BusCollectDao;
import com.example.demo.dto.BusCollectReq;

@RestController
@RequestMapping("/api/buscollect")
public class BusCollectController {

    private final BusCollectDao busCollectDao;

    public BusCollectController(BusCollectDao busCollectDao) {
        this.busCollectDao = busCollectDao;
    }

    @PostMapping("/save")
    public ResponseEntity<?> save(@RequestBody BusCollectReq req) {
        try {
            long id = busCollectDao.insert(req);

            Map<String, Object> out = new HashMap<>();
            out.put("ok", true);
            out.put("id", id);
            return ResponseEntity.ok(out);

        } catch (IllegalArgumentException iae) {
            Map<String, Object> out = new HashMap<>();
            out.put("ok", false);
            out.put("message", iae.getMessage());
            return ResponseEntity.badRequest().body(out);

        } catch (Exception e) {
            Map<String, Object> out = new HashMap<>();
            out.put("ok", false);
            out.put("message", "DB insert failed");
            out.put("detail", e.getMessage());
            return ResponseEntity.internalServerError().body(out);
        }
    }
}
