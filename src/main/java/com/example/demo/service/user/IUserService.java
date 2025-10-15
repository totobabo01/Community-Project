package com.example.demo.service.user;                // 서비스 계층 패키지: 컨트롤러가 의존하는 비즈니스 로직 인터페이스들이 위치

import java.util.List;                                // 여러 사용자 DTO를 담아 반환할 때 사용할 컬렉션 타입
import java.util.Optional;                            // 값의 존재/부재를 명시적으로 표현하기 위한 컨테이너

import com.example.demo.dto.UserDTO;                  // 컨트롤러 ↔ 서비스 경계에서 사용하는 데이터 전달 객체(DTO)

/**
 * 사용자 도메인에 대한 서비스 인터페이스.
 * 컨트롤러는 구현체(예: UserServiceImpl)가 아닌 이 인터페이스에만 의존함으로써 결합도를 낮춤.
 * 트랜잭션, 검증, DTO↔엔티티 변환 등 비즈니스 규칙의 "계약"을 정의한다.
 */
public interface IUserService {                       // 사용자 기능(읽기/쓰기)을 추상화한 서비스 계약

  List<UserDTO> getUsers();                           // 전체 사용자 목록 조회: 비어 있을 수 있으므로 빈 리스트 가능(Null 반환 금지)

  Optional<UserDTO> getUser(Long id);                 // PK로 단건 조회: 없을 수 있어 Optional로 감쌈(Null 대신 empty 사용)

  Optional<UserDTO> create(UserDTO in);               // 사용자 생성: 성공 시 생성된 최종 상태의 사용자 DTO, 실패 시 Optional.empty
                                                      // (예: 유효성 실패/DB 제약 위반/예외 변환 등)

  boolean update(Long id, UserDTO in);                // 부분 업데이트: 영향 행 수 > 0 이면 true(성공), 0이면 false(대상 없음/실패)
                                                      // 구현체에서 null 필드는 유지(DAO의 COALESCE 전략과 연동) 같은 규칙을 적용

  boolean delete(Long id);                            // 삭제: 영향 행 수 > 0 이면 true(성공), 0이면 false(대상 없음)
                                                      // 존재하지 않는 id 삭제 시 false로 신호
}
