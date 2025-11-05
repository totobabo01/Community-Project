// src/main/java/com/example/demo/controller/AccountController.java           // 파일 경로: 패키지 구조와 일치
package com.example.demo.controller;                                        // 이 클래스가 속한 패키지

import java.util.Optional;                                                  // 값이 있을 수도/없을 수도 있는 컨테이너 타입

import org.springframework.beans.factory.annotation.Qualifier;              // 동일 타입 빈 다수일 때 특정 빈을 지목하기 위한 애너테이션
import org.springframework.http.ResponseEntity;                              // HTTP 상태코드 + 본문을 함께 다루는 응답 래퍼
import org.springframework.security.authentication.AnonymousAuthenticationToken; // 익명 인증 토큰 타입(비로그인/익명 사용자 식별용)
import org.springframework.security.core.Authentication;                     // 현재 인증 정보(주체, 권한, 인증여부 등)를 담는 인터페이스
import org.springframework.security.core.userdetails.UserDetails;            // 사용자 정보 표준 인터페이스(시큐리티)
import org.springframework.transaction.annotation.Transactional;             // 트랜잭션 경계를 지정하는 애너테이션
import org.springframework.web.bind.annotation.DeleteMapping;                // HTTP DELETE 메서드 매핑
import org.springframework.web.bind.annotation.RestController;               // @Controller + @ResponseBody(REST 컨트롤러)

import com.example.demo.dao.IUserDao;                                       // 사용자 DAO 인터페이스
import com.example.demo.dao.IUserRoleDao;                                   // 사용자-권한 매핑 DAO 인터페이스
import com.example.demo.dao.UserDao;                                        // 사용자 DAO 구현체(빈 이름 상수 제공)
import com.example.demo.dao.UserRoleDao;                                    // 사용자-권한 매핑 DAO 구현체(빈 이름 상수 제공)
import com.example.demo.domain.User;                                        // 도메인 엔티티(사용자)

                                                                             /**
                                                                              * 내 계정 관련 REST 엔드포인트
                                                                              *  - DELETE /api/me : 로그인한 "나"를 삭제(권한 매핑 → 사용자 순서)
                                                                              */
@RestController                                                             // JSON을 반환하는 REST 컨트롤러로 등록
public class AccountController {                                            // 클래스 시작

    private final IUserDao userDao;                                         // 사용자 CRUD 접근용 DAO
    private final IUserRoleDao userRoleDao;                                 // 사용자-권한 매핑 테이블 접근 DAO

    public AccountController(                                               // 생성자 주입(권장 방식)
            @Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao,            // 같은 타입의 빈이 여러 개일 때 특정 구현체를 지목
            @Qualifier(UserRoleDao.BEAN_QUALIFIER) IUserRoleDao userRoleDao // 위와 동일(역할 매핑 DAO)
    ) {
        this.userDao = userDao;                                             // 필드 초기화
        this.userRoleDao = userRoleDao;                                     // 필드 초기화
    }

    /**
     * 현재 로그인 사용자의 username(principal)을 안전하게 추출.
     * - UserDetails가 있으면 getUsername()
     * - 아니면 Authentication.getName()
     * - 익명/비인증은 null
     */
    private String currentUsername(Authentication auth) {                   // 인증 객체에서 username(주체) 추출 유틸
        if (auth == null) return null;                                      // 인증 컨텍스트 자체가 없으면 null
        if (!auth.isAuthenticated()) return null;                           // 인증 안 된 상태면 null
        if (auth instanceof AnonymousAuthenticationToken) return null;      // 익명 토큰(비로그인)도 null

        Object principal = auth.getPrincipal();                             // 주체(Principal) 객체 얻기
        if (principal instanceof UserDetails ud) {                          // UserDetails 구현체라면
            return ud.getUsername();                                        // UserDetails 표준의 username 사용
        }
        return auth.getName(); // 폴백                                        // 그 외에는 Authentication.getName() 사용(보통 username)
    }

    /**
     * 내 계정 삭제.
     * - 401 : 미인증(또는 익명)
     * - 404 : 사용자 없음
     * - 204 : 삭제 성공
     */
    @DeleteMapping("/api/me")                                               // DELETE /api/me 엔드포인트
    @Transactional                                                          // 메서드 전체를 하나의 트랜잭션으로 처리
    public ResponseEntity<Void> deleteMe(Authentication auth) {             // 파라미터로 현재 인증 정보 주입받음
        // 1) 인증 확인 + principal 추출
        String username = currentUsername(auth);                            // 앞서 정의한 유틸로 안전하게 username 가져오기
        if (username == null || username.isBlank()) {                       // 없거나 빈 값이면
            return ResponseEntity.status(401).build();                      // 401 Unauthorized 반환(본문 없음)
        }

        // 2) username이 user_id일 수도, email일 수도 있으니 모두 시도
        //    우선 user_id로 조회 → 없으면 email로 조회
        Optional<User> found =                                              // Optional로 결과 래핑
            userDao.findById(username).or(() -> userDao.findByEmail(username));
                                                                             // user_id 우선 검색, 없으면 email로 대체 검색(람다 공급자)

        if (found.isEmpty()) {                                              // 두 방식 모두 못 찾은 경우
            return ResponseEntity.notFound().build();                       // 404 Not Found
        }

        User me = found.get();                                              // 실제 사용자 엔티티 획득

        // 3) FK 정합성을 위해 권한 매핑 먼저 제거 → 사용자 삭제 (한 트랜잭션)
        userRoleDao.deleteUserRolesByUserId(me.getUserId());                // 자식/매핑 테이블(ROLE 매핑) 먼저 삭제(FK 제약 충족)
        int rows = userDao.delete(me.getUserId());                          // 그 다음 실제 사용자 레코드 삭제(영향 행 수 반환)

        return (rows > 0) ? ResponseEntity.noContent().build()              // 삭제 성공 시 204 No Content
                          : ResponseEntity.notFound().build();              // race condition 등으로 이미 없으면 404
    }
}                                                                            // 클래스 종료
