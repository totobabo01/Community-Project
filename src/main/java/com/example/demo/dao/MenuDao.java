// src/main/java/com/example/demo/dao/MenuDao.java                     // 표준 Maven/Gradle 소스 경로 + 파일명

package com.example.demo.dao;                                         // DAO 클래스가 속한 패키지(네임스페이스)

import java.util.ArrayList;                                           // 가변 리스트 구현체(ArrayList)
import java.util.HashMap;                                             // 부모→자식 매핑용 맵 구현체(HashMap)
import java.util.List;                                                // 컬렉션 인터페이스(List)
import java.util.Map;                                                 // 키-값 맵 인터페이스(Map)

import org.springframework.jdbc.core.JdbcTemplate;                    // SQL 실행 편의 유틸(스프링 JDBC)
import org.springframework.stereotype.Repository;                    // 영속 계층 컴포넌트 표시(예외 변환 AOP 대상)

@Repository                                                           // 스프링 컨테이너에 Repository 빈으로 등록
public class MenuDao {
  private final JdbcTemplate jdbc;                                    // DB 접근을 위한 JdbcTemplate 의존성
  public MenuDao(JdbcTemplate jdbc){ this.jdbc = jdbc; }              // 생성자 주입으로 jdbc 초기화(불변성 보장)

  /**
   * 특정 depth(깊이)의 메뉴 목록을 조회
   * - 반환형: List<Map<String,Object>>  (컬럼명→값) 형태로 단순 반환
   * - 컬럼: uuid, menu_name, depth, priority, path, template_url, parent_uuid
   * - 조건: is_active = TRUE AND depth = ?
   * - 정렬: priority ASC (우선순위 낮은 숫자 먼저)
   */
  public List<Map<String,Object>> findByDepth(int depth) {
    String sql = """
      SELECT uuid, menu_name, depth, priority, path, template_url, parent_uuid
      FROM menu
      WHERE is_active = TRUE AND depth = ?
      ORDER BY priority ASC
    """;                                                              // 멀티라인 문자열(SQL 가독성 향상)
    return jdbc.queryForList(sql, depth);                             // 바인딩 후 실행 → List<Map<String,Object>> 반환
  }

  /**
   * depth=1(대메뉴) + depth=2(소메뉴) 구조를 트리 형태로 반환
   * - 1차 쿼리: depth=1 (루트/대메뉴)
   * - 2차 쿼리: depth=2 (자식 후보)
   * - 조립: parent_uuid 기준으로 depth=2를 각 depth=1 항목의 "children" 키에 매핑
   * - 결과: 대메뉴 리스트에 각자의 children(소메뉴 리스트)이 달린 계층 자료구조
   */
  public List<Map<String,Object>> findTree() {
    var top = findByDepth(1);                                         // ① 대메뉴(루트 노드들) 조회
    var sub = findByDepth(2);                                         // ② 소메뉴(모든 자식 후보) 조회

    // 부모 uuid → 소메뉴 리스트 를 빠르게 찾기 위한 인덱스 맵 구성
    Map<String, List<Map<String,Object>>> byParent = new HashMap<>(); // 키: parent_uuid, 값: 그 부모의 자식 목록

    for (var m : sub) {                                               // 모든 소메뉴를 순회하며
      String p = (String)m.get("parent_uuid");                        // 소메뉴가 가리키는 부모 uuid 추출
      byParent                                                        // 부모별 리스트를 맵에 확보하고
          .computeIfAbsent(p, k -> new ArrayList<>())                 // 없으면 새 ArrayList 생성
          .add(m);                                                    // 해당 부모의 자식 리스트에 현재 소메뉴 추가
    }

    for (var m : top) {                                               // 각 대메뉴(루트)에 대해
      m.put("children",                                               // "children" 키에
            byParent.getOrDefault(                                    // 자신의 uuid를 부모로 갖는 소메뉴 리스트를
              (String)m.get("uuid"),                                  // (매칭되는 키가 없으면)
              List.of()                                               // 빈 리스트(List.of())를 사용
            ));
    }

    return top;                                                       // 조립 완료된 "대메뉴 리스트(각자 children 포함)" 반환
  }
}
