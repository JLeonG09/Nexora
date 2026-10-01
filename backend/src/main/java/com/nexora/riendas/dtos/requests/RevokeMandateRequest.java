package com.nexora.riendas.dtos.requests;

import jakarta.validation.constraints.Pattern;

/** {@code revokeTxHash} va null en la primera llamada y con el hash de kit.rules.remove en la segunda. */
public record RevokeMandateRequest(
        @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "El hash debe tener 64 caracteres hexadecimales.")
        String revokeTxHash) {
}
