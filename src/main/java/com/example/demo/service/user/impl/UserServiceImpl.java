// src/main/java/com/example/demo/service/user/impl/UserServiceImpl.java   // 표준 소스 경로 + 파일명

package com.example.demo.service.user.impl;                                // 서비스 구현 클래스 패키지

import java.util.List;                                                    // 목록 반환용 컬렉션 인터페이스
import java.util.Optional;                                                // 널-안전 단건 반환 컨테이너
import java.util.UUID;                                                    // 랜덤 고유값 생성 유틸(임시 PK/패스워드 등)
import java.util.stream.Collectors;                                       // Stream → List 수집 유틸

import org.springframework.beans.factory.annotation.Qualifier;            // 동일 타입 빈 중 특정 빈 선택 주입
import org.springframework.stereotype.Service;                            // 서비스 컴포넌트 스테레오타입 애너테이션

import com.example.demo.dao.IUserDao;                                     // 사용자 DAO 인터페이스(영속 계층)
import com.example.demo.dao.UserDao;                                      // 구현체의 @Qualifier 상수 사용을 위해 import
import com.example.demo.domain.User;                                      // 영속 모델(도메인 엔티티)
import com.example.demo.dto.UserDTO;                                      // 표현/전송 모델(DTO)
import com.example.demo.service.user.IUserService;                        // 서비스 계층 인터페이스(계약)

/**
 * 사용자 서비스 구현
 * - 컨트롤러와 DAO 사이에서 **검증/변환/비즈니스 규칙**을 처리
 * - 비밀번호 해시, 트랜잭션, 권한 부여 등은 상황에 따라 이 레이어에서 담당
 */
@Service(UserServiceImpl.BEAN_QUALIFIER)                                  // 스프링 컨테이너에 서비스 빈 등록(이름 지정)
public class UserServiceImpl implements IUserService {                    // IUserService 계약 구현체

  public static final String BEAN_QUALIFIER = "userService";              // @Qualifier에서 사용할 빈 이름 상수

  private final IUserDao userDao;                                         // 사용자 DAO 의존성

  public UserServiceImpl(@Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao) {
    this.userDao = userDao;                                               // 생성자 주입(권장)으로 의존성 확정
  }

  // ────────────── DTO ↔ Entity 변환 유틸 ──────────────
  private static UserDTO toDTO(User u) {                                  // 엔티티 → DTO 변환
    if (u == null) return null;                                           // 널 가드
    UserDTO d = new UserDTO();                                            // 빈 DTO 생성
    d.setUserId(u.getUserId());     // ← camelCase                        // PK 복사
    d.setName(u.getName());                                               // 이름 복사
    d.setPhone(u.getPhone());                                             // 전화 복사
    d.setEmail(u.getEmail());                                             // 이메일 복사
    // d.setPassword(...)는 **하지 않음**                                  // 비밀번호는 응답 금지(보안)
    return d;                                                             // 변환된 DTO 반환
  }

  private static User toEntity(UserDTO d) {                               // DTO → 엔티티 변환
    if (d == null) return null;                                           // 널 가드
    User u = new User();                                                  // 빈 엔티티 생성
    u.setUserId(d.getUserId());     // ← camelCase                        // PK 복사(미지정 시 나중에 생성)
    u.setName(d.getName());                                                 // 이름 복사
    u.setPhone(d.getPhone());                                               // 전화 복사
    u.setEmail(d.getEmail());                                               // 이메일 복사
    // u.setPassword(...)는 별도 로직에서 처리                               // 비밀번호 인코딩/설정은 서비스 정책에 따라
    return u;                                                             // 변환된 엔티티 반환
  }

  // ────────────── IUserService 구현 ──────────────

  @Override
  public List<UserDTO> getUsers() {                                       // 전체 사용자 조회
    return userDao.findAll()                                              // DAO에서 엔티티 목록 조회
                  .stream()                                               // Stream 변환
                  .map(UserServiceImpl::toDTO)                            // 각 엔티티를 DTO로 변환
                  .collect(Collectors.toList());                          // List 수집 후 반환
  }

  @Override
  public Optional<UserDTO> getUser(String userId) {                       // PK(user_id)로 단건 조회
    return userDao.findById(userId)                                       // DAO가 Optional<User> 반환
                  .map(UserServiceImpl::toDTO);                           // 있으면 DTO로 변환해 Optional<UserDTO>
  }

  @Override
  public Optional<UserDTO> create(UserDTO in) {                           // 사용자 생성(use-case)
    // ── 1) 최소 입력 검증 ──────────────────────────────────────────────
    if (in == null || in.getName() == null || in.getName().isBlank()      // 이름 필수
        || in.getEmail() == null || in.getEmail().isBlank()) {            // 이메일 필수
      return Optional.empty();                                            // 필수값 미충족 → 실패
    }

    // ── 2) PK 생성(스키마: VARCHAR(16)) ─────────────────────────────────
    String userId = UUID.randomUUID().toString().replace("-", "");        // 32자 랜덤(하이픈 제거)
    if (userId.length() > 16) userId = userId.substring(0, 16);           // 길이 제한 맞춤(16자)

    // ── 3) DTO → 엔티티로 변환 + 생성 값 주입 ────────────────────────────
    User u = toEntity(in);                                                // 변환
    u.setUserId(userId);                                                  // 생성된 PK 설정

    // ── 4) 임시 비밀번호 설정(로그인용 아님) ─────────────────────────────
    //  - 현재 설계에선 NOT NULL 제약을 만족시키기 위한 값
    //  - 실제 로그인 사용자라면 AuthService에서 BCrypt로 인코딩해야 함
    u.setPassword("TEMP-" + UUID.randomUUID()                             // "TEMP-" 접두 + 랜덤 10자
        .toString().replace("-", "").substring(0, 10));                   // (해시 아님 주의)

    // ── 5) 저장 수행 ────────────────────────────────────────────────────
    String created = userDao.insert(u);                                   // 성공 시 생성된 PK(user_id) 반환
    if (created == null) return Optional.empty();                         // 실패 시 empty

    // ── 6) 재조회 후 DTO로 반환(정합성/기본값 반영) ─────────────────────
    return userDao.findById(created).map(UserServiceImpl::toDTO);         // 최종 DTO 반환
  }

  @Override
  public boolean update(String userId, UserDTO in) {                      // 부분 업데이트(use-case)
    // name/phone/email만 패치(COALESCE 전략: null이면 기존값 유지)
    User patch = new User();                                              // 패치 전용 엔티티(널 허용)
    patch.setName(in != null ? in.getName() : null);                      // 이름(널 → 유지)
    patch.setPhone(in != null ? in.getPhone() : null);                    // 전화(널 → 유지)
    patch.setEmail(in != null ? in.getEmail() : null);                    // 이메일(널 → 유지)
    // 비밀번호 변경은 별도 로직에서만 처리(해시 필요)
    return userDao.update(userId, patch) > 0;                             // 영향 행 수 > 0 → 성공
  }

  @Override
  public boolean delete(String userId) {                                  // 삭제(use-case)
    return userDao.delete(userId) > 0;                                    // 영향 행 수 > 0 → 성공
  }
}
