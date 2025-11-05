package com.example.demo.controller;                        // 이 파일이 속한 패키지 경로(네임스페이스)

import java.util.List;                                      // 목록 반환을 위해 List 컬렉션을 사용

import org.springframework.http.ResponseEntity;             // (현재 메서드들에선 안 쓰이지만) 응답 래핑용 타입
import org.springframework.security.core.Authentication;    // (현재 메서드들에선 안 쓰이지만) 로그인 사용자 정보 접근용
import org.springframework.web.bind.annotation.DeleteMapping;// REST: DELETE 핸들러 애너테이션(지금 파일에선 미사용)
import org.springframework.web.bind.annotation.GetMapping;   // REST: GET 핸들러 애너테이션
import org.springframework.web.bind.annotation.PathVariable; // 경로 변수 바인딩(@PathVariable)을 위해 import
import org.springframework.web.bind.annotation.PostMapping;  // REST: POST 핸들러 애너테이션(지금 파일에선 미사용)
import org.springframework.web.bind.annotation.PutMapping;   // REST: PUT 핸들러 애너테이션(지금 파일에선 미사용)
import org.springframework.web.bind.annotation.RequestBody;  // 요청 본문 바인딩(@RequestBody)을 위해 import(지금 메서드들엔 미사용)
import org.springframework.web.bind.annotation.RequestMapping;// 공통 URL prefix 매핑 애너테이션
import org.springframework.web.bind.annotation.RestController;// REST 컨트롤러(응답을 JSON 등으로 직렬화)

import com.example.demo.dao.CommentDao;                     // 댓글 데이터를 DB에서 읽어오는 DAO 의존성
import com.example.demo.dto.CommentDto;                     // 댓글 한 건(또는 뷰)에 대한 DTO 형태

@RestController                                             // 이 클래스의 모든 핸들러가 REST 응답(JSON 등)임을 선언
@RequestMapping("/api")                                     // 이 컨트롤러의 공통 URL prefix: /api/...
public class CommentController {                            // 댓글 관련 HTTP API를 제공하는 컨트롤러 클래스

    private final CommentDao commentDao;                    // DB 접근을 위임할 DAO 의존성(불변)

    public CommentController(CommentDao commentDao) {       // 생성자 주입: 스프링이 CommentDao 빈을 넣어줌
        this.commentDao = commentDao;                       // 주입된 DAO를 필드에 보관
    }

    /* ---------- 목록 조회 ---------- */                    // 섹션 구분 주석: 이 아래는 "조회" 계열 API

    // 숫자형 게시글 ID 기준                                  // 클라이언트가 '숫자 ID'로 댓글 목록을 요청하는 엔드포인트
    @GetMapping("/posts/{postId}/comments")                 // 예: GET /api/posts/123/comments
    public List<CommentDto> listByPostId(@PathVariable String postId) {
        // CommentDao.findByPost()는 post_uuid 우선, 없으면 내부 서브쿼리로 post_id→uuid 매핑
        //  - 여기서는 경로변수 postId 를 문자열로 받지만, DAO 내부에서
        //    "숫자 ID면 ID→UUID 변환 서브쿼리 사용, 문자열이면 그대로 UUID로 간주" 같은 전략을 구현할 수 있음.
        //  - 반환값은 CommentDto 리스트(컨트롤러가 JSON 배열로 직렬화하여 응답).
        return commentDao.findByPost(postId);               // DAO에 위임하여 해당 게시글의 댓글 목록을 조회
    }

    // 문자열/UUID 키 기준                                    // 클라이언트가 'UUID(또는 문자열 키)'로 댓글 목록을 요청하는 엔드포인트
    @GetMapping("/posts/key/{postKey}/comments")            // 예: GET /api/posts/key/e3f2-...-9a/comments
    public List<CommentDto> listByPostKey(@PathVariable String postKey) {
        return commentDao.findByPostKey(postKey);           // 명시적으로 문자열 키 전용 DAO 메서드에 위임
    }                                                       //  - 위 라우트가 있는 이유: 숫자 ID 경로와 명확히 구분하여 라우팅 충돌 방지
                                                          // 클래스 끝

    /* ---------- 댓글 등록(최상위) ---------- */

