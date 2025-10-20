// src/main/java/com/example/demo/dao/MenuDao.java
package com.example.demo.dao;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MenuDao {
  private final JdbcTemplate jdbc;
  public MenuDao(JdbcTemplate jdbc){ this.jdbc = jdbc; }

  public List<Map<String,Object>> findByDepth(int depth) {
    String sql = """
      SELECT uuid, menu_name, depth, priority, path, template_url, parent_uuid
      FROM menu
      WHERE is_active = TRUE AND depth = ?
      ORDER BY priority ASC
    """;
    return jdbc.queryForList(sql, depth);
  }

  /** depth=1(대메뉴) + depth=2(소메뉴) 트리로 반환 */
  public List<Map<String,Object>> findTree() {
    var top = findByDepth(1);
    var sub = findByDepth(2);

    Map<String, List<Map<String,Object>>> byParent = new HashMap<>();
    for (var m : sub) {
      String p = (String)m.get("parent_uuid");
      byParent.computeIfAbsent(p, k -> new ArrayList<>()).add(m);
    }
    for (var m : top) {
      m.put("children", byParent.getOrDefault((String)m.get("uuid"), List.of()));
    }
    return top;
  }
}
