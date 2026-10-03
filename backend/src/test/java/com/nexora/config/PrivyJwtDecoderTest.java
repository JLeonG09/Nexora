package com.nexora.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * Decoder de producción ({@link SecurityConfig#privyJwtDecoder}), no el de
 * {@link TestProfileJwtDecoder}. El JWKS lo sirve un HTTP embebido.
 */
class PrivyJwtDecoderTest {

    private static final String APP_ID = "app-de-prueba";

    private static HttpServer server;
    private static ExecutorService executor;
    private static ECKey ecKey;
    private static RSAKey rsaKey;
    private static JWSSigner ecSigner;
    private static JWSSigner rsaSigner;
    private static JwtDecoder decoder;

    @BeforeAll
    static void jwksLocalYDecoderDeProduccion() throws Exception {
        ecKey = new ECKeyGenerator(Curve.P_256).keyID("ec-privy").generate();
        rsaKey = new RSAKeyGenerator(2048).keyID("rsa-ajena").generate();
        ecSigner = new ECDSASigner(ecKey);
        rsaSigner = new RSASSASigner(rsaKey);
        byte[] jwks = new JWKSet(List.of(ecKey.toPublicJWK(), rsaKey.toPublicJWK()))
                .toString()
                .getBytes(StandardCharsets.UTF_8);

        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/jwks.json", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwks.length);
            exchange.getResponseBody().write(jwks);
            exchange.close();
        });
        executor = Executors.newCachedThreadPool(r -> {
            Thread thread = new Thread(r, "jwks-test");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.start();

        String jwkSetUri = "http://127.0.0.1:" + server.getAddress().getPort() + "/jwks.json";
        decoder = SecurityConfig.privyJwtDecoder(jwkSetUri, APP_ID, new RestTemplateBuilder()
                .connectTimeout(SecurityConfig.JWKS_CONNECT_TIMEOUT)
                .readTimeout(SecurityConfig.JWKS_READ_TIMEOUT)
                .build());
    }

    @AfterAll
    static void stop() {
        if (server != null) {
            server.stop(0);
        }
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    void tokenEs256ValidoPasa() throws Exception {
        Jwt jwt = decoder.decode(token(JWSAlgorithm.ES256, ecSigner, ecKey.getKeyID(),
                PrivyTokenValidator.ISSUER, APP_ID, hoursFromNow(1)));

        assertThat(jwt.getSubject()).isEqualTo("did:privy:usuario");
        assertThat(jwt.getAudience()).containsExactly(APP_ID);
        assertThat(jwt.getExpiresAt()).isNotNull();
    }

    @Test
    void tokenRs256FallaAunqueLaClaveEsteEnElJwks() {
        assertThatThrownBy(() -> decoder.decode(token(JWSAlgorithm.RS256, rsaSigner, rsaKey.getKeyID(),
                PrivyTokenValidator.ISSUER, APP_ID, hoursFromNow(1))))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenSinExpFalla() {
        assertThatThrownBy(() -> decoder.decode(token(JWSAlgorithm.ES256, ecSigner, ecKey.getKeyID(),
                PrivyTokenValidator.ISSUER, APP_ID, null)))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenConAudIncorrectoFalla() {
        assertThatThrownBy(() -> decoder.decode(token(JWSAlgorithm.ES256, ecSigner, ecKey.getKeyID(),
                PrivyTokenValidator.ISSUER, "otra-app", hoursFromNow(1))))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenVencidoFalla() {
        assertThatThrownBy(() -> decoder.decode(token(JWSAlgorithm.ES256, ecSigner, ecKey.getKeyID(),
                PrivyTokenValidator.ISSUER, APP_ID, Date.from(Instant.now().minus(10, ChronoUnit.MINUTES)))))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void tokenConIssDistintoFalla() {
        assertThatThrownBy(() -> decoder.decode(token(JWSAlgorithm.ES256, ecSigner, ecKey.getKeyID(),
                "otro-emisor", APP_ID, hoursFromNow(1))))
                .isInstanceOf(JwtException.class);
    }

    private static Date hoursFromNow(int hours) {
        return Date.from(Instant.now().plus(hours, ChronoUnit.HOURS));
    }

    private static String token(JWSAlgorithm algorithm, JWSSigner signer, String keyId, String issuer,
                                String audience, Date expiresAt) throws Exception {
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience(audience)
                .subject("did:privy:usuario")
                .issueTime(new Date());
        if (expiresAt != null) {
            claims.expirationTime(expiresAt);
        }
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(algorithm).keyID(keyId).build(), claims.build());
        jwt.sign(signer);
        return jwt.serialize();
    }
}
