package com.nexora.riendas.dtos.signer;

/** error de una respuesta FALLIDO: code (p. ej. SpendingLimitExceeded), contractCode, stage, message y raw. */
public record SignerErrorDto(String code, Integer contractCode, String stage, String message, String raw) {
}
