// src/main/java/com/example/demo/dao/RoleDao.java                         // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.dao;                                             // DAO 클래스가 속한 패키지(네임스페이스)

import java.util.List;                                                    // 결과 목록을 담을 컬렉션 인터페이스

import org.springframework.jdbc.core.JdbcTemplate;                        // SQL 실행을 간편화하는 스프링 JDBC 유틸
import org.springframework.stereotype.Repository;                         // 영속 계층 컴포넌트 표시(예외 변환 AOP 대상)

import com.example.demo.dto.RoleRow;                                      // (username, role)을 담는 응답 DTO

/**
 * 권한 조회 DAO
 *
 * - users / users_roles 를 조인하여 사용자별 **대표 권한**을 한 줄로 계산합니다.
 * - 사용자가 여러 권한을 갖더라도 ADMIN 이 하나라도 있으면 대표 권한은 ROLE_ADMIN,
 *   아니면 ROLE_USER 로 표기합니다.
 * - MySQL 등에서 조인 키의 문자셋/컬레이션이 다를 때 발생하는
 *   "Illegal mix of collations (1267)" 방지를 위해 조인 조건에 명시적으로 COLLATE 를 맞춥니다.
 */
@Repository                                                                // 스프링 컨테이너에 Repository 빈으로 등록
public class RoleDao {

  private final JdbcTemplate jdbc;                                         // DB 접근용 JdbcTemplate 의존성

  public RoleDao(JdbcTemplate jdbc) {                                       // 생성자 주입(권장)
    this.jdbc = jdbc;                                                       // 주입받은 템플릿을 필드에 저장
  }

  /** DB에서 사용할 공통 컬레이션 이름
   *  - MySQL 8 권장: "utf8mb4_uca1400_ai_ci"
   *  - 환경에 따라 "utf8mb4_0900_ai_ci" 또는 "utf8mb4_general_ci" 가 필요할 수 있음
   *  - 1267 에러가 지속되면 이 값을 해당 DB의 **테이블/컬럼 기본 컬레이션**과 동일하게 바꾸세요.
   */
  private static final String C = "utf8mb4_uca1400_ai_ci";                  // 조인 시 강제 적용할 COLLATE 상수

  /**
   * 모든 사용자와 그에 대한 "대표 권한"을 반환.
   * @return List<RoleRow> (username, role)
   */
  public List<RoleRow> findAllUserRoles() { // findAllUserRoles()는 “모든 사용자-역할 매핑을 조회” 하는 함수
    // 핵심 아이디어:
    //  1) users 를 기준으로 **LEFT JOIN** → 권한이 하나도 없어도 사용자는 반드시 출력.
    //  2) role_id 값들 중에 ADMIN 이 하나라도 있는지 사용자 단위로 집계(CASE → MAX).
    //  3) 있으면 ROLE_ADMIN, 없으면 ROLE_USER 로 대표 권한을 결정.
    //  4) 조인 키(u.user_id, ur.user_id)의 컬레이션을 동일하게 맞춰 1267 에러 예방.
    final String sql =
        "SELECT u.user_id AS username, \n" +                                // 사용자 아이디를 username 별칭으로 노출
        "       CASE \n" +                                                  // 대표 권한 계산 시작
        "         WHEN MAX(CASE \n" +                                       // 사용자 그룹 내에 ADMIN 존재 여부 집계
                  // 보통 “upper”는 문자열을 대문자로 바꾸는 기능
                  // COALESCE(expr1, expr2, …)는 SQL 표준 함수로, 왼쪽부터 처음으로 NULL이 아닌 값을 반환
        "                   WHEN UPPER(COALESCE(ur.role_id, '')) LIKE '%ADMIN%'\n" + // role_id 대문자화 후 'ADMIN' 포함?
        "                   THEN 1 ELSE 0 \n" +                             // 포함되면 1, 아니면 0
        "                 END) = 1 \n" +                                    // 그룹 내 최대값이 1이면 → ADMIN 있음
        "           THEN 'ROLE_ADMIN' \n" +                                 // 대표 권한: ROLE_ADMIN
        "         ELSE 'ROLE_USER' \n" +                                    // 그 외: ROLE_USER
        "       END AS role \n" +                                           // 결과 컬럼명 role
        "  FROM users u \n" +                                               // 기준 테이블: 모든 사용자
        "  LEFT JOIN users_roles ur \n" +                                   // 사용자-권한 매핑과 조인(없어도 사용자 표시)
        "    ON u.user_id COLLATE " + C + " = ur.user_id COLLATE " + C + " \n" + // 컬레이션 동일화로 1267 회피
        " GROUP BY u.user_id \n" +                                          // 사용자 단위로 그룹핑(대표 권한 1줄)
        " ORDER BY u.user_id";                                              // 사용자 아이디 오름차순 정렬

    // RowMapper: 한 행(username, role) → RoleRow 객체로 변환
    return jdbc.query(
        sql,
        // RoleRow는 “권한(역할) 한 건을 담는 레코드/DTO”를 가리키는 이름                                                                // 실행할 SQL
        (rs, i) -> new RoleRow(                                             // 람다로 간단히 매핑
            // getString은 "어딘가에 저장된 값을 문자열로 꺼내오는 메서드
            rs.getString("username"),                                       // username 컬럼 → dto.username
            rs.getString("role")                                            // role 컬럼 → dto.role
        )
    );
  }
}
