// src/main/java/com/example/demo/controller/BoardController.java

package com.example.demo.controller;                                  // 컨트롤러 클래스가 속한 패키지

import java.util.List;                                                // 목록 타입 사용을 위한 import

import org.springframework.http.HttpStatus;                           // HTTP 상태코드 상수(403/404 등) 사용
import org.springframework.http.ResponseEntity;                       // 응답 본문/상태를 함께 반환할 때 사용
import org.springframework.security.core.Authentication;              // 현재 인증 정보(로그인 사용자/권한) 접근 인터페이스
import org.springframework.security.core.GrantedAuthority;            // 권한 한 개(예: "ROLE_ADMIN") 표현 타입
import org.springframework.web.bind.annotation.DeleteMapping;         // HTTP DELETE 매핑 애너테이션
import org.springframework.web.bind.annotation.GetMapping;            // HTTP GET 매핑 애너테이션
import org.springframework.web.bind.annotation.PathVariable;          // URL 경로 변수 바인딩(/{id} 등)
import org.springframework.web.bind.annotation.PostMapping;           // HTTP POST 매핑 애너테이션
import org.springframework.web.bind.annotation.PutMapping;            // HTTP PUT 매핑 애너테이션
import org.springframework.web.bind.annotation.RequestBody;           // 요청 JSON 본문을 객체로 바인딩
import org.springframework.web.bind.annotation.RequestMapping;        // 공통 URL prefix 지정
import org.springframework.web.bind.annotation.RequestParam;          // 쿼리스트링 파라미터(page/size 등) 바인딩
import org.springframework.web.bind.annotation.RestController;        // @Controller + @ResponseBody(메서드 반환을 JSON으로 직렬화)

import com.example.demo.dao.PostDao;                                  // 게시글 관련 DB 접근 DAO
import com.example.demo.dto.PageDTO;                                  // 페이지네이션 응답 DTO(목록/전체건수/페이지/사이즈)
import com.example.demo.dto.PostDto;                                  // 게시글 데이터 전송 객체

@RestController                                                       // REST API 컨트롤러 선언(JSON 반환)
@RequestMapping("/api")                                              // 이 클래스의 모든 핸들러는 "/api" 하위 경로
public class BoardController {

    private final PostDao postDao;                                    // 의존 DAO(게시글 CRUD/카운트/조건부 업데이트 등)

    public BoardController(PostDao postDao) {                         // 생성자 주입(스프링이 PostDao 빈을 주입)
        this.postDao = postDao;                                       // 필드에 할당
    }

    /* =========================
     * 공통 유틸
     * ========================= */
    private static boolean isAdmin(Authentication auth) {             // 현재 요청 사용자가 관리자 권한이 있는지 체크
        return auth != null && auth.getAuthorities().stream()         // 인증 객체가 있고, 권한 컬렉션을 스트림으로 순회
                .map(GrantedAuthority::getAuthority)                  // 각 권한에서 문자열("ROLE_ADMIN" 등) 추출
                .anyMatch(a -> "ROLE_ADMIN".equalsIgnoreCase(a));     // 대소문자 무시하고 "ROLE_ADMIN" 포함 여부 확인
    }

    private static String username(Authentication auth) {             // 현재 로그인한 사용자의 식별자(보통 userId/이메일) 추출
        return (auth == null) ? null : auth.getName();                // 인증 없으면 null, 있으면 Principal name 반환
    }

    /* =========================
     * 게시글
     * ========================= */

