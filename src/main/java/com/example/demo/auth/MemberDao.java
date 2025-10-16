package com.example.demo.auth;                 // DAO 인터페이스 파일이 속한 패키지 경로(컴포넌트 스캔/임포트 기준이 됨)

import java.util.List;                         // 목록 반환을 위해 표준 컬렉션 List 사용

/**
 * 영속성 계층(DAO)의 계약(Contract).
 * 구현체(JdbcMemberDao 등)는 아래 선언된 메서드 시그니처를 반드시 제공해야 함.
 */
public interface MemberDao {                   // 데이터 접근 로직을 규정하는 인터페이스(구현은 별도 클래스가 담당)

    /** 주어진 사용자명이 존재하는지 여부 */
    boolean existsByUsername(String username); // username을 PK로 조회하여 존재하면 true, 아니면 false 반환

    /** 사용자명으로 단건 조회(없으면 null 반환) */
    Member findByUsername(String username);    // username으로 계정을 한 건 읽어 Member 도메인 객체로 반환(없으면 null)

    /** 새 레코드 저장 후, 엔티티 반환 */
    Member save(Member m);                     // 전달된 Member를 DB에 INSERT하고(생성 시 기본 role/enable 포함) 동일 객체를 반환

    // ===== 권한(roles) / 계정 관리용 추가 메서드 =====

    /** 전체 사용자 목록 조회 */
    List<Member> findAll();                    // 권한 관리 화면 등에 사용: 모든 계정을 Member 리스트로 반환(정렬은 구현체에서)

    /**
     * 사용자 권한(role) 변경.
     * @param username 대상 사용자명
     * @param role     "ROLE_USER" 또는 "ROLE_ADMIN"
     * @return 변경된 행 수(정상 1, 대상 없음 0)
     */
    int updateRole(String username, String role); // accounts.role 값을 업데이트, 성공 시 1 반환

    /**
     * 사용자 활성화 여부(enabled) 변경.
     * @param username 대상 사용자명
     * @param enabled  true/false
     * @return 변경된 행 수(정상 1, 대상 없음 0)
     */
    int updateEnabled(String username, boolean enabled); // accounts.enabled 값을 업데이트, 성공 시 1 반환

    /**
     * 사용자 계정 삭제(자기 탈퇴용/관리자용 공통).
     * @param username 삭제할 사용자명
     * @return 삭제된 행 수(정상 1, 대상 없음 0)
     */
    int deleteByUsername(String username);     // username을 조건으로 DELETE 실행, 성공 시 1 반환(없으면 0)
}
