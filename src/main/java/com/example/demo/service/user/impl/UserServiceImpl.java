// 사용자 도메인 서비스 구현체: 컨트롤러 ↔ DAO 사이에서 비즈니스 로직/트랜잭션 경계
package com.example.demo.service.user.impl;                         // 이 클래스의 패키지(스프링이 컴포넌트 스캔할 때 사용)

import java.sql.Timestamp;                                          // LocalDateTime ↔ DB TIMESTAMP 변환 시 사용
import java.time.LocalDateTime;                                     // 애플리케이션 내부 시간 표현(서버 현재 시각 등)
import java.util.List;                                              // 목록 반환 시 사용할 List 인터페이스
import java.util.Optional;                                          // 값의 존재/부재를 명시적으로 표현
import java.util.stream.Collectors;                                  // Stream -> List 수집에 사용

import org.springframework.beans.factory.annotation.Qualifier;       // 동일 타입 빈 여러 개일 때 특정 빈을 지목해 주입
import org.springframework.stereotype.Service;                       // 서비스 스테레오타입(빈 등록)

import com.example.demo.dao.IUserDao;                                // DAO 추상화(데이터 접근 계층 인터페이스)
import com.example.demo.dao.UserDao;                                 // BEAN_QUALIFIER 상수 사용을 위한 import
import com.example.demo.domain.User;                                 // DAO가 다루는 엔티티(테이블과 1:1 매핑하는 POJO)
import com.example.demo.dto.UserDTO;                                 // 컨트롤러 ↔ 서비스 경계에서 사용하는 DTO
import com.example.demo.service.user.IUserService;                   // 서비스 계층 인터페이스(API 계약)

/**
 * 반환/의존 규칙 요약
 * - DAO는 엔티티(User)만 다룸, 서비스는 DTO ↔ 엔티티 변환 담당
 * - 생성/수정/삭제의 성공/실패 판단은 DAO의 rowsAffected 또는 생성 PK로 처리
 */
@Service(UserServiceImpl.BEAN_QUALIFIER)                            // 이 클래스를 "userService"라는 이름의 서비스 빈으로 등록
public class UserServiceImpl implements IUserService {               // IUserService 계약을 구현하는 구체 클래스

  public static final String BEAN_QUALIFIER = "userService";         // @Qualifier에서 사용할 빈 이름 상수

  private final IUserDao userDao;                                    // 데이터 접근을 위임할 DAO 의존성(인터페이스로 선언)

  public UserServiceImpl(@Qualifier(UserDao.BEAN_QUALIFIER)          // userDao라는 이름의 DAO 빈을 주입
                         IUserDao userDao) {
    this.userDao = userDao;                                          // 생성자 주입으로 불변 의존성 확보
  }

  // =========================
  // DTO ↔ 엔티티 매핑 유틸
  // =========================

  /** 엔티티(User) → DTO(UserDTO) */
  private static UserDTO toDTO(User u) {                             // DAO에서 받은 User를 컨트롤러용 DTO로 변환
    if (u == null) return null;                                      // 방어 로직: null이면 null 반환
    UserDTO d = new UserDTO();                                       // 비어있는 DTO 생성
    d.setId(u.getId());                                              // PK 복사
    d.setName(u.getName());                                          // 이름 복사
    d.setEmail(u.getEmail());                                        // 이메일 복사
    if (u.getCreatedAt() != null) {                                  // 생성 시각이 있으면
      d.setCreated_at(Timestamp.valueOf(u.getCreatedAt()));          // LocalDateTime → Timestamp로 변환해 DTO에 설정
    }
    return d;                                                        // 변환된 DTO 반환
  }

