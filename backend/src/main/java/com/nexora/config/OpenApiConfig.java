package com.nexora.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String USER_HEADER_SCHEME = "X-User-Id";
    private static final String SERVICE_KEY_SCHEME = "X-Service-Key";

    @Bean
    public OpenAPI nexoraOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Nexora API")
                        .version("v1.1")
                        .description("Backend de Nexora: mandatos, validación y auditoría de pagos del agente. "
                                + "Las rutas de usuario exigen el access token de Privy (Authorization: Bearer). "
                                + "Las herramientas de la IA (/api/agent-tools) piden X-Service-Key y X-User-Id."))
                .components(new Components()
                        .addSecuritySchemes("bearer", new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT"))
                        .addSecuritySchemes(USER_HEADER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name(CurrentUserInterceptor.AGENT_TOOLS_USER_HEADER))
                        .addSecuritySchemes(SERVICE_KEY_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name(ServiceKeyInterceptor.HEADER)))
                .addSecurityItem(new SecurityRequirement().addList("bearer"));
    }
}
