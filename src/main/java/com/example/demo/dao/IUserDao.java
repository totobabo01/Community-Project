// src/main/java/com/example/demo/dao/IUserDao.java                 // 표준 Maven/Gradle 경로 + 파일명

package com.example.demo.dao;                                      // DAO 인터페이스가 속한 패키지(네임스페이스)

import java.util.List;                                             // 다건(목록) 조회 결과를 담는 컬렉션 타입
import java.util.Optional;                                         // 단건 조회 시 "없음"을 안전하게 표현하는 래퍼 타입

import com.example.demo.domain.User;                               // users 테이블과 매핑되는 도메인 엔티티 클래스

/**
 * users 테이블 DAO 규약(포트) 정의
 *
 * 스키마 가정
 *  - PK: user_id (VARCHAR(16))  ← 애플리케이션에서는 String 타입으로 다룸
 *  - 컬럼: user_id, name, phone, email(UNIQUE), password(해시 저장)
 *
 * 이 인터페이스는 "무엇을 할 수 있는가"만 정의하고,
 * "어떻게 할 것인가"(SQL, ORM 매핑 등)는 구현체가 담당합니다.
 */
public interface IUserDao {                                        // users 테이블에 대한 CRUD 규약 선언(계약/포트)

    /** 전체 사용자 조회
     *  - 정렬(예: user_id ASC, created_at DESC 등)은 구현체 책임
     *  - 레코드가 없으면 빈 리스트 반환(절대 null 아님이 바람직)
     */
    List<User> findAll();                                          // 모든 사용자 행 반환

    /** PK(user_id)로 단건 조회
     *  - 존재하면 Optional.of(User), 없으면 Optional.empty()
     *  - NPE 방지 및 "없음"을 명시적으로 표현
     */
    Optional<User> findById(String userId);                        // user_id로 한 건 조회

    /** 이메일로 단건 조회(로그인/중복 체크 등에서 활용)
     *  - UNIQUE 제약을 가정하므로 0 또는 1건만 나와야 정상
     */
    Optional<User> findByEmail(String email);                      // email 기준 조회

    /**
     * INSERT
     * - user.userId(=PK)는 애플리케이션에서 생성하여 전달(예: 화면 입력 검증 후)
     * - 성공 시 생성된 PK(user_id)를 그대로 반환
     * - 실패 시 null 반환(혹은 예외를 던지도록 구현해도 됨: 팀 규약에 맞추기)
     *   · 예: 중복키/제약조건 위반 시 예외 → 상위에서 409 처리
     */
    String insert(User user);                                      // 신규 사용자 저장 결과로 user_id 또는 null 반환

    /** 부분 업데이트(Partial Update)
     * - patch 객체에서 null인 필드는 기존 값을 유지(COALESCE/Dynamic SQL 전략)
     * - 반환값은 영향 행 수(0: 대상 없음, 1: 성공)
     * - 비밀번호/이메일 변경 정책(검증/중복 체크)은 서비스 계층에서 선행 권장
     */
    int update(String userId, User patch);                         // 일부 필드만 갱신

    /** 삭제
     * - user_id로 1건 삭제
     * - 반환: 영향 행 수(0: 없음, 1: 성공)
     * - FK 제약(예: users_roles)이 있으면 트랜잭션 내 선삭제 필요
     */
    int delete(String userId);                                     // 단건 삭제

    // ---- 편의 메서드(디폴트 구현) ----
    /** 이메일 존재 여부 헬퍼
     *  - 구현체의 findByEmail을 재사용
     *  - 호출 측에선 간단히 boolean으로 중복 체크 가능
     */
    default boolean existsByEmail(String email) {
        return findByEmail(email).isPresent();                     // Optional의 존재 여부로 판단
    }

    /** user_id 존재 여부 헬퍼
     *  - 구현체의 findById를 재사용
     */
    default boolean existsById(String userId) {
        return findById(userId).isPresent();                       // 존재하면 true
    }
}
