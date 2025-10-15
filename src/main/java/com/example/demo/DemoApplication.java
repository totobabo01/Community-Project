// 애플리케이션의 최상위 패키지 (하위 패키지까지 컴포넌트 스캔 대상이 됨)
package com.example.demo;

import org.springframework.boot.SpringApplication;              // 스프링 부트 앱을 부팅/실행하는 유틸리티
import org.springframework.boot.autoconfigure.SpringBootApplication; // 자동 설정 + 컴포넌트 스캔 + 구성 클래스를 묶은 애너테이션

// @SpringBootApplication = @Configuration + @EnableAutoConfiguration + @ComponentScan
// => com.example.demo 및 그 하위 패키지의 @Component/@Service/@Repository/@RestController 등을 자동 등록
@SpringBootApplication
public class DemoApplication {

  // 자바 애플리케이션 진입점(main). 여기서 스프링 컨테이너를 띄우고, 내장 웹서버(Undertow/Tomcat 등)를 시작함
  public static void main(String[] args) {
    // 애플리케이션 실행. args에는 --server.port=8091 같은 런타임 인자를 넘길 수 있음
    SpringApplication.run(DemoApplication.class, args);
  }
}
