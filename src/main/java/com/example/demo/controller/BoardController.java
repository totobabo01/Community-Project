// src/main/java/com/example/demo/controller/BoardController.java

package com.example.demo.controller;                                  // 이 클래스가 포함된 패키지 이름 선언

import java.io.IOException;                                           // 파일 입출력 시 발생하는 예외 타입
import java.nio.file.Files;                                           // 파일/디렉터리 생성·삭제 등 유틸 메서드 모음
import java.nio.file.Path;                                            // 파일/디렉터리 경로를 표현하는 클래스
import java.nio.file.Paths;                                           // 문자열로부터 Path 객체를 만드는 유틸 클래스
import java.util.ArrayList;                                           // 가변 길이 리스트 구현체(ArrayList) 사용
import java.util.HashMap;                                             // 키-값 쌍을 저장하는 HashMap 구현체
import java.util.List;                                                // List 인터페이스 (메서드 파라미터/리턴 타입용)
import java.util.Map;                                                 // Map 인터페이스 (메타데이터 저장용)
import java.util.UUID;                                                // 고유 식별자(UUID) 생성용 클래스

import org.springframework.beans.factory.annotation.Value;            // 설정값(application.properties)을 주입하기 위한 애노테이션
import org.springframework.http.HttpStatus;                           // HTTP 상태 코드 상수 정의(200,403,404 등)
import org.springframework.http.MediaType;                            // Content-Type 상수 정의(JSON, multipart 등)
import org.springframework.http.ResponseEntity;                       // 응답 본문 + 상태코드를 함께 반환할 때 사용하는 래퍼
import org.springframework.security.core.Authentication;              // 현재 로그인 사용자/권한 정보를 나타내는 인터페이스
import org.springframework.security.core.GrantedAuthority;            // 개별 권한(ROLE_ADMIN 등)을 나타내는 인터페이스
import org.springframework.web.bind.annotation.DeleteMapping;         // HTTP DELETE 요청을 메서드에 매핑하는 애노테이션
import org.springframework.web.bind.annotation.GetMapping;            // HTTP GET 요청을 메서드에 매핑하는 애노테이션
import org.springframework.web.bind.annotation.PathVariable;          // URL 경로의 일부를 메서드 파라미터로 바인딩하는 애노테이션
import org.springframework.web.bind.annotation.PostMapping;           // HTTP POST 요청 매핑 애노테이션
import org.springframework.web.bind.annotation.PutMapping;            // HTTP PUT 요청 매핑 애노테이션
import org.springframework.web.bind.annotation.RequestBody;           // 요청의 JSON 본문을 객체로 바인딩하는 애노테이션
import org.springframework.web.bind.annotation.RequestMapping;        // 클래스/메서드에 공통 URL prefix를 붙이는 애노테이션
import org.springframework.web.bind.annotation.RequestParam;          // 쿼리스트링/폼 필드 값을 메서드 파라미터로 바인딩하는 애노테이션
import org.springframework.web.bind.annotation.RestController;        // @Controller + @ResponseBody 조합(리턴값을 JSON으로 응답)
import org.springframework.web.multipart.MultipartFile;               // 업로드된 파일을 나타내는 타입

import com.example.demo.dao.PostDao;                                  // 게시글 DB 접근을 담당하는 DAO 클래스
import com.example.demo.dto.PageDTO;                                  // 페이징 응답(목록, 전체건수, 페이지, 사이즈)을 담는 DTO
import com.example.demo.dto.PostDto;                                  // 게시글 정보를 담는 DTO
import com.fasterxml.jackson.databind.ObjectMapper;                   // 자바 객체 <-> JSON 문자열 변환을 위한 라이브러리

@RestController                                                       // 이 클래스가 REST API 컨트롤러임을 선언(JSON 반환)
@RequestMapping("/api")                                               // 이 클래스의 모든 메서드는 "/api" 경로 하위에서 동작
public class BoardController {

    private final PostDao postDao;                                    // 게시글 CRUD를 담당하는 DAO를 필드로 보관

