package com.nexora.config;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jose.proc.SingleKeyJWSKeySelector;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/**
 * Decoder del perfil {@code test}: firma ES256 con una clave generada al arrancar.
 * Los tests emiten tokens con {@link #token}. No sustituye al JWKS de Privy fuera de ese perfil.
 */
@Configuration
@Profile("test")
public class TestProfileJwtDecoder {

    private static final ECKey KEY = generate();

    /**
     * {@code NimbusJwtDecoder.withPublicKey} solo acepta RSA. ES256 se arma con el
     * procesador de Nimbus y un selector de una sola clave, igual que el builder de RSA
     * de Spring, y el validador de claims queda en Spring (tiempo, iss, aud).
     */
    @Bean
    JwtDecoder jwtDecoder(AppProperties properties) {
        try {
            DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
            processor.setJWSKeySelector(new SingleKeyJWSKeySelector<>(JWSAlgorithm.ES256, KEY.toECPublicKey()));
            processor.setJWTClaimsSetVerifier((claims, context) -> { });
            NimbusJwtDecoder decoder = new NimbusJwtDecoder(processor);
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    new JwtTimestampValidator(), new PrivyTokenValidator(properties.privyAppId())));
            return decoder;
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo armar el decoder de prueba.", e);
        }
    }

    public static String token(String subject, String audience, String email) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(PrivyTokenValidator.ISSUER)
                .audience(List.of(audience))
                .subject(subject)
                .issuedAt(now)
                .expiresAt(now.plus(1, ChronoUnit.HOURS));
        if (email != null && !email.isBlank()) {
            claims.claim("email", email);
        }
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(KEY)));
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(SignatureAlgorithm.ES256).build(), claims.build())).getTokenValue();
    }

    private static ECKey generate() {
        try {
            return new ECKeyGenerator(Curve.P_256).keyID("test-privy").generate();
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }
}
