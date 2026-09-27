package com.nexora.riendas.exceptions;

/**
 * El firmante respondió 4xx sin firmar (p. ej. 400 LLAVE_NO_COINCIDE o SOLICITUD_INVALIDA).
 * No se reintenta: la propuesta pasa a FALLIDO con ese código.
 */
public class SignerRejectedException extends RuntimeException {

    private final String code;

    public SignerRejectedException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
