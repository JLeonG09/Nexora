package com.nexora.riendas.exceptions;

/** La IA no respondió, tardó o respondió algo inválido → 503 IA_NO_DISPONIBLE. */
public class AiUnavailableException extends RuntimeException {

    public AiUnavailableException(String message) {
        super(message);
    }

    public AiUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
