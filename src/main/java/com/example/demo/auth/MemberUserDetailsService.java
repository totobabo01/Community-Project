// src/main/java/com/example/demo/auth/MemberUserDetailsService.java               // 표준 Maven/Gradle 소스 경로 + 파일명(관례적으로 패키지와 일치)

package com.example.demo.auth;                                                   // 인증 관련 컴포넌트를 모아둔 패키지 선언

// ───────────────────────────────────────────────────────────────────────────────
// JDK & 컬렉션/스트림
// ───────────────────────────────────────────────────────────────────────────────
import java.util.List;                                                           // 다수의 권한(GrantedAuthority) 등을 담을 List 컬렉션
import java.util.stream.Collectors;                                              // Stream → Collection 변환 시 collect(...) 사용

import org.springframework.beans.factory.annotation.Qualifier;                   // 동일 타입의 빈이 여러 개일 때 특정 빈을 지정하는 애너테이션
import org.springframework.security.core.GrantedAuthority;                       // 스프링 시큐리티가 이해하는 "권한"의 표준 인터페이스
import org.springframework.security.core.authority.SimpleGrantedAuthority;       // 문자열 기반의 간단한 권한 구현체 (예: "ROLE_USER")
import org.springframework.security.core.userdetails.UserDetails;                // 시큐리티 내부에서 사용자 정보를 담는 규격 인터페이스
import org.springframework.security.core.userdetails.UserDetailsService;         // username으로 사용자를 로딩하는 서비스 규격(필수 확장 포인트)
import org.springframework.security.core.userdetails.UsernameNotFoundException;  // 사용자가 없을 때 표준적으로 던지는 예외
import org.springframework.stereotype.Service;                                    // 스프링 컴포넌트 스캔으로 서비스 빈 등록

import com.example.demo.dao.IUserDao;                                            // users 테이블 접근(조회 등)을 위한 DAO 인터페이스
import com.example.demo.dao.IUserRoleDao;                                        // users_roles(또는 roles 매핑) 테이블 접근 DAO 인터페이스
import com.example.demo.dao.UserDao;                                             // 구현체(또는 구성) 식별용 Qualifier 상수 보유 클래스
import com.example.demo.dao.UserRoleDao;                                         // 구현체(또는 구성) 식별용 Qualifier 상수 보유 클래스
import com.example.demo.domain.User;                                             // DB의 users 레코드를 담는 도메인 엔티티

// ───────────────────────────────────────────────────────────────────────────────
// 서비스 빈 선언: 스프링 시큐리티가 AuthenticationProvider 과정에서 호출
// ───────────────────────────────────────────────────────────────────────────────
@Service                                                                          // 이 클래스를 Service 빈으로 등록(컴포넌트 스캔 대상)
public class MemberUserDetailsService implements UserDetailsService {             // UserDetailsService 구현: "username으로 사용자 로딩" 규약 제공

  // ─────────────────────────────────────────────────────────────────────────────
  // 필요한 의존성(DAO) 주입: 생성자 주입을 권장 (테스트 용이, 불변, NPE 예방)
  // ─────────────────────────────────────────────────────────────────────────────
  private final IUserDao userDao;                                                 // 사용자 기본 정보(users) 조회용 DAO
  private final IUserRoleDao userRoleDao;                                         // 사용자 권한(users_roles) 조회용 DAO

  // 생성자 주입: 동일 타입 빈이 여러 개인 경우 @Qualifier로 정확한 빈 선택
  public MemberUserDetailsService(
      @Qualifier(UserDao.BEAN_QUALIFIER) IUserDao userDao,                        // 실제 등록된 UserDao 구현체를 지목하는 Qualifier
      @Qualifier(UserRoleDao.BEAN_QUALIFIER) IUserRoleDao userRoleDao             // 실제 등록된 UserRoleDao 구현체를 지목하는 Qualifier
  ) {
    this.userDao = userDao;                                                       // 필드 초기화(불변 참조)
    this.userRoleDao = userRoleDao;                                               // 필드 초기화(불변 참조)
  }

  /**
   * 스프링 시큐리티가 로그인 시 호출하는 핵심 메서드.
   * - 파라미터 username: 일반적으로 "로그인 아이디"(여기서는 user_id)를 의미
   * - 반환: UserDetails 구현체(아이디, 해시된 비밀번호, 권한 목록을 포함)
   * - 예외: 사용자가 없으면 반드시 UsernameNotFoundException을 던져 인증 실패를 유도
   */
  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    // 1) 아이디로 사용자 조회: Optional<User>를 반환한다고 가정, 없으면 UsernameNotFoundException 던지기
    User u = userDao.findById(username)                                           // DAO에서 user_id = username으로 단건 조회
        .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username)); // 없으면 표준 예외로 실패 처리

    // 2) 권한(roles) 조회: 예) ["ADMIN", "USER"] 같은 문자열들의 리스트라고 가정
    //    스프링 시큐리티는 "ROLE_" 접두어가 붙은 문자열을 권한으로 인식하는 관례가 있음.
    //    따라서 "ADMIN" → "ROLE_ADMIN"으로 매핑하여 SimpleGrantedAuthority로 감쌈.
    List<GrantedAuthority> authorities = userRoleDao.findRolesByUserId(u.getUserId()) // user_id로 권한 문자열 목록 조회
        .stream()                                                                  // 스트림으로 변환
        .map(role -> new SimpleGrantedAuthority("ROLE_" + role))                   // "ADMIN" → new SimpleGrantedAuthority("ROLE_ADMIN")
        .collect(Collectors.toList());                                             // 다시 List<GrantedAuthority>로 수집

    // 3) 표준 UserDetails 구현체(org.springframework.security.core.userdetails.User)로 포장하여 반환
    //    - 첫 번째 인자: principal(식별자, Authentication.getName()으로 사용됨)
    //    - 두 번째 인자: 인코딩(해시)된 비밀번호(BCrypt 등. 평문 아님!)
    //    - 세 번째 인자: 권한 목록(GrantedAuthority들)
    return new org.springframework.security.core.userdetails.User(
        u.getUserId(),                                                             // principal(인증 후 SecurityContext에 들어갈 사용자명)
        u.getPassword(),                                                           // 해시된 비밀번호(로그인 시 matches로 비교)
        authorities                                                                // 권한(ROLE_ 접두어 포함)
    );
  }
}
