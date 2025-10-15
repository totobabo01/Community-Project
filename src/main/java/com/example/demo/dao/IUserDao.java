// DAO(데이터 접근 계층) 인터페이스: users 테이블에 대한 CRUD 메서드 규약
package com.example.demo.dao;

import java.util.List;
import java.util.Optional;

import com.example.demo.domain.User; // ✅ DAO는 엔티티/POJO만 다룸 (DTO 의존 X)

/**
 * 반환 규칙
 * - 조회(SELECT): 존재 여부가 불확실하므로 Optional<User> 사용 (다건은 빈 리스트 가능)
 * - 쓰기(INSERT/UPDATE/DELETE):
 *    - insert(...)  → 생성된 PK(long). 실패/미생성 시 0
 *    - update(...)  → 영향 행 수(int). 0=대상 없음(미존재), 1=성공
 *    - delete(...)  → 영향 행 수(int). 0=대상 없음(미존재), 1=성공
 *
 * 업데이트는 "부분 업데이트" 패턴을 가정합니다.
 * patch로 전달된 필드가 null이면 해당 컬럼은 기존 값을 유지합니다.
 */
public interface IUserDao {

  /** 전체 조회: 정책(보통 id DESC)대로 정렬된 모든 사용자 */
  List<User> findAll();

  /** 단건 조회: PK(id)로 사용자 조회 (없으면 Optional.empty()) */
  Optional<User> findById(Long id);

  /**
   * 생성(INSERT): 사용자 레코드 저장.
   * @return 생성된 PK(성공) / 0(실패)
   */
  long insert(User user);

  /**
   * 수정(UPDATE, 부분 업데이트): null 필드는 유지.
   * @return 영향 행 수 (0=대상 없음, 1=성공)
   */
  int update(Long id, User patch);

  /**
   * 삭제(DELETE)
   * @return 영향 행 수 (0=대상 없음, 1=성공)
   */
  int delete(Long id);
}
