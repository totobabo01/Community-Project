// src/main/java/com/example/demo/controller/BoardController.java

package com.example.demo.controller;                                  // 컨트롤러 클래스가 속한 패키지

import java.io.IOException;                                           // 입출력 예외
import java.nio.file.Files;                                           // 파일/디렉터리 조작 유틸
import java.nio.file.Path;                                            // 경로 표현
import java.nio.file.Paths;                                           // 경로 생성 유틸
import java.util.List;                                                // 목록 타입 사용을 위한 import
import java.util.UUID;                                                // 랜덤 UUID 생성용

import org.springframework.beans.factory.annotation.Value;            // application.properties 값 주입
import org.springframework.http.HttpStatus;                           // HTTP 상태코드 상수(403/404 등) 사용
import org.springframework.http.MediaType;                            // 요청/응답 Content-Type 상수
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
import org.springframework.web.multipart.MultipartFile;               // 업로드 파일 표현 타입

import com.example.demo.dao.PostDao;                                  // 게시글 관련 DB 접근 DAO
import com.example.demo.dto.PageDTO;                                  // 페이지네이션 응답 DTO(목록/전체건수/페이지/사이즈)
import com.example.demo.dto.PostDto;                                  // 게시글 데이터 전송 객체

@RestController                                                       // REST API 컨트롤러 선언(JSON 반환)
@RequestMapping("/api")                                              // 이 클래스의 모든 핸들러는 "/api" 하위 경로
public class BoardController {

    private final PostDao postDao;                                    // 의존 DAO(게시글 CRUD/카운트/조건부 업데이트 등)

