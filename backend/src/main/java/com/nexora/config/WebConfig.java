package com.nexora.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ServiceKeyInterceptor serviceKeyInterceptor;
    private final CurrentUserInterceptor currentUserInterceptor;

    public WebConfig(ServiceKeyInterceptor serviceKeyInterceptor, CurrentUserInterceptor currentUserInterceptor) {
        this.serviceKeyInterceptor = serviceKeyInterceptor;
        this.currentUserInterceptor = currentUserInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(serviceKeyInterceptor)
                .addPathPatterns("/api/agent-tools/**");
        registry.addInterceptor(currentUserInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/health");
    }
}
