package com.nexora.riendas.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final CurrentUserInterceptor currentUserInterceptor;

    public WebConfig(CurrentUserInterceptor currentUserInterceptor) {
        this.currentUserInterceptor = currentUserInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(currentUserInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/health", "/api/agent-tools/**");
    }
}
