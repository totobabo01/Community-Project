package com.example.demo.auth;                 // 이 인터페이스가 속한 패키지. 폴더 구조와 매핑되며 컴포넌트 스캔/임포트 경로에 영향.

public interface MemberDao {                   // 영속성 계층(DAO)의 계약(Contract)을 정의하는 인터페이스. 구현체(JdbcMemberDao 등)가 이 규약을 따름.

    boolean existsByUsername(String username); // 주어진 username이 DB에 존재하는지 여부를 조회. 존재하면 true, 없으면 false 반환.

    Member findByUsername(String username);    // username으로 계정을 단건 조회. 있으면 Member를, 없으면 보통 null(또는 Optional 사용 가능)을 반환.

    Member save(Member m); // 저장 후 생성된 id를 채워 반환
                                              // 새 Member 레코드를 INSERT하고, DB가 생성한 PK(id)를 m에 세팅한 뒤 그 객체를 반환.
}
