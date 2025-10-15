// DAO 구현체: users 테이블 CRUD를 "순수 JDBC"로 수행 (DTO 의존 제거, 엔티티 사용)
package com.example.demo.dao;                                   // 이 파일이 속한 패키지(스프링 컴포넌트 스캔/네임스페이스 기준)

import java.sql.Connection;                                     // DB 연결 세션을 나타내는 JDBC 인터페이스
import java.sql.DriverManager;                                  // JDBC 드라이버를 통해 Connection을 얻는 유틸리티
import java.sql.PreparedStatement;                              // 바인딩 파라미터(?)가 있는 SQL을 실행하는 객체
import java.sql.ResultSet;                                      // SELECT 결과 집합을 순회하기 위한 커서
import java.sql.SQLException;                                   // JDBC 작업 중 발생하는 예외 타입
import java.sql.Statement;                                      // 단순 SQL 실행 및 GENERATED_KEYS 조회 등에 사용
import java.sql.Timestamp;                                      // DB TIMESTAMP ↔ 자바 타입 변환용(java.sql.Timestamp)
import java.util.ArrayList;                                     // 가변 리스트 구현체(ArrayList)
import java.util.List;                                          // 리스트 인터페이스(List)
import java.util.Optional;                                      // 값의 존재/부재를 명시적으로 표현하는 컨테이너(Optional)

import org.springframework.beans.factory.annotation.Value;      // application.yml 등의 프로퍼티 값을 필드에 주입하기 위한 애너테이션
import org.springframework.stereotype.Repository;               // DAO 스테레오타입 애너테이션(스프링 빈 등록)

import com.example.demo.domain.User;                            // DB와 1:1 매핑되는 도메인 엔티티(POJO)
import com.example.demo.sql.UsersSql;                           // users 테이블용 SQL 문자열을 반환하는 헬퍼(SELECT/INSERT/UPDATE/DELETE)

/**
 * 반환 규칙 (IUserDao와 일치):
 * - findAll()                → List<User> (빈 리스트 가능)
 * - findById(id)             → Optional<User> (없으면 empty)
 * - insert(entity)           → 생성된 PK(long). 실패/미생성 시 0
 * - update(id, patchEntity)  → 영향 행 수(int). 0=대상 없음, 1=성공
 * - delete(id)               → 영향 행 수(int). 0=대상 없음, 1=성공
 */
@Repository(UserDao.BEAN_QUALIFIER)                             // 이 클래스를 스프링 빈으로 등록하고, 한정자 이름을 부여
public class UserDao implements IUserDao {                       // IUserDao 인터페이스 구현(구체 JDBC 접근 담당)

  public static final String BEAN_QUALIFIER = "userDao";         // @Qualifier에서 사용할 빈 이름 상수

  // application.yml 예:
  // app:
  //   db:
  //     url: jdbc:mariadb://localhost:3306/demo
  //     username: demo_user
  //     password: ****
  @Value("${app.db.url}")      private String url;               // DB 접속 URL을 외부 설정에서 주입
  @Value("${app.db.username}") private String username;          // DB 사용자명 주입
  @Value("${app.db.password}") private String password;          // DB 비밀번호 주입

  // ====== 공용 매핑 유틸 ======
  /** ResultSet의 현재 커서가 가리키는 한 행(row)을 User 엔티티로 변환 */
  private static User mapRow(ResultSet rs) throws SQLException { // SQLException 전파(호출부 try-catch)
    User u = new User();                                         // 빈 User 객체 생성
    u.setId(rs.getLong("id"));                                   // 컬럼 id → User.id
    u.setName(rs.getString("name"));                             // 컬럼 name → User.name
    u.setEmail(rs.getString("email"));                           // 컬럼 email → User.email
    Timestamp ts = rs.getTimestamp("created_at");                // 컬럼 created_at을 Timestamp로 읽음(널 가능)
    u.setCreatedAt(ts == null ? null : ts.toLocalDateTime());    // 널이면 null, 아니면 LocalDateTime으로 변환해 세팅
    return u;                                                    // 매핑된 User 반환
  }

  // ====== CRUD 구현 ======

  /** 전체 조회 */
  @Override
  public List<User> findAll() {                                  // 전체 행을 최신순 등으로 조회하여 리스트 반환
    final String sql = UsersSql.selectAll();                     // 예: SELECT id,name,email,created_at FROM users ORDER BY id DESC
    List<User> list = new ArrayList<>();                         // 결과를 담을 가변 리스트

    try (Connection c = DriverManager.getConnection(url, username, password); // try-with-resources: 자원 자동 해제
         Statement st = c.createStatement();                     // 파라미터 없는 단순 SQL 실행용 Statement 생성
         ResultSet rs = st.executeQuery(sql)) {                  // 쿼리 실행 후 결과 ResultSet 획득

      while (rs.next()) list.add(mapRow(rs));                    // 각 행을 User로 매핑 후 리스트에 추가

    } catch (SQLException e) {                                   // JDBC 작업에서 발생한 예외 처리
      e.printStackTrace();                                       // 데모용 출력(운영에서는 로깅 후 변환/전파 권장)
    }
    return list;                                                 // 정상/오류 모두 리스트 반환(오류 시 빈 리스트)
  }