    // 🔥 업로드 디렉터리 경로 설정: properties에 file.upload-dir가 있으면 그 값을, 없으면 기본값 C:/upload 사용
    @Value("${file.upload-dir:C:/upload}")
    private String uploadDir;                                         // 실제 파일이 저장될 기본 디렉터리 경로

    public BoardController(PostDao postDao) {                         // 생성자: 스프링이 PostDao 빈을 주입해줌
        this.postDao = postDao;                                       // 주입받은 DAO를 필드에 저장
    }

    /* =========================
     * 공통 유틸
     * ========================= */

    // 현재 요청의 사용자가 관리자(ROLE_ADMIN)인지 여부를 확인하는 정적 메서드
    private static boolean isAdmin(Authentication auth) {
        return auth != null &&                                        // 인증 객체가 null이 아니고
                auth.getAuthorities().stream()                         // 그 안의 권한 컬렉션을 스트림으로 순회하면서
                        .map(GrantedAuthority::getAuthority)          // 각 권한에서 "ROLE_XXX" 문자열만 뽑아서
                        .anyMatch(a -> "ROLE_ADMIN".equalsIgnoreCase(a)); // 그 중 "ROLE_ADMIN" 이 존재하면 true
    }

    // 현재 로그인한 사용자의 username(아이디, 이메일 등)을 가져오는 유틸 메서드
    private static String username(Authentication auth) {
        return (auth == null) ? null : auth.getName();                // 인증이 없으면 null, 있으면 principal의 name 반환
    }

    /* =========================
     * 게시글
     * ========================= */

    /** 게시판 코드별 목록 조회 + 페이지네이션 (code 예: "BUS", "NORM") */
    @GetMapping("/boards/{code}/posts")                               // 예: GET /api/boards/BUS/posts?page=0&size=10
    public PageDTO<PostDto> list(                                     // PageDTO<PostDto> 형태로 결과 반환
            @PathVariable String code,                                 // URL 경로에서 게시판 코드 추출(BUS/NORM 등)
            @RequestParam(defaultValue = "0") int page,                // 쿼리 파라미터 page(기본값 0)
            @RequestParam(defaultValue = "10") int size,               // 쿼리 파라미터 size(기본값 10)
            // 🔎 검색/기간 조건 쿼리 파라미터 (없으면 null로 들어옴)
            @RequestParam(required = false) String type,               // 검색 유형(author/title/content/time 등)
            @RequestParam(required = false) String keyword,            // 검색 키워드
            @RequestParam(required = false) String from,               // 기간 시작일(문자열, 예: "2025-11-10")
            @RequestParam(required = false) String to                  // 기간 종료일(문자열)
    ) {

        // 🔐 page/size 음수/0 방지 처리
        if (page < 0) page = 0;                                       // page는 최소 0 페이지
        if (size <= 0) size = 10;                                     // size가 0 이하이면 기본값 10으로 지정

        // 공백 문자열은 의미 없는 값이므로 null로 정리
        if (type != null && type.isBlank()) type = null;
        if (keyword != null && keyword.isBlank()) keyword = null;
        if (from != null && from.isBlank()) from = null;
        if (to != null && to.isBlank()) to = null;

        // 👉 검색 조건을 포함한 전체 건수 조회
        long total = postDao.countByBoard(code, type, keyword, from, to); // 해당 게시판 + 검색 조건에 맞는 총 개수

        // 👉 특정 페이지에 해당하는 게시글 목록 조회
        List<PostDto> rows = postDao.findByBoardPaged(                   // limit/offset + 조건 검색
                code, page, size, type, keyword, from, to);

        // 👉 프론트에서 바로 쓰기 좋은 PageDTO 형태로 래핑하여 반환
        return new PageDTO<>(rows, total, page, size);
    }

    /* =========================
     * 🔎 단건 조회 추가 (405 해결 포인트)
     * ========================= */

    // 숫자 ID 또는 문자열 키(UUID 등)를 모두 허용해서 게시글 1개를 로드하는 내부 유틸 메서드
    private PostDto loadOneByIdOrKey(String idOrKey) {
        if (idOrKey != null && idOrKey.matches("\\d+")) {              // 모두 숫자면
            // 순수 숫자로 간주하고 PK(Long)로 조회
            return postDao.findById(Long.parseLong(idOrKey));
        }
        // 숫자가 아니면 UUID/문자열 키로 조회
        return postDao.findByKey(idOrKey);
    }

