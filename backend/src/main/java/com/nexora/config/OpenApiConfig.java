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
                                + "Usa el botón Authorize con el id devuelto por POST /api/users. "
                                + "Las herramientas de la IA (/api/agent-tools) además piden X-Service-Key."))
                .components(new Components()
                        .addSecuritySchemes(USER_HEADER_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name(CurrentUserInterceptor.HEADER))
                        .addSecuritySchemes(SERVICE_KEY_SCHEME, new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name(ServiceKeyInterceptor.HEADER)))
                .addSecurityItem(new SecurityRequirement().addList(USER_HEADER_SCHEME));
    }
}
