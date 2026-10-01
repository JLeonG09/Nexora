package com.nexora.riendas.exceptions;

/** El RPC de Stellar no respondió o respondió algo ilegible. La conciliación reintenta en la próxima vuelta. */
public class StellarEventsUnavailableException extends RuntimeException {

    public StellarEventsUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