    /** 단건 조회 – 숫자/문자열 통합 라우트 (편집 진입에서 사용) */
    @GetMapping("/posts/{id}")                                        // 예: GET /api/posts/123 또는 /api/posts/UUID
    public ResponseEntity<?> getOneById(                              // 응답 본문 형식이 상황에 따라 달라질 수 있어 ? 사용
            @PathVariable String id,                                   // 경로에 있는 id 또는 uuid 문자열
            Authentication auth) {                                     // 현재 로그인 사용자 정보

        PostDto p = loadOneByIdOrKey(id);                              // 숫자/문자열 구분해서 게시글 로드
        if (p == null) return ResponseEntity.notFound().build();       // 글이 없으면 404 Not Found

        // 편집 화면에서 사용되므로, 작성자 또는 관리자만 이 API를 호출할 수 있게 제한
        String me = username(auth);                                    // 현재 로그인한 사용자의 username
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            // 관리자도 아니고, 글쓴이도 아니면 403 Forbidden
            // HttpStatus.FORBIDDEN: “요청은 이해했지만, 이 작업을 할 권한이 없어서 거절한다” 라는 뜻
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        // 통과하면 200 OK + 게시글 JSON 반환
        return ResponseEntity.ok(p);
    }

    /** 단건 조회 – 문자열 키 전용 라우트 (별칭) */
    @GetMapping("/posts/key/{key}")                                   // 예: GET /api/posts/key/UUID-값
    public ResponseEntity<?> getOneByKey(                             // 위와 로직 동일, 경로에 key 사용
            @PathVariable String key,
            Authentication auth) {

        PostDto p = loadOneByIdOrKey(key);                             // 같은 유틸을 사용해서 로드
        if (p == null) return ResponseEntity.notFound().build();       // 없으면 404

        String me = username(auth);                                    // 현재 사용자
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            // 권한 없으면 403
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        // 있으면 200 + JSON
        return ResponseEntity.ok(p);
    }

    /* =========================
     * 게시글 생성 (파일 업로드 + 폴더 타입 지원)
     * ========================= */

