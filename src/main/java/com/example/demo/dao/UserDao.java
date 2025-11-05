// src/main/java/com/example/demo/dao/UserDao.java                     // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.dao;                                         // DAO 클래스가 속한 패키지(네임스페이스)

import java.sql.Connection;                                           // JDBC 커넥션 객체 타입
import java.sql.DriverManager;                                        // 커넥션을 직접 여는 유틸(커넥션 풀 미사용)
import java.sql.PreparedStatement;                                    // 바인딩 가능한(파라미터화된) SQL 구문
import java.sql.ResultSet;                                            // SELECT 결과를 순회하는 커서
import java.sql.SQLException;                                         // JDBC 작업 중 발생하는 체크 예외
import java.util.ArrayList;                                           // 가변 리스트 구현체
import java.util.List;                                                // 리스트 인터페이스
import java.util.Optional;                                            // 널-안전 단건 반환 컨테이너(Optional)

import org.springframework.beans.factory.annotation.Value;            // application.properties 값 주입
import org.springframework.stereotype.Repository;                     // 영속 계층 스테레오타입 애너테이션

import com.example.demo.domain.User;                                  // users 테이블과 매핑되는 도메인 엔티티
import com.example.demo.sql.UsersSql;                                 // users 테이블용 SQL 문자열 모음 유틸

/**
 * users(user_id VARCHAR(16) PK, name, phone, email UNIQUE, password)
 * PK(user_id)는 애플리케이션에서 생성해 전달합니다.
 */
@Repository(UserDao.BEAN_QUALIFIER)                                   // 이 클래스를 Repository 빈으로 등록(이름 지정)
public class UserDao implements IUserDao {                             // IUserDao 인터페이스의 구현체

  public static final String BEAN_QUALIFIER = "userDao";               // @Qualifier에서 사용할 빈 이름 상수

  @Value("${app.db.url}")      private String url;                     // DB 접속 URL (예: jdbc:mysql://...)
  @Value("${app.db.username}") private String username;                // DB 사용자명
  @Value("${app.db.password}") private String password;                // DB 비밀번호

  // ───────────────────────────────────────────────────────────────────────────
  // 공용 매핑 (모든 컬럼 포함: password 포함)
  private static User mapRow(ResultSet rs) throws SQLException {       // ResultSet 한 행 → User 엔티티 변환
    // mapRow는 RowMapper의 핵심 동작과 동일: 각 행(row)을 자바 객체로 매핑
    User u = new User();                                               // 비어 있는 User 인스턴스 생성
    u.setUserId(rs.getString("user_id"));                              // PK(user_id) 컬럼 값 매핑
    u.setName(rs.getString("name"));                                   // name 매핑
    u.setPhone(rs.getString("phone"));                                  // phone 매핑(널 허용)
    u.setEmail(rs.getString("email"));                                  // email 매핑(UNIQUE)
    u.setPassword(rs.getString("password"));                            // password 매핑(해시 저장 가정)
    return u;                                                          // 완성된 엔티티 반환
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 목록 전용 경량 DTO (비밀번호 제외)
  public static class UserRow {                                        // 비밀번호 제외한 가벼운 행 표현(목록 화면 최적화)
    public final String user_id;                                       // 컬럼명을 그대로(스네이크 케이스) 노출
    public final String name;
    public final String phone;
    public final String email;
    public UserRow(String user_id, String name, String phone, String email) {
      this.user_id = user_id;                                          // 생성자로 불변 필드 초기화
      this.name = name;
      this.phone = phone;
      this.email = email;
    }
  }

  // ───────────── CRUD ─────────────

  @Override
  public List<User> findAll() {                                        // 모든 사용자 전체 조회
    final String sql = UsersSql.selectAll();                           // 공통 SELECT + 정렬 SQL 가져오기
    List<User> list = new ArrayList<>();                               // 결과 담을 리스트
    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션 열기(try-with-resources)
         PreparedStatement ps = c.prepareStatement(sql);               // PreparedStatement 생성
         ResultSet rs = ps.executeQuery()) {                           // 쿼리 실행 → 결과 커서 획득
          // rs.next()는 JDBC의 ResultSet에서 커서를 다음 행으로 한 칸 이동시키고, **그 행이 존재하면 true, 없으면 false**를 돌려주는 메서드
          // mapRow는 Spring JDBC의 RowMapper<T> 인터페이스가 가진 메서드로, ResultSet의 “한 행(row)”을 자바 객체로 변환할 때 호출
      while (rs.next()) list.add(mapRow(rs));                          // 각 행을 User로 매핑해 리스트에 추가
    } catch (SQLException e) {
      e.printStackTrace();                                             // 간단 로깅(실무에선 로거 사용 권장)
    }
    return list;                                                       // 실패 시 빈 리스트 반환
  }

