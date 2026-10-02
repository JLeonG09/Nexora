package com.nexora.exceptions;

/** El firmante no respondió (timeout, 5xx) → 503 FIRMANTE_NO_DISPONIBLE. */
public class SignerUnavailableException extends RuntimeException {

    public SignerUnavailableException(String message) {
        super(message);
    }

    public SignerUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