    /** 게시글 생성 (파일 업로드 + 폴더 타입 지원) */
    @PostMapping(
            value = "/boards/{code}/posts",                            // 예: POST /api/boards/NORM/posts
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE             // multipart/form-data 요청만 허용
    )
    public ResponseEntity<PostDto> create(                            // 생성된 게시글 DTO를 응답 본문으로 반환
            @PathVariable String code,                                 // 게시판 코드(NORM/BUS 등)
            @RequestParam("title") String title,                       // 폼 필드에서 제목 수신
            @RequestParam("content") String content,                   // 폼 필드에서 내용 수신
            // ✅ 여러 파일을 받을 수 있도록 name="file"에 List로 바인딩
            @RequestParam(name = "file", required = false) List<MultipartFile> files,
            @RequestParam(name = "isFolder", required = false) Boolean isFolder,   // 폴더 글인지 여부(체크박스)
            @RequestParam(name = "folderName", required = false) String folderName, // 폴더 이름
            Authentication auth) throws IOException {                  // 파일 저장 중 예외 발생 가능

        // 요청 바디를 바로 PostDto로 받지 않고, 서버가 신뢰할 수 있는 방식으로 새 DTO 생성
        PostDto req = new PostDto();

        req.setBoardCode(code);                                        // boardCode는 URL로 확정(클라이언트 조작 방지)
        req.setTitle(title);                                           // 제목 설정
        req.setContent(content);                                       // 내용 설정

        if (auth != null) {                                            // 로그인되어 있다면
            req.setWriterId(auth.getName());                           // 현재 로그인 사용자 이름을 writerId로 사용
            req.setWriterName(auth.getName());                         // writerName도 동일 값으로 설정(추후 확장 가능)
        }

        // ───────────── 첨부파일 / 폴더 처리 ─────────────
        // isFolder에 true가 들어오면 폴더 글로 간주
        boolean folderFlag = Boolean.TRUE.equals(isFolder);

        if (folderFlag) {
            // 📁 폴더 글 모드: 실제 파일 업로드 없이 "폴더만" 표현하는 글 생성
            String name = (folderName == null || folderName.isBlank())
                    ? title                                            // 폴더 이름이 비어있으면 글 제목을 대신 사용
                    : folderName.trim();                               // 공백 제거한 폴더 이름

            req.setFileUrl(null);                                      // 실제 파일 URL 없음
            req.setFileType("FOLDER");                                 // file_type을 FOLDER로 설정
            req.setFileName(name);                                     // file_name에는 폴더 이름 저장
            req.setFileContentType(null);                              // contentType도 없음
            // 폴더 글은 여러 파일이 없으므로 file_list_json도 설정하지 않음
        } else {
            // 🔹 일반 게시글 + 여러 파일/이미지 업로드 처리
            List<MultipartFile> effective = new ArrayList<>();         // 실제로 쓸 유효한 파일 목록

            if (files != null) {                                       // files가 null이 아니면
                for (MultipartFile f : files) {                        // 각 파일을 순회하면서
                    if (f != null && !f.isEmpty()) {                   // null이 아니고 비어있지 않으면(실제 업로드된 파일)
                        effective.add(f);                              // 유효한 파일 목록에 추가
                    }
                }
            }

            if (!effective.isEmpty()) {                                // 유효한 파일이 하나 이상이면
                // ✅ 전체 첨부파일 메타데이터를 JSON으로 만들기 위한 리스트
                List<Map<String, Object>> metaList = new ArrayList<>();

                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();   // 업로드 기본 경로를 절대경로 Path로 변환
                Files.createDirectories(uploadPath);                       // 디렉터리가 없으면 생성(존재하면 그대로)

                for (int i = 0; i < effective.size(); i++) {              // 각 파일에 대해
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();      // 원본 파일명
                    String contentType = file.getContentType();            // MIME 타입
                    long size = file.getSize();                            // 파일 크기(byte)

                    // 저장 파일명: UUID_원본이름(공백은 언더바로 치환)
                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;

                    // 실제 저장될 파일 경로
                    Path target = uploadPath.resolve(savedName);
                    file.transferTo(target.toFile());                      // 디스크에 파일 저장

                    // 파일 타입 분류: 이미지 / 폴더(확장자 없음) / 일반 파일
                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) {
                        fileType = "IMAGE";
                    } else if (originalName != null && !originalName.contains(".")) {
                        fileType = "FOLDER";                               // 확장자가 아예 없으면 폴더처럼 취급
                    } else {
                        fileType = "FILE";                                 // 그 외는 일반 파일
                    }

                    String url = "/uploads/" + savedName;                 // 브라우저에서 접근 가능한 URL 경로

                    // 🔸 첫 번째 파일은 대표 파일로 기존 컬럼(file_url 등)에 세팅
                    if (i == 0) {
                        req.setFileUrl(url);
                        req.setFileType(fileType);
                        req.setFileName(originalName);
                        req.setFileContentType(contentType);
                    }

                    // 🔸 file_list_json 에 들어갈 개별 파일 메타데이터 생성
                    Map<String, Object> meta = new HashMap<>();
                    meta.put("name", originalName);                       // 원본 파일명
                    meta.put("url", url);                                 // 파일 다운로드/보기 URL
                    meta.put("contentType", contentType);                 // MIME 타입
                    meta.put("size", size);                               // 파일 크기
                    meta.put("fileType", fileType);                       // IMAGE/FILE/FOLDER 구분

                    metaList.add(meta);                                   // 리스트에 추가
                }

                // 파일 메타 리스트가 비어있지 않으면 JSON 문자열로 직렬화해서 DTO에 저장
                if (!metaList.isEmpty()) {
                    ObjectMapper om = new ObjectMapper();                 // Jackson ObjectMapper 생성
                    String json = om.writeValueAsString(metaList);        // List<Map> -> JSON 문자열 변환
                    req.setFileListJson(json);                            // PostDto의 fileListJson 필드에 저장
                }
            }
            // effective가 비었다면 첨부 없는 글 → file_* 및 file_list_json은 null 그대로 유지
        }

