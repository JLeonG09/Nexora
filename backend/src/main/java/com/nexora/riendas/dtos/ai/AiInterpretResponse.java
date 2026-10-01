package com.nexora.riendas.dtos.ai;

import java.util.List;
import java.util.UUID;

/**
 * Respuesta de la IA. No es confiable: {@code action.arguments} se recibe como mapa crudo
 * para que el validador detecte campos extra o tipos incorrectos (regla 1).
 */
public record AiInterpretResponse(
        UUID requestId,
        String type,
        AiAction action,
        String message,
        Double confidence,
        String explanation,
        List<String> ungroundedFields,
        String model) {

    public static final String TYPE_ACTION = "action";
    public static final String TYPE_MESSAGE = "message";
}
