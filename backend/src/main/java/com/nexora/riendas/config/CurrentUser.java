package com.nexora.riendas.config;

import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

/** Usuario de la petición actual, resuelto por {@link CurrentUserInterceptor} a partir de X-User-Id. */
@Component
@RequestScope
public class CurrentUser {

    private UUID id;

    public UUID id() {
        if (id == null) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
        return id;
    }

    public void set(UUID id) {
        this.id = id;
    }
}
