package com.nexora.config;

import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api/agent-tools/** exige X-Service-Key = AGENT_TOOLS_KEY. Si la clave configurada es corta
 * o está en la denylist, ninguna petición pasa. El usuario de esa llamada va en X-User-Id.
 */
@Component
public class ServiceKeyInterceptor implements HandlerInterceptor {

    public static final String HEADER = "X-Service-Key";

    private final byte[] expectedKey;
    private final boolean acceptable;

    public ServiceKeyInterceptor(AppProperties properties) {
        String configured = properties.agentToolsKey();
        this.acceptable = !StartupSecretsCheck.isWeakServiceKey(configured);
        this.expectedKey = configured == null ? new byte[0] : configured.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }
        String key = request.getHeader(HEADER);
        if (!acceptable || key == null || !MessageDigest.isEqual(expectedKey, key.getBytes(StandardCharsets.UTF_8))) {
            throw new ApiException(ErrorCode.CLAVE_SERVICIO_INVALIDA);
        }
        return true;
    }
}