    // 숫자형 게시글 ID로 최상위 댓글 등록
    @PostMapping("/posts/{postId}/comments")                                   // 경로: 숫자/문자 "게시글 ID" 기반 댓글 등록
public ResponseEntity<?> createOnPostId(@PathVariable String postId,       // URL 경로 변수 {postId}를 문자열로 받음
                                        @RequestBody CommentDto req,       // 요청 본문(JSON)을 CommentDto로 바인딩
                                        Authentication auth) {             // 현재 로그인 사용자 정보(스프링 시큐리티가 주입)

    String author = (auth != null) ? auth.getName() : null;                // 로그인 여부 확인 후 사용자 아이디 추출
    if (author == null) return ResponseEntity.status(401).body("unauthorized"); // 비로그인 → 401 Unauthorized 반환

    // postId를 문자열 키 필드(postIdStr)에 넣어 Dao가 해석하도록
    req.setPostIdStr(postId);                                              // DTO의 postIdStr에 경로의 postId를 그대로 설정
    req.setWriterId(author);                                               // 작성자 ID(=현재 로그인 사용자) 설정

    try {
        commentDao.insert(req);                                            // DAO에 등록 요청(유효성/parent 검증/uuid 생성 포함)
        return ResponseEntity.ok(req);                                     // 성공 → 200 OK + 생성된 DTO(서버에서 채운 uuid 등 포함)
    } catch (IllegalArgumentException e) {                                  // 필수값 누락/부모-자식 검증 실패 등 클라이언트 오류
        return ResponseEntity.badRequest().body(e.getMessage());           // 400 Bad Request와 상세 메시지
    } catch (Exception e) {                                                // 예기치 못한 서버 오류
        return ResponseEntity.internalServerError().body("insert failed"); // 500 Internal Server Error
    }
}

// 문자열/UUID 게시글 키로 최상위 댓글 등록
@PostMapping("/posts/key/{postKey}/comments")                               // 경로: 문자열/UUID "게시글 키" 기반 댓글 등록
public ResponseEntity<?> createOnPostKey(@PathVariable String postKey,      // URL 경로 변수 {postKey}를 문자열로 받음
                                         @RequestBody CommentDto req,       // 요청 본문(JSON) → CommentDto 매핑
                                         Authentication auth) {             // 로그인 인증 정보

    String author = (auth != null) ? auth.getName() : null;                 // 로그인 사용자 아이디 추출
    if (author == null) return ResponseEntity.status(401).body("unauthorized"); // 비로그인 차단

    req.setPostUuid(postKey);                                               // 문자열 키는 곧바로 postUuid로 사용(DAO가 최우선으로 참조)
    req.setWriterId(author);                                                // 작성자 ID 설정

    try {
        commentDao.insert(req);                                             // DAO에 등록 위임
        return ResponseEntity.ok(req);                                      // 성공 응답 + 채워진 DTO 반환
    } catch (IllegalArgumentException e) {                                   // 잘못된 입력/검증 실패
        return ResponseEntity.badRequest().body(e.getMessage());            // 400 + 에러 메시지
    } catch (Exception e) {                                                 // 기타 서버 측 오류
        return ResponseEntity.internalServerError().body("insert failed");  // 500
    }
}