    /** 게시판 코드별 목록 조회 + 페이지네이션 (code 예: "BUS", "NORM") */
    @GetMapping("/boards/{code}/posts")                               // 예: GET /api/boards/BUS/posts?page=0&size=10
    public PageDTO<PostDto> list(                                     // 페이지 DTO(PostDto 목록/카운트/페이지/사이즈) 반환
            // @PathVariable은 Spring MVC(스프링 프레임워크) 에서 URL 경로의 일부를 변수처럼 받아오는 기능
            @PathVariable String code,                                 // 경로 변수로 게시판 코드 수신("BUS"/"NORM" 등)
            @RequestParam(defaultValue = "0") int page,                // 쿼리 파라미터 page(기본 0)
            @RequestParam(defaultValue = "10") int size) {             // 쿼리 파라미터 size(기본 10)

        long total = postDao.countByBoard(code);                       // 전체 행 수(해당 게시판 코드의 게시글 총 개수) 조회
        List<PostDto> rows = postDao.findByBoardPaged(code, page, size);// 해당 페이지의 게시글 목록 조회(limit/offset 적용)
        return new PageDTO<>(rows, total, page, size);                 // 프런트가 바로 쓰기 좋은 페이지 응답으로 래핑해 반환
    }

    /* =========================
     * 🔎 단건 조회 추가 (405 해결 포인트)
     * ========================= */

    /** 숫자 ID 또는 문자열 키를 허용하는 공통 단건 조회(내부 유틸) */
    private PostDto loadOneByIdOrKey(String idOrKey) {
        if (idOrKey != null && idOrKey.matches("\\d+")) {
            // 순수 숫자면 PK로 조회
            return postDao.findById(Long.parseLong(idOrKey));
        }
        // 숫자가 아니면 UUID/문자열 키로 조회
        return postDao.findByKey(idOrKey);
    }

    /** 단건 조회 – 숫자/문자열 통합 라우트 (편집 진입에서 사용) */
    @GetMapping("/posts/{id}")                                        // 예: GET /api/posts/123  또는 /api/posts/550e8400-...
    public ResponseEntity<?> getOneById(@PathVariable String id, Authentication auth) {
        PostDto p = loadOneByIdOrKey(id);
        if (p == null) return ResponseEntity.notFound().build();

        // 편집화면에서 호출되므로 작성자 또는 관리자만 접근 허용
        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(p);
    }

    /** 단건 조회 – 문자열 키 전용 라우트 (별칭) */
    @GetMapping("/posts/key/{key}")                                   // 예: GET /api/posts/key/550e8400-...
    public ResponseEntity<?> getOneByKey(@PathVariable String key, Authentication auth) {
        PostDto p = loadOneByIdOrKey(key);
        if (p == null) return ResponseEntity.notFound().build();

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(p);
    }

    /** 게시글 생성 */
    @PostMapping("/boards/{code}/posts")                              // 예: POST /api/boards/NORM/posts (JSON 본문으로 글 데이터)
    public ResponseEntity<PostDto> create(                            // 생성된 글 데이터를 본문으로 200 OK 반환
            @PathVariable String code,                                 // 게시판 코드
            @RequestBody PostDto req,                                  // 요청 본문(JSON) → PostDto로 바인딩
            Authentication auth) {                                     // 현재 사용자 인증(로그인 안 했을 수도 있음)

        req.setBoardCode(code);                                        // 서버 신뢰를 위해 boardCode는 URL에서 확정(본문 무시)
        if (auth != null) {                                            // 로그인한 사용자라면 작성자 정보 설정
            req.setWriterId(auth.getName());                           // 서버가 보증하는 writerId(Principal)
            req.setWriterName(auth.getName());                         // 단순히 name도 동일 설정(필요 시 별도 조회 가능)
        }
        Long id = postDao.insert(req);                                 // DAO를 통해 DB에 INSERT 수행 → 생성된 PK(ID) 수신
        req.setPostId(id);                                             // 응답 객체에 생성된 식별자 세팅
        return ResponseEntity.ok(req);                                 // 200 OK + 생성된 리소스 정보 반환
    }

