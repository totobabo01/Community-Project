// 도메인(엔티티) 클래스: users 테이블의 한 행을 애플리케이션에서 표현하는 순수 POJO
package com.example.demo.domain; // 이 클래스가 속한 패키지(스캔/네임스페이스/모듈 경계 구분에 사용)

import java.time.LocalDateTime;  // 시각 정보를 표현하기 위한 JSR-310 타입(타임존 정보는 없음)

/**
 * User 엔티티(도메인 모델).
 * - DB 레코드(users 테이블)의 컬럼들과 1:1로 매핑되는 필드들을 보유
 * - 현재 JPA 애너테이션은 없고, 순수 자바 객체(POJO)로 사용
 * - 서비스/DAO 계층 간에 데이터 전달/보관에 활용
 */
public class User {               // public: 패키지 밖에서도 사용 가능(컨트롤러/서비스/DAO 등에서 참조)

    private Long id;              // PK 식별자. Long(래퍼)을 쓰는 이유: null 허용(미저장/임시 객체 표현)
    private String name;          // 사용자 이름. DB의 VARCHAR 같은 문자 컬럼과 매핑
    private String email;         // 사용자 이메일. 고유 제약/검증은 서비스/DB에서 처리 가능
    private LocalDateTime createdAt; // 생성 시각. 타임존 없는 로컬 시각(저장/표시 정책은 별도 관리)

    public User() {}              // 기본 생성자(프레임워크/리플렉션/직렬화에서 필요. 값 채우기 전 빈 객체 생성 용)

    // 모든 필드를 한 번에 주입할 수 있는 편의 생성자(테스트/매핑 시 유용)
    public User(Long id, String name, String email, LocalDateTime createdAt) {
        this.id = id;             // this.id: 필드 / id: 매개변수 → 필드에 값 대입
        this.name = name;         // 이름 설정(널/공백 검증이 필요하면 서비스 계층에서 수행 권장)
        this.email = email;       // 이메일 설정(형식 검증/중복 체크는 서비스/DB 제약에서 처리)
        this.createdAt = createdAt; // 생성 시각 설정(널일 수 있음. 기본값 정책은 DAO/서비스에서 부여 가능)
    }

    // ---- JavaBean 표준 접근자/설정자(getter/setter): 스프링/Jackson/라이브러리들이 이 규약을 사용 ----

    public Long getId() { return id; }                 // id 읽기(직렬화/응답 변환 시 활용)
    public void setId(Long id) { this.id = id; }       // id 쓰기(DB 저장 후 생성된 키 주입 등)

    public String getName() { return name; }           // name 읽기
    public void setName(String name) { this.name = name; } // name 쓰기(검증은 상위 계층 권장)

    public String getEmail() { return email; }         // email 읽기
    public void setEmail(String email) { this.email = email; } // email 쓰기

    public LocalDateTime getCreatedAt() { return createdAt; } // 생성 시각 읽기
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; } // 생성 시각 쓰기
}
