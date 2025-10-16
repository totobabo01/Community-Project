package com.example.demo.controller;                         // 이 컨트롤러 클래스가 속한 패키지 선언

import java.util.List;                                       // 리스트 컬렉션 사용(권한 목록 반환용)

import org.springframework.http.ResponseEntity;              // HTTP 상태/본문을 캡슐화하는 응답 객체
import org.springframework.security.access.prepost.PreAuthorize; // 메서드/클래스 단위 권한 검사 애너테이션
import org.springframework.web.bind.annotation.GetMapping;            // REST 매핑 애너테이션들(@GetMapping, @PutMapping 등) 통합 임포트
import org.springframework.web.bind.annotation.PathVariable;                      // 계정/권한을 다루는 DAO 인터페이스 의존성
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.demo.auth.MemberDao;

@RestController                                              // 이 클래스를 REST 컨트롤러로 등록(JSON 직렬화 기본)
@RequestMapping("/api/roles")                                // 이 컨트롤러의 기본 URL prefix를 /api/roles 로 지정
@PreAuthorize("hasRole('ADMIN')")                            // 클래스 전체에 관리자 권한 필요(ROLE_ADMIN 보유자만 접근 허용)
public class RoleController {

    private final MemberDao memberDao;                       // DAO 의존성 필드(불변)

    public RoleController(MemberDao memberDao) {             // 생성자 주입(스프링이 MemberDao 빈을 주입)
        this.memberDao = memberDao;                          // 주입받은 DAO를 필드에 할당
    }

    /** 권한 목록: 전체 사용자(user_name), role, enabled 반환 */
    @GetMapping                                              // HTTP GET /api/roles 요청을 이 메서드에 매핑
    public List<RoleView> list() {                           // 반환 타입: RoleView DTO 목록
        return memberDao.findAll().stream()                  // DB에서 전체 사용자 조회 후 스트림 처리
                .map(m -> new RoleView(                      // 각 Member 엔티티를 화면용 RoleView DTO로 변환
                        m.getUsername(),                     // user_name(로그인 아이디)
                        m.getRole(),                         // 권한(ROLE_USER / ROLE_ADMIN)
                        m.isEnabled()                        // 활성(true)/비활성(false)
                ))
                .toList();                                   // 스트림을 리스트로 수집하여 반환
    }

    /**
     * 권한/활성화 변경
     * - body 예: { "role": "ROLE_ADMIN", "enabled": true }
     * - role 또는 enabled 둘 중 하나만 보내도 동작
     */
    @PutMapping("/{username}")                               // HTTP PUT /api/roles/{username} 매핑(대상 사용자 path 변수)
    public ResponseEntity<?> update(                         // 다양한 결과(200/400/404)를 위해 와일드카드 응답
            @PathVariable String username,                   // 경로에서 사용자명 추출
            @RequestBody UpdateReq req) {                    // 요청 본문 JSON을 UpdateReq DTO로 매핑
        if (req == null) return                              // 본문이 없으면
                ResponseEntity.badRequest().body("empty body"); // 400 Bad Request와 메시지 반환

        boolean touched = false;                             // 실제로 변경이 발생했는지 추적 플래그

        // role 변경 (선택)
        if (req.role() != null) {                            // role 필드가 전달되었으면
            String r = req.role().trim().toUpperCase();      // 공백 제거 + 대문자 통일(검증/저장 일관성)
            if (!"ROLE_USER".equals(r) && !"ROLE_ADMIN".equals(r)) { // 허용 값 검증
                return ResponseEntity.badRequest().body(     // 유효하지 않으면
                        "role must be ROLE_USER or ROLE_ADMIN"); // 400과 오류 메시지
            }
            touched |= (memberDao.updateRole(username, r) == 1); // DAO로 role 업데이트하고, 성공(1행) 시 touched=true
        }

        // enabled 변경 (선택)
        if (req.enabled() != null) {                         // enabled 필드가 전달되었으면
            touched |= (memberDao.updateEnabled(             // DAO로 enabled 업데이트
                    username, req.enabled()) == 1);          // 성공 여부를 touched에 OR 대입
        }

        return touched                                       // 변경이 1건 이상 있었으면
                ? ResponseEntity.ok().build()                // 200 OK (본문 없음)
                : ResponseEntity.notFound().build();         // 대상 사용자 없음 혹은 변경 사항 없음 → 404 Not Found
    }

    // ---- DTOs ----
    public record RoleView(String username,                  // 목록 조회 응답용 DTO: 사용자명
                           String role,                      // 권한 문자열(ROLE_*)
                           boolean enabled) {}               // 활성 여부

    public record UpdateReq(String role,                     // 업데이트 요청 DTO: 바꿀 권한(선택)
                            Boolean enabled) {}              // 바꿀 활성 여부(선택, null이면 미변경)
}