  /** DTO(UserDTO) → 엔티티(User) */
  private static User toEntity(UserDTO d) {                          // 컨트롤러에서 받은 DTO를 DAO용 엔티티로 변환
    if (d == null) return null;                                      // 방어 로직: null이면 null 반환
    User u = new User();                                             // 비어있는 엔티티 생성
    u.setId(d.getId());                                              // PK 복사(일반적으로 생성 시엔 null)
    u.setName(d.getName());                                          // 이름 복사(부분 업데이트 시 null일 수 있음)
    u.setEmail(d.getEmail());                                        // 이메일 복사(부분 업데이트 시 null일 수 있음)

    // created_at 호환 (Timestamp / LocalDateTime / String) — 입력 타입이 다양해도 수용
    Object raw = d.getCreated_at();                                  // DTO의 created_at을 Object로 받아 타입 판별
    if (raw instanceof Timestamp) {                                  // DB Timestamp가 그대로 왔을 때
      u.setCreatedAt(((Timestamp) raw).toLocalDateTime());           // LocalDateTime으로 변환 후 설정
    } else if (raw instanceof LocalDateTime) {                       // 이미 LocalDateTime이라면
      u.setCreatedAt((LocalDateTime) raw);                           // 그대로 설정
    } else if (raw instanceof String) {                              // 문자열(ISO-8601 가정)로 들어온 경우
      try {
        u.setCreatedAt(LocalDateTime.parse((String) raw));           // 파싱 성공 시 설정(예: "2025-10-13T16:45:00")
      } catch (Exception ignore) {                                   // 파싱 실패면
        u.setCreatedAt(null);                                        // 안전하게 null 처리(DAO/DB 기본값에 위임)
      }
    } else {
      u.setCreatedAt(null);                                          // 명시되지 않으면 null(서비스/DB 기본값 처리)
    }
    return u;                                                        // 변환된 엔티티 반환
  }

  // =========================
  // IUserService 구현
  // =========================

  /** 전체 사용자 조회 */
  @Override
  public List<UserDTO> getUsers() {                                  // 컨트롤러에서 호출하는 목록 조회 API
    return userDao.findAll()                                         // DAO에서 List<User> 수집
                  .stream()                                          // 스트림으로 변환
                  .map(UserServiceImpl::toDTO)                       // 각 엔티티를 DTO로 변환
                  .collect(Collectors.toList());                     // List<UserDTO>로 수집해 반환
  }

  /** ID로 단건 조회 (없으면 Optional.empty) */
  @Override
  public Optional<UserDTO> getUser(Long id) {                        // PK로 조회하는 API
    return userDao.findById(id)                                      // DAO가 Optional<User> 반환
                   .map(UserServiceImpl::toDTO);                     // 존재하면 DTO로 변환, 없으면 empty 유지
  }

  /** 사용자 생성: 성공 시 생성된 사용자 DTO 반환, 실패 시 Optional.empty */
  @Override
  public Optional<UserDTO> create(UserDTO in) {                      // 새 사용자 생성 API
    User toSave = toEntity(in);                                      // DTO → 엔티티 변환(널 허용 필드는 그대로 전달)

    // createdAt 미지정 시 서버 현재 시각으로 보정
    // (DAO가 DB DEFAULT를 쓰더라도 서비스에서 일관 규칙을 보장)
    if (toSave.getCreatedAt() == null) {                             // 입력에 생성시각이 없으면
      toSave.setCreatedAt(LocalDateTime.now());                      // 서버 현재 시각을 기본값으로 사용
    }

    long id = userDao.insert(toSave);                                // DAO가 INSERT 후 생성된 PK를 반환(실패 시 0)
    if (id <= 0) return Optional.empty();                            // 실패면 empty로 컨트롤러에 신호

    // 트리거/DEFAULT 컬럼 반영을 위해 다시 조회하여 최신 상태 반환
    return userDao.findById(id)                                      // PK로 재조회
                  .map(UserServiceImpl::toDTO);                      // DTO로 변환해 Optional<UserDTO>로 반환
  }

  /** 사용자 수정(부분 업데이트): 성공 여부 반환 */
  @Override
  public boolean update(Long id, UserDTO in) {                       // 부분 수정 API(null 필드는 유지)
    User patch = toEntity(in);                                       // DTO → 엔티티(널 값 그대로 전달)
    return userDao.update(id, patch) > 0;                            // DAO 영향 행 수가 1 이상이면 성공(true)
  }

  /** 사용자 삭제: 성공 여부 반환 */
  @Override
  public boolean delete(Long id) {                                   // 삭제 API
    return userDao.delete(id) > 0;                                   // DAO 영향 행 수가 1 이상이면 성공(true)
  }
}
