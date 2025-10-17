// src/main/java/com/example/demo/dto/MeDTO.java
package com.example.demo.dto;

import java.util.List;

public class MeDTO {
  private String username;
  private List<String> roles;
  private boolean admin;

  public MeDTO(String username, List<String> roles) {
    this.username = username;
    this.roles = roles;
    this.admin = roles.stream().anyMatch(r -> r.equals("ROLE_ADMIN"));
  }
  public String getUsername() { return username; }
  public List<String> getRoles() { return roles; }
  public boolean isAdmin() { return admin; }
}
