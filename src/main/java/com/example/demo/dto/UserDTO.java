package com.example.demo.dto; // DTO가 소속된 패키지 경로(모듈/네임스페이스 구분, 컴포넌트 스캔과 무관)

// JDBC TIMESTAMP와 매핑되는 자바 타입(타임존 정보 없음, DB의 TIMESTAMP 컬럼과 호환)
import java.sql.Timestamp;

/**
 * 사용자 DTO (Controller ↔ Service 경계에서만 사용)
 * DAO/영속 계층은 이 DTO에 의존하지 않습니다.
 * - DTO(Data Transfer Object): 계층 간 데이터 전달을 위한 순수 값 객체
 * - 엔티티(User)와 분리해, 외부 노출 형태와 내부 도메인 모델을 독립적으로 유지
 */
public class UserDTO {            // public: 다른 패키지(컨트롤러/서비스)에서도 자유롭게 사용 가능
  private Long id;               // PK 식별자. Long을 사용해 null(미생성/미할당 상태) 표현 가능
  private String name;           // 사용자 이름. 형식/길이 검증은 보통 서비스/컨트롤러 레벨에서 수행
  private String email;          // 이메일 주소. 중복/형식 검증은 서비스/DB 제약으로 처리
  private Timestamp created_at;  // 생성 시각(DB TIMESTAMP 매핑). 서버 기준 시간으로 채우는 것이 일반적

  public UserDTO() {}            // 기본 생성자: 역직렬화(Jackson)/리플렉션/프레임워크 바인딩에 필수

  public Long getId() { return id; }                 // id 게터: 직렬화/뷰 변환 시 사용
  public void setId(Long id) { this.id = id; }       // id 세터: 컨트롤러/서비스에서 값 주입

  public String getName() { return name; }           // name 게터
  public void setName(String name) { this.name = name; } // name 세터

  public String getEmail() { return email; }         // email 게터
  public void setEmail(String email) { this.email = email; } // email 세터

  public Timestamp getCreated_at() { return created_at; } // created_at 게터
  public void setCreated_at(Timestamp created_at) { this.created_at = created_at; } // created_at 세터
}
