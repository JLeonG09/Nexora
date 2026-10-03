package com.nexora.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Comprueba los claims del access token de Privy.
 *
 * La documentación oficial (docs.privy.io, "Access tokens") fija el algoritmo ES256,
 * {@code iss = privy.io} y {@code aud} igual al App ID. {@code sub} es el DID del usuario.
 * {@code iss} no es una URL, así que no se usa {@code issuer-uri} de Spring (eso dispararía
 * el descubrimiento OIDC).
 */
public class PrivyTokenValidator implements OAuth2TokenValidator<Jwt> {

    static final String ISSUER = "privy.io";

    private final String appId;

    public PrivyTokenValidator(String appId) {
        this.appId = appId;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        List<OAuth2Error> errors = new ArrayList<>();
        if (!ISSUER.equals(jwt.getClaimAsString("iss"))) {
            errors.add(new OAuth2Error("invalid_token", "El emisor del token no es privy.io.", null));
        }
        if (appId == null || appId.isBlank() || jwt.getAudience() == null || !jwt.getAudience().contains(appId)) {
            errors.add(new OAuth2Error("invalid_token", "El token no es de esta aplicación.", null));
        }
        if (errors.isEmpty()) {
            return OAuth2TokenValidatorResult.success();
        }
        return OAuth2TokenValidatorResult.failure(errors);
    }
}