  /** 단건 조회 */
  @Override
  public Optional<User> findById(Long id) {                      // PK로 단건 조회, 결과가 없을 수 있어 Optional로 감쌈
    final String sql = UsersSql.selectById();                    // 예: SELECT ... FROM users WHERE id = ?

    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션 획득
         PreparedStatement ps = c.prepareStatement(sql)) {       // 바인딩 파라미터가 있는 SQL 실행을 위해 PreparedStatement 생성

      ps.setLong(1, id);                                         // 첫 번째 ? 자리에 id 바인딩(인덱스는 1부터 시작)

      try (ResultSet rs = ps.executeQuery()) {                   // SELECT 실행 후 결과 획득
        if (rs.next()) {                                         // 첫 행이 존재하면
          return Optional.of(mapRow(rs));                        // 매핑하여 Optional로 감싸 반환
        }                                                        // 없으면 아래에서 empty 반환
      }
    } catch (SQLException e) {
      e.printStackTrace();                                       // 데모용 예외 출력
    }
    return Optional.empty();                                      // 미존재/오류 시 empty
  }

  /** 생성(INSERT): 생성된 PK 반환 (created_at은 DB DEFAULT 사용) */
  @Override
  public long insert(User entity) {                              // 새 사용자 삽입, 생성된 PK(long) 반환, 실패 시 0
    final String sql = UsersSql.insert();                        // 예: INSERT INTO users(name, email) VALUES (?, ?)

    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션
         PreparedStatement ps = c.prepareStatement(              // 생성된 키 조회를 위해 옵션 지정
             sql, Statement.RETURN_GENERATED_KEYS)) {

      ps.setString(1, entity.getName());                         // 첫 번째 ? ← name
      ps.setString(2, entity.getEmail());                        // 두 번째 ? ← email

      int rows = ps.executeUpdate();                             // DML 실행(영향 행 수 반환)
      if (rows <= 0) return 0L;                                  // 삽입 실패 시 0 반환

      try (ResultSet keys = ps.getGeneratedKeys()) {             // 자동 생성된 키(id) 조회
        if (keys.next()) {                                       // 키가 존재하면
          long id = keys.getLong(1);                             // 첫 번째 컬럼(일반적으로 PK)을 획득
          return id;                                             // 생성된 PK 반환
        }
      }
    } catch (SQLException e) {
      e.printStackTrace();                                       // 데모용 예외 출력
    }
    return 0L;                                                   // 실패/키없음 예외 시 0
  }

  /** 수정(UPDATE): 부분 업데이트(COALESCE) — 영향 행 수 반환 */
  @Override
  public int update(Long id, User patch) {                       // 일부 필드만 들어온 User로 부분 수정
    final String sql = UsersSql.update();                        // 예: UPDATE users SET
                                                                 //     name = COALESCE(?, name),
                                                                 //     email = COALESCE(?, email)
                                                                 //   WHERE id = ?

    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션
         PreparedStatement ps = c.prepareStatement(sql)) {       // 바인딩 준비

      // patch에 null이 들어오면 COALESCE(?, 기존값) 덕분에 기존값 유지
      ps.setString(1, patch.getName());                          // 첫 번째 ? ← name 새 값(널이면 유지)
      ps.setString(2, patch.getEmail());                         // 두 번째 ? ← email 새 값(널이면 유지)
      ps.setLong(3, id);                                         // WHERE id = ? 바인딩

      return ps.executeUpdate();                                  // 영향 행 수 반환(0=대상 없음, 1=성공)

    } catch (SQLException e) {
      e.printStackTrace();                                       // 데모용 예외 출력
      return 0;                                                  // 예외 시 0(실패) 반환
    }
  }

  /** 삭제(DELETE): 영향 행 수 반환 */
  @Override
  public int delete(Long id) {                                   // PK로 행 삭제
    final String sql = UsersSql.delete();                        // 예: DELETE FROM users WHERE id = ?

    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션
         PreparedStatement ps = c.prepareStatement(sql)) {       // 바인딩 준비

      ps.setLong(1, id);                                         // 첫 번째 ? ← id
      return ps.executeUpdate();                                  // 영향 행 수 반환(0=대상 없음, 1=성공)

    } catch (SQLException e) {
      e.printStackTrace();                                       // 데모용 예외 출력
      return 0;                                                  // 예외 시 실패로 0
    }
  }
}