        Long id = postDao.insert(req);                                 // DAO를 통해 DB에 INSERT 수행하고 PK(ID) 반환받음
        req.setPostId(id);                                             // DTO에 생성된 ID 설정
        return ResponseEntity.ok(req);                                 // 200 OK + 생성된 게시글 정보를 응답
    }

    /* =========================
     * 파일 교체용 유틸 (수정에서 재사용) – 지금은 단일 파일 교체용으로만 사용
     * ========================= */

    // 단일 MultipartFile로 기존 파일을 교체하는 유틸 (현재는 사용 빈도 낮음)
    private void replaceFile(PostDto target, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) return;                    // 새 파일이 없으면 아무 것도 안 함

        // 기존 대표 파일이 있으면 삭제 시도
        String oldUrl = target.getFileUrl();
        if (oldUrl != null && oldUrl.startsWith("/uploads/")) {        // /uploads/로 시작하는 경우만 처리
            Path uploadPath = Paths.get(uploadDir).toAbsolutePath();   // 업로드 디렉터리 절대경로
            Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length())); // 기존 파일 경로
            Files.deleteIfExists(oldPath);                             // 파일이 있으면 삭제
        }

        String originalName = file.getOriginalFilename();              // 새 파일의 원래 이름
        String contentType = file.getContentType();                    // 새 파일의 MIME 타입

        String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_"); // 공백 치환
        String savedName = UUID.randomUUID().toString() + "_" + safeName;                     // UUID_이름

        Path uploadPath = Paths.get(uploadDir).toAbsolutePath();       // 업로드 디렉터리 Path
        Files.createDirectories(uploadPath);                           // 디렉터리 없으면 생성
        Path targetPath = uploadPath.resolve(savedName);               // 실제 저장할 경로
        file.transferTo(targetPath.toFile());                          // 파일 저장

        String fileType;                                               // 파일 타입 판별
        boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
        if (isImage) {
            fileType = "IMAGE";
        } else if (originalName != null && !originalName.contains(".")) {
            fileType = "FOLDER";
        } else {
            fileType = "FILE";
        }

        target.setFileUrl("/uploads/" + savedName);                    // 대표 파일 URL 갱신
        target.setFileType(fileType);                                  // 대표 파일 타입 갱신
        target.setFileName(originalName);                              // 대표 파일 이름 갱신
        target.setFileContentType(contentType);                        // 대표 파일 contentType 갱신

        // 단일 교체에서는 여러 파일 목록은 사용하지 않으므로 file_list_json 초기화
        target.setFileListJson(null);
    }

    /* =========================
     * 게시글 수정 (JSON 전용 – 기존 방식 유지)
     * ========================= */

    /** 게시글 수정(공통 라우트): 관리자=무제한, 일반=본인만 (JSON 본문) */
    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE                // JSON 본문만 허용
    )                                                                  // 예: PUT /api/posts/123 또는 /api/posts/UUID
    public ResponseEntity<Void> updateById(                           // 본문 없이 상태 코드만 반환
            @PathVariable String id,                                   // 숫자 또는 문자열 식별자
            @RequestBody PostDto req,                                  // 수정할 제목, 내용 등
            Authentication auth) {                                     // 인증 정보(권한 확인용)

        // ① 기존 글 로드
        PostDto existing = loadOneByIdOrKey(id);
        if (existing == null) {                                        // 글이 없으면
            return ResponseEntity.notFound().build();                  // 404 반환
        }

        // ② 권한 체크: 관리자 또는 작성자만 수정 가능
        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();// 권한 없으면 403
        }

        // ③ 수정 대상 필드만 덮어쓰기(파일 관련 필드는 그대로 유지)
        if (req.getTitle() != null) {                                  // 제목이 null이 아니면
            existing.setTitle(req.getTitle());                         // 기존 제목 변경
        }
        if (req.getContent() != null) {                                // 내용이 null이 아니면
            existing.setContent(req.getContent());                     // 기존 내용 변경
        }

        int affected = postDao.update(existing);                       // DB UPDATE 실행, 영향받은 행 수 반환

        if (affected > 0) return ResponseEntity.ok().build();          // 1행 이상 변경되면 200 OK

        return ResponseEntity.notFound().build();                      // 0행이면 404(Not Found)로 처리
    }

    /** 게시글 수정(별도 문자열 키 라우트, JSON 본문) */
    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )                                                                  // 예: PUT /api/posts/key/abcd-efgh
    public ResponseEntity<Void> updateByKey(                          // 위와 동일, path만 다름
            @PathVariable String key,                                  // 문자열 키
            @RequestBody PostDto req,                                  // 수정 내용 DTO
            Authentication auth) {

        // ① 기존 글 로드
        PostDto existing = loadOneByIdOrKey(key);
        if (existing == null) {                                        // 없으면
            return ResponseEntity.notFound().build();                  // 404
        }

        // ② 권한 체크
        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();// 403
        }

        // ③ 수정 필드 적용
        if (req.getTitle() != null) {
            existing.setTitle(req.getTitle());
        }
        if (req.getContent() != null) {
            existing.setContent(req.getContent());
        }

        int affected = postDao.update(existing);                       // DB UPDATE 실행

        if (affected > 0) return ResponseEntity.ok().build();          // 성공 시 200 OK

        return ResponseEntity.notFound().build();                      // 실패 시 404
    }

    /* =========================
     * 게시글 수정 (multipart/form-data – 파일/폴더 교체 포함)
     * ========================= */

    /** 게시글 수정 + 파일/폴더 교체 (ID 기준, multipart/form-data) */
    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE             // 폼+파일 업로드 방식
    )
    public ResponseEntity<Void> updateByIdMultipart(
            @PathVariable String id,                                   // 수정할 글 ID 또는 키
            @RequestParam("title") String title,                       // 수정할 제목
            @RequestParam("content") String content,                   // 수정할 내용
            // 🔹 여러 개 파일 업로드 가능
            @RequestParam(name = "file", required = false) List<MultipartFile> files,
            @RequestParam(name = "isFolder", required = false) Boolean isFolder, // 폴더 전환 여부
            @RequestParam(name = "folderName", required = false) String folderName, // 폴더 이름
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(id);                       // 기존 글 조회
        if (existing == null) {                                        // 없으면
            return ResponseEntity.notFound().build();                  // 404
        }

        // 권한 체크: 관리자 또는 작성자만 수정 가능
        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();// 403
        }

        existing.setTitle(title);                                      // 제목 덮어쓰기
        existing.setContent(content);                                  // 내용 덮어쓰기

        // 🔹 폴더 체크박스 여부
        boolean folderFlag = Boolean.TRUE.equals(isFolder);

        if (folderFlag) {
            // 📁 폴더 글로 변경하는 경우: 기존 대표 파일 삭제 + 폴더 메타만 남김
            String oldUrl = existing.getFileUrl();
            if (oldUrl != null && oldUrl.startsWith("/uploads/")) {    // 기존 대표 파일이 업로드 폴더에 있다면
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                Files.deleteIfExists(oldPath);                         // 파일 있으면 삭제
            }
            String name = (folderName == null || folderName.isBlank())
                    ? title                                            // 폴더 이름이 없으면 제목 사용
                    : folderName.trim();                               // 공백 제거

            existing.setFileUrl(null);                                 // 실제 파일 URL 제거
            existing.setFileType("FOLDER");                            // 타입을 FOLDER로 변경
            existing.setFileName(name);                                // 폴더 이름 저장
            existing.setFileContentType(null);                         // contentType 제거
            existing.setFileListJson(null);                            // 여러 파일 목록도 초기화
        } else {
            // ✅ 새 파일들을 업로드해서 기존 첨부 전체를 교체하는 경우
            List<MultipartFile> effective = new ArrayList<>();         // 유효한 파일만 모을 리스트
            if (files != null) {
                for (MultipartFile f : files) {
                    if (f != null && !f.isEmpty()) effective.add(f);   // 비어있지 않은 파일만 추가
                }
            }

            if (!effective.isEmpty()) {                                // 교체할 새 파일이 1개 이상이면
                // (단순하게 대표 1개만 실제 파일 삭제 처리)
                String oldUrl = existing.getFileUrl();
                if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                    Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                    Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                    Files.deleteIfExists(oldPath);                     // 기존 대표 파일 삭제
                }

                List<Map<String, Object>> metaList = new ArrayList<>(); // 새 첨부 메타데이터 리스트
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Files.createDirectories(uploadPath);                   // 경로 없으면 생성

                for (int i = 0; i < effective.size(); i++) {
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();  // 새 파일 이름
                    String contentType = file.getContentType();        // 새 파일 MIME
                    long size = file.getSize();                        // 새 파일 크기

                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_"); // 공백 치환
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;                     // UUID_이름

                    Path target = uploadPath.resolve(savedName);       // 저장 경로
                    file.transferTo(target.toFile());                  // 파일 저장

                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) fileType = "IMAGE";                   // 이미지
                    else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER"; // 확장자 없음
                    else fileType = "FILE";                            // 일반 파일

                    String url = "/uploads/" + savedName;             // 새 파일 URL

                    if (i == 0) {                                     // 첫 번째 파일은 대표 파일로 설정
                        existing.setFileUrl(url);
                        existing.setFileType(fileType);
                        existing.setFileName(originalName);
                        existing.setFileContentType(contentType);
                    }

                    Map<String, Object> meta = new HashMap<>();        // file_list_json에 넣을 메타 한 건
                    meta.put("name", originalName);
                    meta.put("url", url);
                    meta.put("contentType", contentType);
                    meta.put("size", size);
                    meta.put("fileType", fileType);

                    metaList.add(meta);                                // 리스트에 추가
                }

                if (!metaList.isEmpty()) {                             // 메타가 있다면 JSON으로 변환 후 저장
                    ObjectMapper om = new ObjectMapper();
                    String json = om.writeValueAsString(metaList);
                    existing.setFileListJson(json);
                } else {
                    existing.setFileListJson(null);                    // 없다면 null
                }
            }
            // effective 비었으면 첨부 유지(파일 변경 없음)
        }

        int affected = postDao.update(existing);                       // DB UPDATE 실행

        if (affected > 0) return ResponseEntity.ok().build();          // 성공 시 200 OK

        return ResponseEntity.notFound().build();                      // 실패 시 404
    }

    /** 게시글 수정 + 파일/폴더 교체 (문자열 키 기준, multipart/form-data) */
    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> updateByKeyMultipart(
            @PathVariable String key,                                  // 문자열 키
            @RequestParam("title") String title,                       // 제목
            @RequestParam("content") String content,                   // 내용
            @RequestParam(name = "file", required = false) List<MultipartFile> files, // 업로드 파일들
            @RequestParam(name = "isFolder", required = false) Boolean isFolder,      // 폴더 여부
            @RequestParam(name = "folderName", required = false) String folderName,   // 폴더 이름
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(key);                      // 키로 기존 글 조회
        if (existing == null) {                                        // 없으면
            return ResponseEntity.notFound().build();                  // 404
        }

        // 권한 체크
        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();// 403
        }

        existing.setTitle(title);                                      // 제목 변경
        existing.setContent(content);                                  // 내용 변경

        boolean folderFlag = Boolean.TRUE.equals(isFolder);            // 폴더 여부 확인

        if (folderFlag) {                                              // 폴더로 전환
            String oldUrl = existing.getFileUrl();
            if (oldUrl != null && oldUrl.startsWith("/uploads/")) {    // 기존 대표 파일 삭제
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                Files.deleteIfExists(oldPath);
            }
            String name = (folderName == null || folderName.isBlank())
                    ? title                                            // 폴더 이름이 없으면 제목 사용
                    : folderName.trim();                               // 입력된 이름 사용

            existing.setFileUrl(null);                                 // 대표 파일 URL 제거
            existing.setFileType("FOLDER");                            // 타입 FOLDER
            existing.setFileName(name);                                // 폴더 이름
            existing.setFileContentType(null);                         // contentType 제거
            existing.setFileListJson(null);                            // 여러 파일 목록도 초기화
        } else {                                                       // 일반 글 수정(파일 교체 가능)
            List<MultipartFile> effective = new ArrayList<>();         // 유효한 새 파일 목록
            if (files != null) {
                for (MultipartFile f : files) {
                    if (f != null && !f.isEmpty()) effective.add(f);   // 비어있지 않은 경우만 추가
                }
            }

            if (!effective.isEmpty()) {                                // 새 파일이 있을 때만 교체
                String oldUrl = existing.getFileUrl();
                if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                    Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                    Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                    Files.deleteIfExists(oldPath);                     // 기존 대표 파일 삭제
                }

                List<Map<String, Object>> metaList = new ArrayList<>(); // 새 메타데이터 리스트
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Files.createDirectories(uploadPath);                   // 디렉터리 생성

                for (int i = 0; i < effective.size(); i++) {           // 새 파일 하나씩 처리
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();  // 새 파일명
                    String contentType = file.getContentType();        // MIME
                    long size = file.getSize();                        // 크기

                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;

                    Path target = uploadPath.resolve(savedName);
                    file.transferTo(target.toFile());                  // 파일 저장

                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) fileType = "IMAGE";
                    else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER";
                    else fileType = "FILE";

                    String url = "/uploads/" + savedName;             // 새 URL

                    if (i == 0) {                                     // 첫 번째 파일을 대표로 설정
                        existing.setFileUrl(url);
                        existing.setFileType(fileType);
                        existing.setFileName(originalName);
                        existing.setFileContentType(contentType);
                    }

                    Map<String, Object> meta = new HashMap<>();        // 메타 한 건
                    meta.put("name", originalName);
                    meta.put("url", url);
                    meta.put("contentType", contentType);
                    meta.put("size", size);
                    meta.put("fileType", fileType);

                    metaList.add(meta);                                // 리스트에 추가
                }

                if (!metaList.isEmpty()) {                             // 메타 있으면 JSON 저장
                    ObjectMapper om = new ObjectMapper();
                    String json = om.writeValueAsString(metaList);
                    existing.setFileListJson(json);
                } else {
                    existing.setFileListJson(null);                    // 없으면 null
                }
            }
        }

        int affected = postDao.update(existing);                       // DB UPDATE 실행

        if (affected > 0) return ResponseEntity.ok().build();          // 성공 시 200 OK

        return ResponseEntity.notFound().build();                      // 실패 시 404
    }

    /** 게시글 삭제(공통 라우트): 관리자=무제한, 일반=본인만 */
    @DeleteMapping("/posts/{id}")                                     // 예: DELETE /api/posts/123 또는 /api/posts/UUID
    public ResponseEntity<Void> delete(                               // 상태 코드만으로 결과 전달
            @PathVariable String id,                                   // 삭제 대상 식별자
            Authentication auth) {                                     // 인증 정보

        int affected = isAdmin(auth)                                   // 관리자 여부에 따라
                ? postDao.deleteAny(id)                                // 관리자면 어떤 글이든 삭제
                : postDao.deleteIfOwner(id, username(auth));           // 일반 사용자면 본인 글만 삭제

        if (affected > 0) return ResponseEntity.ok().build();          // 1건 이상 삭제되면 200 OK

        return isAdmin(auth)                                           // 삭제되지 않은 경우
                ? ResponseEntity.notFound().build()                    // 관리자: 대상 글이 없음 → 404
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반: 권한 부족 → 403
    }

    /** 게시글 삭제(문자열 키 라우트): 로직 동일 */
    @DeleteMapping("/posts/key/{key}")                                // 예: DELETE /api/posts/key/abcd-efgh
    public ResponseEntity<Void> deleteByKey(                          // 위 delete와 완전히 같은 로직, path만 다름
            @PathVariable String key,                                  // 문자열 키
            Authentication auth) {                                     // 인증 정보

        int affected = isAdmin(auth)                                   // 관리자면 어떤 글이든
                ? postDao.deleteAny(key)
                : postDao.deleteIfOwner(key, username(auth));          // 일반 사용자는 본인 글만

        if (affected > 0) return ResponseEntity.ok().build();          // 삭제 성공

        return isAdmin(auth)                                           // 실패했을 때
                ? ResponseEntity.notFound().build()                    // 관리자: 글 없음(404)
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build(); // 일반: 권한 없음(403)
    }
}