    @Value("${file.upload-dir:uploads}")                              // 첨부파일 저장 디렉터리(application.properties에서 주입)
    private String uploadDir;

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
            // defaultvalue: "값이 주어지지 않았을 때 대신 사용되는 “미리 정해둔 값”
            @RequestParam(defaultValue = "0") int page,                // 쿼리 파라미터 page(기본 0)
            @RequestParam(defaultValue = "10") int size,               // 쿼리 파라미터 size(기본 10)
            // 🔎 검색/기간 조건용 쿼리 파라미터 (없으면 null로 들어옴 → DAO에서 무시)
            @RequestParam(required = false) String type,               // 예: author / content / title / author_content / time
            @RequestParam(required = false) String keyword,            // 검색 키워드(제목/내용/작성자 등)
            @RequestParam(required = false) String from,               // 기간 검색 시작일(예: "2025-11-10")
            @RequestParam(required = false) String to                  // 기간 검색 종료일(예: "2025-11-12")
    ) {

        // 🔐 방어 코드: 페이지/사이즈 음수/0 방지 + 공백 문자열 정리
        if (page < 0) page = 0;                                       // page는 최소 0페이지부터
        if (size <= 0) size = 10;                                     // size는 최소 1 이상(기본값 10)

        if (type != null && type.isBlank()) type = null;              // 빈 문자열은 null로 정리
        if (keyword != null && keyword.isBlank()) keyword = null;
        if (from != null && from.isBlank()) from = null;
        if (to != null && to.isBlank()) to = null;

        // 👉 여기서부터는 “검색 조건을 포함한” 카운트 + 페이지 목록 DAO 호출
        long total = postDao.countByBoard(code, type, keyword, from, to); // 전체 행 수(검색 조건 포함) 조회
        List<PostDto> rows = postDao.findByBoardPaged(                   // 해당 페이지의 게시글 목록 조회(limit/offset + 검색조건)
                code, page, size, type, keyword, from, to);
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

    /** 게시글 생성 (파일 업로드 지원) */
    @PostMapping(
            value = "/boards/{code}/posts",                            // 예: POST /api/boards/NORM/posts
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE             // 본문 타입: multipart/form-data
    )
    public ResponseEntity<PostDto> create(                            // 생성된 글 데이터를 본문으로 200 OK 반환
            @PathVariable String code,                                 // 게시판 코드
            @RequestParam("title") String title,                       // 폼 필드: 제목
            @RequestParam("content") String content,                   // 폼 필드: 내용
            @RequestParam(name = "file", required = false) MultipartFile file, // 폼 필드: 첨부파일(없을 수 있음)
            Authentication auth) throws IOException {                  // 현재 사용자 인증(로그인 안 했을 수도 있음)

        // 요청 본문을 직접 PostDto로 받지 않고, 서버쪽에서 안전하게 DTO 생성
        PostDto req = new PostDto();

        req.setBoardCode(code);                                        // 서버 신뢰를 위해 boardCode는 URL에서 확정
        req.setTitle(title);                                           // 제목 설정
        req.setContent(content);                                       // 내용 설정

        if (auth != null) {                                            // 로그인한 사용자라면 작성자 정보 설정
            req.setWriterId(auth.getName());                           // 서버가 보증하는 writerId(Principal)
            req.setWriterName(auth.getName());                         // 단순히 name도 동일 설정(필요 시 별도 조회 가능)
        }

        // ───────────── 첨부파일 처리 ─────────────
        if (file != null && !file.isEmpty()) {                         // 파일이 실제로 업로드된 경우에만
            String originalName = file.getOriginalFilename();          // 원본 파일명
            String contentType = file.getContentType();                // MIME 타입(image/png 등)

            // 저장 파일명: UUID_원본이름 (충돌 방지)
            String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
            String savedName = UUID.randomUUID().toString() + "_" + safeName;

            // 업로드 디렉터리 생성(없으면)
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath();   // application.properties의 file.upload-dir 기준
            Files.createDirectories(uploadPath);                       // 디렉터리 없으면 생성

            // 실제 저장 경로
            Path target = uploadPath.resolve(savedName);
            file.transferTo(target.toFile());                          // 파일 저장

            // 파일 타입 판별: 이미지 / 일반파일 / 폴더
            String fileType;
            boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
            if (isImage) {
                fileType = "IMAGE";
            } else if (originalName != null && !originalName.contains(".")) {
                // 간단 규칙: 확장자가 없으면 "폴더처럼" 취급 → 폴더 아이콘
                fileType = "FOLDER";
            } else {
                fileType = "FILE";
            }

            // DTO에 첨부파일 정보 세팅
            req.setFileUrl("/uploads/" + savedName);                   // 웹에서 접근할 URL (WebMvcConfig에서 매핑)
            req.setFileType(fileType);                                 // IMAGE / FILE / FOLDER
            req.setFileName(originalName);                              // 원본 파일명
            req.setFileContentType(contentType);                        // MIME 타입
        }

        Long id = postDao.insert(req);                                 // DAO를 통해 DB에 INSERT 수행 → 생성된 PK(ID) 수신
        req.setPostId(id);                                             // 응답 객체에 생성된 식별자 세팅
        return ResponseEntity.ok(req);                                 // 200 OK + 생성된 리소스 정보 반환
    }

    /* =========================
     * 파일 교체용 유틸 (수정에서 재사용)
     * ========================= */
    private void replaceFile(PostDto target, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) return;

        // 기존 파일 삭제 (있을 때만)
        String oldUrl = target.getFileUrl();
        if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
            Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
            Files.deleteIfExists(oldPath);
        }

        String originalName = file.getOriginalFilename();
        String contentType = file.getContentType();

        String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
        String savedName = UUID.randomUUID().toString() + "_" + safeName;

        Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
        Files.createDirectories(uploadPath);
        Path targetPath = uploadPath.resolve(savedName);
        file.transferTo(targetPath.toFile());

        String fileType;
        boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
        if (isImage) {
            fileType = "IMAGE";
        } else if (originalName != null && !originalName.contains(".")) {
            fileType = "FOLDER";
        } else {
            fileType = "FILE";
        }

        target.setFileUrl("/uploads/" + savedName);
        target.setFileType(fileType);
        target.setFileName(originalName);
        target.setFileContentType(contentType);
    }

    /* =========================
     * 게시글 수정 (JSON 전용 – 기존 방식 유지)
     * ========================= */

    /** 게시글 수정(공통 라우트): 관리자=무제한, 일반=본인만 (JSON 본문) */
    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )                                                                  // 예: PUT /api/posts/123  또는 /api/posts/UUID
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

    /** 게시글 수정(별도 문자열 키 라우트, JSON 본문) */
    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )                                                                  // 예: PUT /api/posts/key/abcd-efgh (키로 접근)
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

    /* =========================
     * 게시글 수정 (multipart/form-data – 파일 교체 포함)
     * ========================= */

    /** 게시글 수정 + 파일 교체 (ID 기준, multipart/form-data) */
    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> updateByIdMultipart(
            @PathVariable String id,
            @RequestParam("title") String title,
            @RequestParam("content") String content,
            @RequestParam(name = "file", required = false) MultipartFile file,
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(id);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        existing.setTitle(title);
        existing.setContent(content);

        // 새 파일이 있으면 교체
        if (file != null && !file.isEmpty()) {
            replaceFile(existing, file);
        }

        int affected = isAdmin(auth)
                ? postDao.update(existing)
                : postDao.updateIfOwner(existing, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();

        return isAdmin(auth)
                ? ResponseEntity.notFound().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    /** 게시글 수정 + 파일 교체 (문자열 키 기준, multipart/form-data) */
    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> updateByKeyMultipart(
            @PathVariable String key,
            @RequestParam("title") String title,
            @RequestParam("content") String content,
            @RequestParam(name = "file", required = false) MultipartFile file,
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(key);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        existing.setTitle(title);
        existing.setContent(content);

        if (file != null && !file.isEmpty()) {
            replaceFile(existing, file);
        }

        int affected = isAdmin(auth)
                ? postDao.update(existing)
                : postDao.updateIfOwner(existing, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();

        return isAdmin(auth)
                ? ResponseEntity.notFound().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
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
