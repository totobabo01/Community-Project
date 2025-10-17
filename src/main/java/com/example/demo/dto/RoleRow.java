// src/main/java/com/example/demo/dto/RoleRow.java
package com.example.demo.dto;

public class RoleRow {
  private String username; // user_id
  private String role;     // ROLE_ADMIN / ROLE_USER

  public RoleRow() {}
  public RoleRow(String username, String role) {
    this.username = username;
    this.role = role;
  }

  public String getUsername() { return username; }
  public void setUsername(String username) { this.username = username; }
  public String getRole() { return role; }
  public void setRole(String role) { this.role = role; }
}