    /** 게시글 수정(공통 라우트): 관리자=무제한, 일반=본인만 */
    @PutMapping("/posts/{id}")                                        // 예: PUT /api/posts/123  또는 /api/posts/UUID
    public ResponseEntity<Void> updateById(                           // 본문 없음(상태코드로 결과 표현)
            @PathVariable String id,                                   // 경로의 식별자(숫자 PK 또는 문자열 키)
            @RequestBody PostDto req,                                  // 변경 내용이 담긴 DTO(제목/내용 등)
            Authentication auth) {                                     // 인증 정보(권한 판단/소유자 확인)

        if (id != null && id.matches("\\d+"))                          // id가 순수 숫자라면 PK(Long)로 간주
            req.setPostId(Long.parseLong(id));                         // DTO의 postId에 세팅
        else                                                            // 숫자가 아니면
            req.setUuid(id);                                           // 문자열 키(UUID 등)로 간주하여 uuid 필드에 세팅

        int affected = isAdmin(auth)                                   // 관리자면
                ? postDao.update(req)                                  //   조건 없이 업데이트 허용
                : postDao.updateIfOwner(req, username(auth));          // 아니면 본인 소유 게시글일 때만 업데이트

        if (affected > 0) return ResponseEntity.ok().build();          // 영향 행이 1 이상이면 200 OK(수정 성공)

        return isAdmin(auth)                                           // 영향 행 없음: 관리자 여부로 분기
                ? ResponseEntity.notFound().build()                    // 관리자라면 대상 없음(404 Not Found)
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반 사용자라면 권한 없음(403 Forbidden)
    }

    /** 게시글 수정(별도 문자열 키 라우트) */
    @PutMapping("/posts/key/{key}")                                   // 예: PUT /api/posts/key/abcd-efgh (키로 접근)
    public ResponseEntity<Void> updateByKey(                          // 위와 동일 로직, 경로 변수명만 다름
            @PathVariable String key,                                  // 문자열 키 수신
            @RequestBody PostDto req,                                  // 변경 DTO
            Authentication auth) {                                      // 인증

        if (key != null && key.matches("\\d+"))                        // key가 숫자면
            req.setPostId(Long.parseLong(key));                        //   postId로 매핑
        else                                                            // 아니면
            req.setUuid(key);                                          //   uuid로 매핑

        int affected = isAdmin(auth)                                   // 관리자면 무제한 수정
                ? postDao.update(req)
                : postDao.updateIfOwner(req, username(auth));          // 일반 유저는 본인 글만

        if (affected > 0) return ResponseEntity.ok().build();          // 성공 시 200 OK

        return isAdmin(auth)                                           // 실패 시 관리자/일반 분기
                ? ResponseEntity.notFound().build()                    // 관리자: 대상 없음(404)
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반: 권한 없음(403)
    }

    /** 게시글 삭제(공통 라우트): 관리자=무제한, 일반=본인만 */
    @DeleteMapping("/posts/{id}")                                     // 예: DELETE /api/posts/123  또는 /api/posts/UUID
    public ResponseEntity<Void> delete(                               // 삭제는 보통 본문 없이 상태코드로 결과 전달
            @PathVariable String id,                                   // 삭제 대상 식별자
            Authentication auth) {                                      // 인증(권한 확인용)

        int affected = isAdmin(auth)                                   // 관리자면
                ? postDao.deleteAny(id)                                //   어떤 글이든 삭제 허용
                : postDao.deleteIfOwner(id, username(auth));           // 일반이면 본인 글만 삭제 허용

        if (affected > 0) return ResponseEntity.ok().build();          // 삭제 성공 → 200 OK

        return isAdmin(auth)                                           // 실패 시 분기
                ? ResponseEntity.notFound().build()                    // 관리자: 대상 없음(404)
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반: 권한 없음(403)
    }

    /** 게시글 삭제(문자열 키 라우트): 로직 동일 */
    @DeleteMapping("/posts/key/{key}")                                // 예: DELETE /api/posts/key/abcd-efgh
    public ResponseEntity<Void> deleteByKey(                          // 위의 delete와 동일, 경로만 다름
            @PathVariable String key,                                  // 문자열 키
            Authentication auth) {                                      // 인증

        int affected = isAdmin(auth)                                   // 관리자/일반 분기 동일
                ? postDao.deleteAny(key)
                : postDao.deleteIfOwner(key, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();          // 성공 시 200 OK

        return isAdmin(auth)                                           // 실패 시 관리자/일반 분기
                ? ResponseEntity.notFound().build()                    // 관리자: 404
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반: 403
    }
}
