package com.nexora.riendas.config;

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

    @Bean
    public OpenAPI riendasOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Riendas API")
                        .version("v1.1")
                        .description("Backend de Riendas: mandatos, validación y auditoría de pagos del agente. "
                                + "Usa el botón Authorize con el id devuelto por POST /api/users."))
                .components(new Components().addSecuritySchemes(USER_HEADER_SCHEME, new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.HEADER)
                        .name(CurrentUserInterceptor.HEADER)))
                .addSecurityItem(new SecurityRequirement().addList(USER_HEADER_SCHEME));
    }
}
