package com.nexora.config;

import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

/** Usuario de la petición actual, resuelto por {@link CurrentUserInterceptor} a partir del subject del JWT. */
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
