package com.nexora.config;

import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.repositories.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Resuelve el usuario de la petición a partir del {@code sub} del access token.
 * {@code X-User-Id} solo se acepta en {@code /api/agent-tools}, que ya exigió la clave de servicio.
 */
@Component
public class CurrentUserInterceptor implements HandlerInterceptor {

    /** Cabecera interna de /api/agent-tools. La API de usuario no la lee. */
    public static final String AGENT_TOOLS_USER_HEADER = "X-User-Id";

    private final UserRepository userRepository;
    private final CurrentUser currentUser;

    public CurrentUserInterceptor(UserRepository userRepository, CurrentUser currentUser) {
        this.userRepository = userRepository;
        this.currentUser = currentUser;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        if (request.getRequestURI().startsWith("/api/agent-tools")) {
            UUID userId = parseUserId(request.getHeader(AGENT_TOOLS_USER_HEADER));
            if (!userRepository.existsById(userId)) {
                throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
            }
            currentUser.set(userId);
            return true;
        }
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuth) || jwtAuth.getToken().getSubject() == null
                || jwtAuth.getToken().getSubject().isBlank()) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
        String did = jwtAuth.getToken().getSubject();
        if (isCreateUser(request)) {
            return true;
        }
        currentUser.set(userRepository.findByPrivyDid(did)
                .orElseThrow(() -> new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO))
                .getId());
        return true;
    }

    private static boolean isCreateUser(HttpServletRequest request) {
        return HttpMethod.POST.matches(request.getMethod()) && "/api/users".equals(request.getRequestURI());
    }

    private static UUID parseUserId(String header) {
        if (header == null || header.isBlank()) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
        try {
            return UUID.fromString(header.trim());
        } catch (IllegalArgumentException e) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
    }
}
