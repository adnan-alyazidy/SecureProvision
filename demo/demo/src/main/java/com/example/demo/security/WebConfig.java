package com.example.demo.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private AuthHeaderInterceptor authHeaderInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authHeaderInterceptor);
    }

    // هذا الفلتر يعمل كحارس بوابة رئيسي، ويجبر السيرفر على قبول جميع الطلبات والروابط قبل أي تعقيدات أخرى
    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowCredentials(true);
        config.addAllowedOriginPattern("*"); // يقبل الاتصال من أي واجهة (سواء Localhost أو نفق مايكروسوفت)
        config.addAllowedHeader("*"); // يسمح بمرور الهيدر السحري والهيدرز الخاصة بك
        config.addAllowedMethod("*"); // يقبل GET, POST, OPTIONS

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}