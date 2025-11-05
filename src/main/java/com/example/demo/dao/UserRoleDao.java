// src/main/java/com/example/demo/dao/UserRoleDao.java                // 표준 Maven/Gradle 경로 + 파일명

// users_roles 테이블 DAO 구현체 (순수 JDBC)                          // 이 클래스가 다루는 대상과 구현 방식(순수 JDBC)을 명시
package com.example.demo.dao;                                        // DAO 클래스가 속한 패키지(네임스페이스)

import java.sql.Connection;                                          // JDBC 커넥션 타입
import java.sql.DriverManager;                                       // 커넥션 풀 없이 직접 커넥션 여는 유틸
import java.sql.PreparedStatement;                                   // 파라미터 바인딩 가능한 SQL 문
import java.sql.ResultSet;                                           // SELECT 결과 집합 커서
import java.sql.SQLException;                                        // JDBC 작업 중 발생하는 체크 예외 타입
import java.util.ArrayList;                                          // 가변 리스트 구현체
import java.util.List;                                               // 리스트 인터페이스

import org.springframework.beans.factory.annotation.Value;           // application.properties 값 주입(@Value)
import org.springframework.stereotype.Repository;                    // 영속 계층 컴포넌트 스테레오타입

import com.example.demo.sql.UsersRolesSql;                           // users_roles 관련 SQL 문자열 제공 유틸(정적 메서드 모음)

@Repository(UserRoleDao.BEAN_QUALIFIER)                              // 스프링 빈으로 등록 + 빈 이름 지정(qualifier용)
public class UserRoleDao implements IUserRoleDao {                   // IUserRoleDao 계약을 구현하는 구체 클래스

  public static final String BEAN_QUALIFIER = "userRoleDao";         // @Qualifier에서 사용할 빈 이름 상수

  @Value("${app.db.url}")      private String url;                   // DB 접속 URL(예: jdbc:mysql://...)
  @Value("${app.db.username}") private String username;              // DB 사용자명
  @Value("${app.db.password}") private String password;              // DB 비밀번호

  // ───────────────────── insert / delete ─────────────────────

  @Override
  public int insertUserRole(String userId, String roleId) {          // 사용자-권한 매핑 1건 추가
    final String sql = UsersRolesSql.insertUserRole();               // "INSERT INTO users_roles(user_id, role_id) VALUES (?, ?)"
    // getConnection은 데이터베이스(DB)에 접속(연결) 객체를 생성해서 돌려주는 메서드
    try (Connection c = DriverManager.getConnection(url, username, password); // 커넥션 오픈(try-with-resources로 자동 close)
         PreparedStatement ps = c.prepareStatement(sql)) {           // 프리페어드 스테이트먼트 생성
      ps.setString(1, userId);                                       // 1번 파라미터 바인딩: user_id
      ps.setString(2, roleId);                                       // 2번 파라미터 바인딩: role_id("USER"/"ADMIN" 등)
      // executeUpdate()는 JDBC에서 INSERT/UPDATE/DELETE/DDL을 실행할 때 쓰는 메서드
      return ps.executeUpdate();                                     // 영향 행 수 반환(성공 1, 중복/제약 위반 시 0 또는 예외)
    } catch (SQLException e) {                                       // JDBC 오류 처리
      e.printStackTrace();                                           // 콘솔 로깅(실무에선 로거 사용 권장)
      return 0;                                                      // 예외가 났으면 0으로 실패 신호 반환
    }
  }

  @Override
  public int deleteUserRolesByUserId(String userId) {                // 특정 사용자에게 부여된 모든 역할 삭제
    final String sql = UsersRolesSql.deleteUserRolesByUserId();      // "DELETE FROM users_roles WHERE user_id=?"
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);                                       // WHERE user_id = ?
      return ps.executeUpdate();                                     // 삭제된 행 수(0~N) 반환
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;                                                      // 실패 시 0
    }
  }

  @Override
  public int deleteOneRole(String userId, String roleId) {           // 특정 사용자에게서 특정 역할만 제거
    final String sql = UsersRolesSql.deleteOneRole();                // "DELETE FROM users_roles WHERE user_id=? AND role_id=?"
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);                                       // WHERE user_id = ?
      ps.setString(2, roleId);                                       //   AND role_id = ?
      return ps.executeUpdate();                                     // 성공 1, 대상 없음 0
    } catch (SQLException e) {
      e.printStackTrace();
      return 0;
    }
  }

  // ───────────────────── select ─────────────────────

  @Override
  public List<String> findRolesByUserId(String userId) {             // user_id 기준 권한 목록 조회
    final String sql = UsersRolesSql.findRolesByUserId();            // "SELECT role_id FROM users_roles WHERE user_id=?"
    List<String> roles = new ArrayList<>();                          // 결과를 담을 리스트
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, userId);                                       // 바인딩: user_id
      try (ResultSet rs = ps.executeQuery()) {                       // SELECT 실행
        while (rs.next()) {                                          // 결과 행을 순회하며
          roles.add(rs.getString("role_id"));                        // role_id 컬럼 값을 수집(예: "USER","ADMIN")
        }
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return roles;                                                    // 권한 문자열 목록 반환
  }

  @Override
  public List<String> findRolesByEmail(String email) {               // 이메일 기준 권한 목록 조회(조인 쿼리 사용)
    final String sql = UsersRolesSql.findRolesByEmail();             // "SELECT ur.role_id ... JOIN users u ON ... WHERE u.email=?"
    List<String> roles = new ArrayList<>();                          // 결과 리스트
    try (Connection c = DriverManager.getConnection(url, username, password);
         PreparedStatement ps = c.prepareStatement(sql)) {
      ps.setString(1, email);                                        // WHERE u.email = ?
      try (ResultSet rs = ps.executeQuery()) {
        while (rs.next()) {
          roles.add(rs.getString("role_id"));                        // 조인 결과에서 role_id 컬럼 추출
        }
      }
    } catch (SQLException e) {
      e.printStackTrace();
    }
    return roles;                                                    // 예: ["USER"], ["USER","ADMIN"]
  }
}