  /**
   * 관리자 목록 화면 등에서 사용하는 "비밀번호 제거된" 목록.
   * 컬럼: user_id, name, phone, email
   */
  public List<UserRow> findAllForAdminList() {                         // 경량 행 전용 목록 조회
    final String sql = """
        SELECT user_id, name, phone, email
          FROM users
         ORDER BY user_id
        """;                                                           // 비밀번호 제외 SELECT
    List<UserRow> list = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql);
         ResultSet rs = ps.executeQuery()) {
      while (rs.next()) {                                              // 한 행씩 UserRow로 생성
        list.add(new UserRow(
            rs.getString("user_id"),
            rs.getString("name"),
            rs.getString("phone"),
            rs.getString("email")
        ));
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return list;                                                       // 경량 목록 반환
  }

  /** PK(user_id) 단건 조회 */
  @Override
  public Optional<User> findById(String userId) {                      // user_id로 단건 조회
    // Optional<T>로 “없음”을 명시적으로 표현해 NPE를 방지
    final String sql = UsersSql.selectById();                          // WHERE user_id = ? SQL
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);                                         // 1번째 파라미터 바인딩
      try (ResultSet rs = ps.executeQuery()) {                         // 실행
        if (rs.next()) return Optional.of(mapRow(rs));                 // 결과 있으면 User로 매핑해 반환
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return Optional.empty();                                           // 없으면 empty
  }

  /** 이메일 단건 조회 */
  @Override
  public Optional<User> findByEmail(String email) {                    // email로 단건 조회
    final String sql = UsersSql.selectByEmail();                       // WHERE email = ? SQL
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, email);                                          // 1번째 파라미터 바인딩
      try (ResultSet rs = ps.executeQuery()) {
        if (rs.next()) return Optional.of(mapRow(rs));                 // 결과 있으면 매핑해서 반환
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return Optional.empty();                                           // 없거나 실패 시 empty
  }

  /**
   * INSERT
   * @return 성공 시 생성된 PK(user_id), 실패 시 null
   */
  @Override
  public String insert(User entity) {                                  // 새 사용자 한 명 추가
    final String sql = UsersSql.insert();                              // INSERT SQL(자리표시자 포함)
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {

      ps.setString(1, entity.getUserId());                             // user_id(앱이 생성해 전달)
      ps.setString(2, entity.getName());                               // name
      if (entity.getPhone() == null) ps.setNull(3, java.sql.Types.VARCHAR);
      else                           ps.setString(3, entity.getPhone()); // phone(널 허용)
      ps.setString(4, entity.getEmail());                              // email(UNIQUE)
      ps.setString(5, entity.getPassword());                           // password(해시된 값 저장 전제)

      int rows = ps.executeUpdate();                                   // 영향 행 수
      return rows > 0 ? entity.getUserId() : null;                     // 성공이면 PK 반환, 아니면 null
    } catch (SQLException e) {
      e.printStackTrace();
      return null;                                                     // 실패 시 null
    }
  }

  /** 부분 업데이트(COALESCE) */
  @Override
  public int update(String userId, User patch) {                       // 일부 필드만 갱신(널은 유지)
    final String sql = UsersSql.update();                              // COALESCE 기반 UPDATE SQL
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {

      ps.setString(1, patch.getName());                                // 새 name 또는 null
      ps.setString(2, patch.getPhone());                               // 새 phone 또는 null
      ps.setString(3, patch.getEmail());                               // 새 email 또는 null
      ps.setString(4, patch.getPassword());                            // 새 password(해시) 또는 null
      ps.setString(5, userId);                                         // WHERE user_id = ?

      return ps.executeUpdate();                                       // 영향 행 수(0/1)
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;                                                        // 예외 시 0
    }
  }

  /** 삭제 */
  @Override
  public int delete(String userId) {                                   // user_id 기준 삭제
    final String sql = UsersSql.delete();                              // DELETE SQL
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
          // ps.setString(...)는 JDBC PreparedStatement의 파라미터에 문자열 값을 넣는 메서드
      ps.setString(1, userId);                                         // WHERE user_id 바인딩
      // executeUpdate()는 JDBC에서 INSERT, UPDATE, DELETE, DDL 같은 데이터를 바꾸는 SQL을 실행할 때 쓰는 메서드
      return ps.executeUpdate();                                       // 삭제된 행 수 반환(0/1)
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;                                                        // 예외 시 0
    }
  }
}
