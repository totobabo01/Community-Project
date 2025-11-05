// src/main/java/com/example/demo/service/user/IUserService.java     // 표준 소스 경로 + 파일명

package com.example.demo.service.user;                               // 사용자 서비스 인터페이스가 속한 패키지(네임스페이스)

import java.util.List;                                              // 다건 결과를 담는 컬렉션 인터페이스
import java.util.Optional;                                          // 단건 조회 시 널-안전 반환을 위한 래퍼 타입

import com.example.demo.dto.UserDTO;                                 // 서비스 입출력에 사용할 사용자 DTO(표현/전송 모델)

/**
 * 사용자 관련 **비즈니스 로직**의 계약(인터페이스).
 * - 컨트롤러는 이 인터페이스에만 의존하고, 실제 구현은 스프링 빈으로 주입받는다.
 * - 구현 교체(예: JDBC → JPA, 외부 API 연동) 시에도 컨트롤러 코드는 변경 없이 유지 가능.
 */
public interface IUserService {                                      // 사용자 도메인 유스케이스 집합의 계약 선언

  List<UserDTO> getUsers();                                          // 전체 사용자 목록 반환(보통 페이징/정렬은 별도 인자로 확장)

  Optional<UserDTO> getUser(String userId);                          // PK(userId)로 단건 조회(없으면 Optional.empty로 안전 처리)

  Optional<UserDTO> create(UserDTO in);                               // 사용자 생성(성공 시 생성된 DTO, 실패 시 empty)
                                                                      //  └ 필요 시 스펙을 확장해 in.userId를 클라이언트가 직접 지정하도록 할 수도 있음

  boolean update(String userId, UserDTO in);                          // 부분 업데이트(널 필드는 유지하도록 구현하는 것이 일반적: COALESCE 전략)

  boolean delete(String userId);                                      // 사용자 삭제(성공 true / 실패 false를 간단히 리턴)
}
