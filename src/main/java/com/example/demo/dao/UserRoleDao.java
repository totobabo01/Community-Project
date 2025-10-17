// users_roles 테이블 DAO 구현체 (순수 JDBC)
package com.example.demo.dao;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;                   
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;

import com.example.demo.sql.UsersRolesSql;

@Repository(UserRoleDao.BEAN_QUALIFIER)
public class UserRoleDao implements IUserRoleDao {

  public static final String BEAN_QUALIFIER = "userRoleDao";

  @Value("${app.db.url}")      private String url;
  @Value("${app.db.username}") private String username;
  @Value("${app.db.password}") private String password;

  // ───────────────────── insert / delete ─────────────────────

  @Override
  public int insertUserRole(String userId, String roleId) {
    final String sql = UsersRolesSql.insertUserRole(); // INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      ps.setString(2, roleId);
      return ps.executeUpdate(); // 1=성공, 0=실패
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }

  @Override
  public int deleteUserRolesByUserId(String userId) {
    final String sql = UsersRolesSql.deleteUserRolesByUserId(); // DELETE FROM users_roles WHERE user_id=?
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      return ps.executeUpdate();
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }

  @Override
  public int deleteOneRole(String userId, String roleId) {
    final String sql = UsersRolesSql.deleteOneRole(); // DELETE FROM users_roles WHERE user_id=? AND role_id=?
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      ps.setString(2, roleId);
      return ps.executeUpdate();
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }

  // ───────────────────── select ─────────────────────

  @Override
  public List<String> findRolesByUserId(String userId) {
    final String sql = UsersRolesSql.findRolesByUserId(); // SELECT role_id FROM users_roles WHERE user_id=?
    List<String> roles = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          roles.add(rs.getString("role_id"));
        }
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return roles;
  }

  @Override
  public List<String> findRolesByEmail(String email) {
    final String sql = UsersRolesSql.findRolesByEmail(); // JOIN users u ON u.user_id=ur.user_id WHERE u.email=?
    List<String> roles = new ArrayList<>();
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, email);
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          // SELECT ur.role_id ... 로 가져오므로 컬럼명은 role_id 사용 가능
        roles.add(rs.getString("role_id"));
        }
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return roles;
  }
}
