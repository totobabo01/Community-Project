package com.example.demo.auth;                                  // 이 클래스의 패키지 경로. 스캔/임포트 기준이 됨.

import java.util.List;                                          // 불변 리스트 생성(List.of) 등에 사용.

import org.springframework.security.core.authority.SimpleGrantedAuthority;          // 스프링 시큐리티의 UserDetails, User, UserDetailsService, 예외 등.
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;                   // 서비스 계층 컴포넌트 스테레오타입. 스프링 빈으로 등록.
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service                                                         // 컴포넌트 스캔 시 자동으로 빈 등록(비즈니스 로직 레이어).
public class MemberUserDetailsService implements UserDetailsService { 
                                                                 // 스프링 시큐리티가 인증 시 호출하는 계약을 구현.
                                                                 // AuthenticationManager → DaoAuthenticationProvider가 사용.

    private final MemberDao memberDao;                           // 회원 정보를 DB에서 조회할 DAO 의존성.

    public MemberUserDetailsService(MemberDao memberDao) {       // 생성자 주입(테스트 용이, 불변성 확보).
        this.memberDao = memberDao;                              // 주입받은 DAO를 필드에 저장.
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // 스프링 시큐리티가 로그인 시(username 기반) 호출하는 핵심 메서드.
        // 반환된 UserDetails에서 패스워드/권한/계정상태를 읽어 인증을 진행함.

        Member m = memberDao.findByUsername(username);           // DB에서 username으로 계정 조회.
        if (m == null || !m.isEnabled()) {                       // 없거나 비활성화된 계정이면
            throw new UsernameNotFoundException("User not found or disabled"); 
                                                                 // 표준 예외를 던져 인증 실패 처리.
        }
        return new User(                                         // 스프링 시큐리티 제공 User(UserDetails 구현체)로 래핑해 반환.
            m.getUsername(),                                     // 사용자명(Principal 이름).
            m.getPassword(),                                     // 인코딩된(해시된) 비밀번호(BCrypt 등).
            List.of(new SimpleGrantedAuthority(m.getRole()))     // 권한 목록. 예: ["ROLE_USER"].
                                                                 // 다중 권한이면 List.of(a, b, c) 형태로 전달.
        );
    }
}
