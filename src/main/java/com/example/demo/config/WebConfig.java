// src/main/java/com/example/demo/config/WebConfig.java
package com.example.demo.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // /uploads/** 로 들어오는 요청을 C:/upload 폴더의 실제 파일로 매핑
        // 예) /uploads/test.jpg  →  C:/upload/test.jpg
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:C:/upload/");
    }
}
