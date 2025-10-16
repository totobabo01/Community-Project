package com.example.demo.controller;                       // 컨트롤러 클래스가 속한 패키지

import org.springframework.http.ResponseEntity;            // HTTP 상태코드/본문 래퍼 타입
import org.springframework.security.core.Authentication;   // 현재 로그인 사용자 정보(주체/권한 등)
import org.springframework.web.bind.annotation.DeleteMapping; // HTTP DELETE 매핑 애너테이션
import org.springframework.web.bind.annotation.RestController; // REST 컨트롤러(메서드 반환값을 JSON/응답으로 직렬화)

import com.example.demo.auth.MemberDao;                    // 계정 CRUD를 담당하는 DAO 인터페이스

@RestController                                            // 이 클래스를 REST 컨트롤러로 등록
public class AccountController {

    private final MemberDao memberDao;                     // 데이터 접근 계층 의존성

    public AccountController(MemberDao memberDao) {        // 생성자 주입(스프링이 빈을 주입)
        this.memberDao = memberDao;                        // 필드 할당
    }

    /**
     * ✅ 본인 계정 탈퇴(로그인 필요)
     * - DELETE /api/me
     * - 성공: 204(No Content)
     */
    @DeleteMapping("/api/me")                              // DELETE /api/me 요청을 이 메서드에 매핑
    public ResponseEntity<Void> deleteMe(Authentication auth) { // Authentication을 파라미터로 받아 현재 사용자 확인
        if (auth == null || !auth.isAuthenticated()) {     // 인증 정보가 없거나 미인증이면
            return ResponseEntity.status(401).build();     // 401 Unauthorized 반환
        }
        String username = auth.getName();                  // 현재 로그인된 사용자명(Principal 이름) 추출
        int rows = memberDao.deleteByUsername(username);   // DAO로 해당 사용자 레코드 삭제 시도(영향 행 수 반환)
        return (rows == 1) ? ResponseEntity.noContent().build() // 삭제 성공(1건) → 204 No Content
                           : ResponseEntity.notFound().build();  // 대상 없음(0건) → 404 Not Found
    }
}