    /* ---------- 대댓글(답글) 등록 ---------- */
    // ✅ 프런트가 호출하는 엔드포인트
   @PostMapping("/comments/key/{parentUuid}/replies")                    // HTTP POST: 특정 부모 댓글(UUID) 아래에 "대댓글" 등록
public ResponseEntity<?> createReply(@PathVariable String parentUuid, // URL 경로 변수: 부모 댓글의 uuid
                                     @RequestBody CommentDto req,     // 요청 본문(JSON) → CommentDto로 바인딩(내용 등)
                                     Authentication auth) {           // 현재 로그인 사용자 정보(스프링 시큐리티 주입)

    String author = (auth != null) ? auth.getName() : null;           // 로그인 사용자 아이디 추출
    if (author == null)                                               // 비로그인 상태면
        return ResponseEntity.status(401).body("unauthorized");       // 401 Unauthorized 반환

    // 부모 댓글이 달린 게시글의 post_uuid를 조회
    String postUuid = commentDao.findPostUuidByCommentUuid(parentUuid); // 부모 댓글이 속한 게시글의 uuid 조회
    if (postUuid == null || postUuid.isBlank()) {                      // 부모 댓글이 없거나 잘못된 경우
        // Bad Request는 HTTP 400 상태코드로, 클라이언트가 보낸 요청 자체가 형식적으로 잘못되었을 때 서버가 돌려주는 응답
        return ResponseEntity.badRequest().body("parent not found");   // 400 Bad Request 반환
    }

    req.setPostUuid(postUuid);                                         // 대댓글도 같은 게시글에 속해야 하므로 postUuid 지정
    req.setParentUuid(parentUuid);                                     // 부모 댓글 지정 → 대댓글 관계 설정
    req.setWriterId(author);                                           // 작성자 ID(현재 로그인 사용자) 설정

    try {
        commentDao.insert(req);                                        // DAO에 등록 위임: depth 계산 및 유효성 검증 포함
        return ResponseEntity.ok(req);                                 // 성공 → 200 OK + 생성된 DTO 반환(uuid, depth 등 포함)
    } catch (IllegalArgumentException e) {                             // 입력 검증 실패(필수값 누락/무결성 위반 등)
        return ResponseEntity.badRequest().body(e.getMessage());       // 400 + 상세 메시지
    } catch (Exception e) {                                            // 기타 서버 오류
        return ResponseEntity.internalServerError().body("insert failed"); // 500
    }
}


    /* ---------- 댓글 수정 ---------- */
    @PutMapping("/comments/key/{uuid}")                         // HTTP PUT: 경로의 {uuid}에 해당하는 댓글을 수정
public ResponseEntity<?> updateMyComment(                   // 응답을 다양하게 반환하기 위해 ResponseEntity 사용
        @PathVariable String uuid,                          // URL 경로 변수: 수정할 댓글의 UUID
        @RequestBody CommentDto req,                        // 요청 본문(JSON) → CommentDto로 바인딩(여기선 content 사용)
        Authentication auth) {                              // 현재 로그인한 사용자 정보(스프링 시큐리티가 주입)

    String author = (auth != null) ? auth.getName() : null; // 로그인 여부 확인 후 사용자 아이디(Principal) 추출
    if (author == null)                                     // 미인증(비로그인) 상태라면
        return ResponseEntity.status(401).body("unauthorized"); // 401 Unauthorized 반환(본문에 사유 문자열)

    int n = commentDao.updateContentByUuidAndAuthor(        // DAO 호출: uuid + author_id 일치하는 행만 업데이트
            uuid,                                           //   수정 대상 댓글의 UUID
            req.getContent(),                               //   바꿀 내용(본문)
            author);                                        //   작성자 제약(본인만 수정 가능)

    if (n > 0)                                              // 영향받은 행이 1 이상 → 수정 성공
        return ResponseEntity.ok(req);                      // 200 OK +(선택) 클라이언트가 보낸 req(갱신 내용) 반환

    return ResponseEntity.status(403).body("forbidden");    // 그 외(행 없음) → 보통 권한 없음(작성자 불일치)으로 간주하여 403
}


    /* ---------- 댓글 삭제 ---------- */
   @DeleteMapping("/comments/key/{uuid}")                     // HTTP DELETE: 경로의 {uuid}에 해당하는 댓글을 삭제
public ResponseEntity<?> deleteMyComment(                  // 다양한 상태코드를 반환하기 위해 ResponseEntity 사용
        @PathVariable String uuid,                         // URL 경로 변수: 삭제 대상 댓글의 UUID
        Authentication auth) {                             // 현재 로그인 사용자 정보(스프링 시큐리티가 주입)

    String author = (auth != null) ? auth.getName() : null; // 로그인 여부 확인 후 사용자 아이디(Principal) 추출
    if (author == null)                                     // 비로그인(미인증) 상태면
        return ResponseEntity.status(401).body("unauthorized"); // 401 Unauthorized와 간단한 메시지 반환

    int n = commentDao.deleteByUuidAndAuthor(uuid, author); // DAO 호출: uuid와 author_id가 모두 일치할 때만 삭제
    if (n > 0)                                              // 영향 받은 행 수가 1 이상이면 실제로 삭제가 된 것
        return ResponseEntity.noContent().build();          // 204 No Content: 성공(본문 없음)

    return ResponseEntity.status(403).body("forbidden");    // 그 외(행 없음) → 보통 '작성자 불일치'로 간주하여 403 Forbidden
  }
}
