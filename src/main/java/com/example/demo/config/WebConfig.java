// src/main/java/com/example/demo/config/WebConfig.java
package com.example.demo.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // "uploads" 폴더를 정적 리소스로 노출
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/"); // 프로젝트 실행 위치 기준 "uploads" 디렉터리
    }
}
