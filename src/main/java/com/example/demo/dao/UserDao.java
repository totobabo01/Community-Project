// src/main/java/com/example/demo/dao/UserDao.java
package com.example.demo.dao;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.example.demo.domain.User;
import com.example.demo.sql.UsersSql;

/**
 * users(user_id VARCHAR(16) PK, name, phone, email UNIQUE, password)
 * PK(user_id)는 애플리케이션에서 생성해 전달합니다.
 */
@Repository(UserDao.BEAN_QUALIFIER)
public class UserDao implements IUserDao {

  public static final String BEAN_QUALIFIER = "userDao";

  @Value("${app.db.url}")      private String url;
  @Value("${app.db.username}") private String username;
  @Value("${app.db.password}") private String password;

  // ───────────────────────────────────────────────────────────────────────────
  // 공용 매핑 (모든 컬럼 포함: password 포함)
  private static User mapRow(ResultSet rs) throws SQLException {
    User u = new User();
    u.setUserId(rs.getString("user_id"));
    u.setName(rs.getString("name"));
    u.setPhone(rs.getString("phone"));
    u.setEmail(rs.getString("email"));
    u.setPassword(rs.getString("password"));
    return u;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 목록 전용 경량 DTO (비밀번호 제외)
  public static class UserRow {
    public final String user_id;
    public final String name;
    public final String phone;
    public final String email;
    public UserRow(String user_id, String name, String phone, String email) {
      this.user_id = user_id;
      this.name = name;
      this.phone = phone;
      this.email = email;
    }
  }

  // ───────────── CRUD ─────────────

  @Override
  public List<User> findAll() {
    final String sql = UsersSql.selectAll(); // SELECT * 또는 password 포함 컬럼
    List<User> list = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql);
         ResultSet rs = ps.executeQuery()) {
      while (rs.next()) list.add(mapRow(rs));
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return list;
  }

  /**
   * 관리자 목록 화면 등에서 사용하는 "비밀번호 제거된" 목록.
   * 컬럼: user_id, name, phone, email
   */
  public List<UserRow> findAllForAdminList() {
    final String sql = """
        SELECT user_id, name, phone, email
          FROM users
         ORDER BY user_id
        """;
    List<UserRow> list = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql);
         ResultSet rs = ps.executeQuery()) {
      while (rs.next()) {
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
    return list;
  }

  /** PK(user_id) 단건 조회 */
  @Override
  public Optional<User> findById(String userId) {
    final String sql = UsersSql.selectById();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      try (ResultSet rs = ps.executeQuery()) {
        if (rs.next()) return Optional.of(mapRow(rs));
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return Optional.empty();
  }

  /** 이메일 단건 조회 */
  @Override
  public Optional<User> findByEmail(String email) {
    final String sql = UsersSql.selectByEmail();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, email);
      try (ResultSet rs = ps.executeQuery()) {
        if (rs.next()) return Optional.of(mapRow(rs));
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return Optional.empty();
  }

  /**
   * INSERT
   * @return 성공 시 생성된 PK(user_id), 실패 시 null
   */
  @Override
  public String insert(User entity) {
    final String sql = UsersSql.insert();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {

      ps.setString(1, entity.getUserId());
      ps.setString(2, entity.getName());
      if (entity.getPhone() == null) ps.setNull(3, java.sql.Types.VARCHAR);
      else                           ps.setString(3, entity.getPhone());
      ps.setString(4, entity.getEmail());
      ps.setString(5, entity.getPassword());

      int rows = ps.executeUpdate();
      return rows > 0 ? entity.getUserId() : null;
    } catch (SQLException e) {
      e.printStackTrace();
      return null;
    }
  }

  /** 부분 업데이트(COALESCE) */
  @Override
  public int update(String userId, User patch) {
    final String sql = UsersSql.update();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {

      ps.setString(1, patch.getName());
      ps.setString(2, patch.getPhone());
      ps.setString(3, patch.getEmail());
      ps.setString(4, patch.getPassword());
      ps.setString(5, userId);

      return ps.executeUpdate();
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }

  /** 삭제 */
  @Override
  public int delete(String userId) {
    final String sql = UsersSql.delete();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      return ps.executeUpdate();
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }
}
