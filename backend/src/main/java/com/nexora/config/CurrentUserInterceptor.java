package com.nexora.config;

import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.repositories.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

// TODO(auth real): reemplazar X-User-Id por sesión autenticada con passkey (reto WebAuthn + JWT o SEP-45).
@Component
public class CurrentUserInterceptor implements HandlerInterceptor {

    public static final String HEADER = "X-User-Id";

    private final UserRepository userRepository;
    private final CurrentUser currentUser;

    public CurrentUserInterceptor(UserRepository userRepository, CurrentUser currentUser) {
        this.userRepository = userRepository;
        this.currentUser = currentUser;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CorsUtils.isPreFlightRequest(request) || isUserCreation(request) || isLogin(request)) {
            return true;
        }
        UUID userId = parse(request.getHeader(HEADER));
        if (!userRepository.existsById(userId)) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
        currentUser.set(userId);
        return true;
    }

    private static boolean isUserCreation(HttpServletRequest request) {
        return HttpMethod.POST.matches(request.getMethod()) && "/api/users".equals(request.getRequestURI());
    }

    private static boolean isLogin(HttpServletRequest request) {
        return HttpMethod.POST.matches(request.getMethod()) && "/api/users/login".equals(request.getRequestURI());
    }

    private static UUID parse(String header) {
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
