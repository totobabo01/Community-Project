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
        return auth != null &&
                auth.getAuthorities().stream()
                        .map(GrantedAuthority::getAuthority)
                        .anyMatch(a -> "ROLE_ADMIN".equalsIgnoreCase(a));
    }

    // 현재 로그인한 사용자의 username(아이디, 이메일 등)을 가져오는 유틸 메서드
    private static String username(Authentication auth) {
        return (auth == null) ? null : auth.getName();
    }

    /* =========================
     * 게시글 목록
     * ========================= */

    /** 게시판 코드별 목록 조회 + 페이지네이션 (code 예: "BUS", "NORM") */
    @GetMapping("/boards/{code}/posts")
    public PageDTO<PostDto> list(
            @PathVariable String code,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to
    ) {

        if (page < 0) page = 0;
        if (size <= 0) size = 10;

        if (type != null && type.isBlank()) type = null;
        if (keyword != null && keyword.isBlank()) keyword = null;
        if (from != null && from.isBlank()) from = null;
        if (to != null && to.isBlank()) to = null;

        long total = postDao.countByBoard(code, type, keyword, from, to);
        List<PostDto> rows = postDao.findByBoardPaged(code, page, size, type, keyword, from, to);

        return new PageDTO<>(rows, total, page, size);
    }

    /* =========================
     * 🔎 단건 조회
     * ========================= */

    private PostDto loadOneByIdOrKey(String idOrKey) {
        if (idOrKey != null && idOrKey.matches("\\d+")) {
            return postDao.findById(Long.parseLong(idOrKey));
        }
        return postDao.findByKey(idOrKey);
    }

    @GetMapping("/posts/{id}")
    public ResponseEntity<?> getOneById(
            @PathVariable String id,
            Authentication auth) {

        PostDto p = loadOneByIdOrKey(id);
        if (p == null) return ResponseEntity.notFound().build();

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(p);
    }

    @GetMapping("/posts/key/{key}")
    public ResponseEntity<?> getOneByKey(
            @PathVariable String key,
            Authentication auth) {

        PostDto p = loadOneByIdOrKey(key);
        if (p == null) return ResponseEntity.notFound().build();

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(p.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        return ResponseEntity.ok(p);
    }

    /* =========================
     * 게시글 생성 (파일 업로드 + 폴더 타입 지원)
     * ========================= */

    @PostMapping(
            value = "/boards/{code}/posts",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<PostDto> create(
            @PathVariable String code,
            @RequestParam("title") String title,
            @RequestParam("content") String content,
            // 👇 file / files 둘 다 허용 → 합쳐서 사용
            @RequestParam(name = "file",  required = false) List<MultipartFile> fileParam,
            @RequestParam(name = "files", required = false) List<MultipartFile> filesParam,
            @RequestParam(name = "isFolder",   required = false) Boolean isFolder,
            @RequestParam(name = "folderName", required = false) String folderName,
            Authentication auth) throws IOException {

        PostDto req = new PostDto();
        req.setBoardCode(code);
        req.setTitle(title);
        req.setContent(content);

        if (auth != null) {
            req.setWriterId(auth.getName());
            req.setWriterName(auth.getName());
        }

        // file / files 병합
        List<MultipartFile> allFiles = new ArrayList<>();
        if (fileParam  != null) allFiles.addAll(fileParam);
        if (filesParam != null) allFiles.addAll(filesParam);

        boolean folderFlag = Boolean.TRUE.equals(isFolder);

        if (folderFlag) {
            // 📁 폴더 글
            String name = (folderName == null || folderName.isBlank())
                    ? title
                    : folderName.trim();

            req.setFileUrl(null);
            req.setFileType("FOLDER");
            req.setFileName(name);
            req.setFileContentType(null);
            req.setFileListJson(null);
        } else {
            // 일반 글 + 여러 파일
            List<MultipartFile> effective = new ArrayList<>();
            for (MultipartFile f : allFiles) {
                if (f != null && !f.isEmpty()) {
                    effective.add(f);
                }
            }

            if (!effective.isEmpty()) {
                List<Map<String, Object>> metaList = new ArrayList<>();

                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Files.createDirectories(uploadPath);

                for (int i = 0; i < effective.size(); i++) {
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();
                    String contentType = file.getContentType();
                    long size = file.getSize();

                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;

                    Path target = uploadPath.resolve(savedName);
                    file.transferTo(target.toFile());

                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) fileType = "IMAGE";
                    else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER";
                    else fileType = "FILE";

                    String url = "/uploads/" + savedName;

                    if (i == 0) {
                        req.setFileUrl(url);
                        req.setFileType(fileType);
                        req.setFileName(originalName);
                        req.setFileContentType(contentType);
                    }

                    Map<String, Object> meta = new HashMap<>();
                    meta.put("name", originalName);
                    meta.put("url", url);
                    meta.put("contentType", contentType);
                    meta.put("size", size);
                    meta.put("fileType", fileType);

                    metaList.add(meta);
                }

                if (!metaList.isEmpty()) {
                    ObjectMapper om = new ObjectMapper();
                    String json = om.writeValueAsString(metaList);
                    req.setFileListJson(json);
                }
            }
        }

        Long id = postDao.insert(req);
        req.setPostId(id);
        return ResponseEntity.ok(req);
    }

    /* =========================
     * 파일 교체용 유틸 (단일 파일)
     * ========================= */

    private void replaceFile(PostDto target, MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) return;

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
        if (isImage) fileType = "IMAGE";
        else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER";
        else fileType = "FILE";

        target.setFileUrl("/uploads/" + savedName);
        target.setFileType(fileType);
        target.setFileName(originalName);
        target.setFileContentType(contentType);
        target.setFileListJson(null);
    }

    /* =========================
     * 게시글 수정 (JSON 전용)
     * ========================= */

    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Void> updateById(
            @PathVariable String id,
            @RequestBody PostDto req,
            Authentication auth) {

        PostDto existing = loadOneByIdOrKey(id);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (req.getTitle() != null) {
            existing.setTitle(req.getTitle());
        }
        if (req.getContent() != null) {
            existing.setContent(req.getContent());
        }

        int affected = postDao.update(existing);
        if (affected > 0) return ResponseEntity.ok().build();

        return ResponseEntity.notFound().build();
    }

    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<Void> updateByKey(
            @PathVariable String key,
            @RequestBody PostDto req,
            Authentication auth) {

        PostDto existing = loadOneByIdOrKey(key);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (req.getTitle() != null) {
            existing.setTitle(req.getTitle());
        }
        if (req.getContent() != null) {
            existing.setContent(req.getContent());
        }

        int affected = postDao.update(existing);
        if (affected > 0) return ResponseEntity.ok().build();

        return ResponseEntity.notFound().build();
    }

    /* =========================
     * 게시글 수정 (multipart/form-data – 파일/폴더 교체 포함)
     * ========================= */

    @PutMapping(
            value = "/posts/{id}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> updateByIdMultipart(
            @PathVariable String id,
            @RequestParam("title") String title,
            @RequestParam("content") String content,
            // 👇 file / files 둘 다 허용
            @RequestParam(name = "file",  required = false) List<MultipartFile> fileParam,
            @RequestParam(name = "files", required = false) List<MultipartFile> filesParam,
            @RequestParam(name = "isFolder",   required = false) Boolean isFolder,
            @RequestParam(name = "folderName", required = false) String folderName,
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(id);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        existing.setTitle(title);
        existing.setContent(content);

        // 병합
        List<MultipartFile> allFiles = new ArrayList<>();
        if (fileParam  != null) allFiles.addAll(fileParam);
        if (filesParam != null) allFiles.addAll(filesParam);

        boolean folderFlag = Boolean.TRUE.equals(isFolder);

        if (folderFlag) {
            String oldUrl = existing.getFileUrl();
            if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                Files.deleteIfExists(oldPath);
            }
            String name = (folderName == null || folderName.isBlank())
                    ? title
                    : folderName.trim();

            existing.setFileUrl(null);
            existing.setFileType("FOLDER");
            existing.setFileName(name);
            existing.setFileContentType(null);
            existing.setFileListJson(null);
        } else {
            List<MultipartFile> effective = new ArrayList<>();
            for (MultipartFile f : allFiles) {
                if (f != null && !f.isEmpty()) effective.add(f);
            }

            if (!effective.isEmpty()) {
                String oldUrl = existing.getFileUrl();
                if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                    Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                    Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                    Files.deleteIfExists(oldPath);
                }

                List<Map<String, Object>> metaList = new ArrayList<>();
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Files.createDirectories(uploadPath);

                for (int i = 0; i < effective.size(); i++) {
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();
                    String contentType = file.getContentType();
                    long size = file.getSize();

                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;

                    Path target = uploadPath.resolve(savedName);
                    file.transferTo(target.toFile());

                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) fileType = "IMAGE";
                    else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER";
                    else fileType = "FILE";

                    String url = "/uploads/" + savedName;

                    if (i == 0) {
                        existing.setFileUrl(url);
                        existing.setFileType(fileType);
                        existing.setFileName(originalName);
                        existing.setFileContentType(contentType);
                    }

                    Map<String, Object> meta = new HashMap<>();
                    meta.put("name", originalName);
                    meta.put("url", url);
                    meta.put("contentType", contentType);
                    meta.put("size", size);
                    meta.put("fileType", fileType);

                    metaList.add(meta);
                }

                if (!metaList.isEmpty()) {
                    ObjectMapper om = new ObjectMapper();
                    String json = om.writeValueAsString(metaList);
                    existing.setFileListJson(json);
                } else {
                    existing.setFileListJson(null);
                }
            }
        }

        int affected = postDao.update(existing);
        if (affected > 0) return ResponseEntity.ok().build();

        return ResponseEntity.notFound().build();
    }

    @PutMapping(
            value = "/posts/key/{key}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public ResponseEntity<Void> updateByKeyMultipart(
            @PathVariable String key,
            @RequestParam("title") String title,
            @RequestParam("content") String content,
            @RequestParam(name = "file",  required = false) List<MultipartFile> fileParam,
            @RequestParam(name = "files", required = false) List<MultipartFile> filesParam,
            @RequestParam(name = "isFolder",   required = false) Boolean isFolder,
            @RequestParam(name = "folderName", required = false) String folderName,
            Authentication auth) throws IOException {

        PostDto existing = loadOneByIdOrKey(key);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        String me = username(auth);
        if (!(isAdmin(auth) || (me != null && me.equals(existing.getWriterId())))) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        existing.setTitle(title);
        existing.setContent(content);

        List<MultipartFile> allFiles = new ArrayList<>();
        if (fileParam  != null) allFiles.addAll(fileParam);
        if (filesParam != null) allFiles.addAll(filesParam);

        boolean folderFlag = Boolean.TRUE.equals(isFolder);

        if (folderFlag) {
            String oldUrl = existing.getFileUrl();
            if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                Files.deleteIfExists(oldPath);
            }
            String name = (folderName == null || folderName.isBlank())
                    ? title
                    : folderName.trim();

            existing.setFileUrl(null);
            existing.setFileType("FOLDER");
            existing.setFileName(name);
            existing.setFileContentType(null);
            existing.setFileListJson(null);
        } else {
            List<MultipartFile> effective = new ArrayList<>();
            for (MultipartFile f : allFiles) {
                if (f != null && !f.isEmpty()) effective.add(f);
            }

            if (!effective.isEmpty()) {
                String oldUrl = existing.getFileUrl();
                if (oldUrl != null && oldUrl.startsWith("/uploads/")) {
                    Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                    Path oldPath = uploadPath.resolve(oldUrl.substring("/uploads/".length()));
                    Files.deleteIfExists(oldPath);
                }

                List<Map<String, Object>> metaList = new ArrayList<>();
                Path uploadPath = Paths.get(uploadDir).toAbsolutePath();
                Files.createDirectories(uploadPath);

                for (int i = 0; i < effective.size(); i++) {
                    MultipartFile file = effective.get(i);

                    String originalName = file.getOriginalFilename();
                    String contentType = file.getContentType();
                    long size = file.getSize();

                    String safeName = (originalName == null) ? "" : originalName.replaceAll("\\s+", "_");
                    String savedName = UUID.randomUUID().toString() + "_" + safeName;

                    Path target = uploadPath.resolve(savedName);
                    file.transferTo(target.toFile());

                    String fileType;
                    boolean isImage = (contentType != null && contentType.toLowerCase().startsWith("image/"));
                    if (isImage) fileType = "IMAGE";
                    else if (originalName != null && !originalName.contains(".")) fileType = "FOLDER";
                    else fileType = "FILE";

                    String url = "/uploads/" + savedName;

                    if (i == 0) {
                        existing.setFileUrl(url);
                        existing.setFileType(fileType);
                        existing.setFileName(originalName);
                        existing.setFileContentType(contentType);
                    }

                    Map<String, Object> meta = new HashMap<>();
                    meta.put("name", originalName);
                    meta.put("url", url);
                    meta.put("contentType", contentType);
                    meta.put("size", size);
                    meta.put("fileType", fileType);

                    metaList.add(meta);
                }

                if (!metaList.isEmpty()) {
                    ObjectMapper om = new ObjectMapper();
                    String json = om.writeValueAsString(metaList);
                    existing.setFileListJson(json);
                } else {
                    existing.setFileListJson(null);
                }
            }
        }

        int affected = postDao.update(existing);
        if (affected > 0) return ResponseEntity.ok().build();

        return ResponseEntity.notFound().build();
    }

    /* =========================
     * 게시글 삭제
     * ========================= */

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable String id,
            Authentication auth) {

        int affected = isAdmin(auth)
                ? postDao.deleteAny(id)
                : postDao.deleteIfOwner(id, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();

        return isAdmin(auth)
                ? ResponseEntity.notFound().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    @DeleteMapping("/posts/key/{key}")
    public ResponseEntity<Void> deleteByKey(
            @PathVariable String key,
            Authentication auth) {

        int affected = isAdmin(auth)
                ? postDao.deleteAny(key)
                : postDao.deleteIfOwner(key, username(auth));

        if (affected > 0) return ResponseEntity.ok().build();

        return isAdmin(auth)
                ? ResponseEntity.notFound().build()
                : ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
}
