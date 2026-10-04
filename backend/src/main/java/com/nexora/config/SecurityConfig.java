package com.nexora.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.exceptions.ErrorCode;
import com.nexora.exceptions.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.web.client.RestOperations;

/**
 * API stateless: el access token de Privy viaja en {@code Authorization: Bearer}.
 * No hay cookies de sesión, así que CSRF no aplica.
 *
 * <p>Las claves públicas salen del JWKS de la app
 * ({@code https://auth.privy.io/api/v1/apps/{PRIVY_APP_ID}/jwks.json}), que es el mismo
 * juego de claves que usa el SDK al verificar el token. El validador propio exige
 * {@code iss}, {@code aud} y {@code exp}. Privy firma en ES256; sin fijar el algoritmo,
 * Spring solo acepta RS256.
 */
@Configuration
public class SecurityConfig {

    static final String JWKS_URL = "https://auth.privy.io/api/v1/apps/%s/jwks.json";

    /** Tope de conexión y lectura al pedir el JWKS. Entre 2 y 3 s, como pide el informe. */
    static final Duration JWKS_CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration JWKS_READ_TIMEOUT = Duration.ofSeconds(3);

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .cors(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/health", "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/api/agent-tools/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth
                        .jwt(Customizer.withDefaults())
                        .authenticationEntryPoint(new JsonAuthenticationEntryPoint(objectMapper)));
        return http.build();
    }

    @Bean
    @Profile("!test")
    JwtDecoder jwtDecoder(AppProperties properties, RestTemplateBuilder restTemplateBuilder) {
        String appId = properties.privyAppId() == null ? "" : properties.privyAppId().trim();
        if (appId.isEmpty()) {
            return token -> {
                throw new BadJwtException("Falta PRIVY_APP_ID para validar el access token.");
            };
        }
        RestOperations jwksClient = restTemplateBuilder
                .connectTimeout(JWKS_CONNECT_TIMEOUT)
                .readTimeout(JWKS_READ_TIMEOUT)
                .build();
        return privyJwtDecoder(JWKS_URL.formatted(appId), appId, jwksClient);
    }

    /**
     * Decoder de producción: ES256, JWKS por HTTP con timeouts y validadores de tiempo,
     * {@code exp}, {@code iss} y {@code aud}. El perfil {@code test} no lo usa.
     */
    static JwtDecoder privyJwtDecoder(String jwkSetUri, String appId, RestOperations jwksClient) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri)
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .restOperations(jwksClient)
                .build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(),
                new JwtClaimValidator<>(JwtClaimNames.EXP, Objects::nonNull),
                new PrivyTokenValidator(appId)));
        return decoder;
    }

    /**
     * 401 con el mismo cuerpo que el resto de la API.
     * {@code BearerTokenAuthenticationEntryPoint} es final: se delega para el
     * {@code WWW-Authenticate} y después se escribe el JSON.
     */
    static final class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

        private final ObjectMapper objectMapper;
        private final BearerTokenAuthenticationEntryPoint bearer = new BearerTokenAuthenticationEntryPoint();

        JsonAuthenticationEntryPoint(ObjectMapper objectMapper) {
            this.objectMapper = objectMapper;
        }

        @Override
        public void commence(HttpServletRequest request, HttpServletResponse response,
                             AuthenticationException authException) throws java.io.IOException {
            bearer.commence(request, response, authException);
            ErrorCode code = ErrorCode.USUARIO_NO_IDENTIFICADO;
            ErrorResponse body = new ErrorResponse(Instant.now(), code.status().value(), code.name(),
                    code.defaultMessage(), request.getRequestURI(), List.of(), UUID.randomUUID().toString());
            response.setStatus(code.status().value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(response.getOutputStream(), body);
        }
    }
}
