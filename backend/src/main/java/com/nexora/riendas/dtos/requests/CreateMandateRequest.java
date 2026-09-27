package com.nexora.riendas.dtos.requests;

import com.nexora.riendas.services.Money;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;

public record CreateMandateRequest(
        @NotBlank(message = "El tope diario es obligatorio.")
        @Pattern(regexp = Money.AMOUNT_REGEX, message = "El monto debe ser un número positivo con hasta 7 decimales.")
        String dailyLimit,

        @NotBlank(message = "El tope por transacción es obligatorio.")
        @Pattern(regexp = Money.AMOUNT_REGEX, message = "El monto debe ser un número positivo con hasta 7 decimales.")
        String perTxLimit,

        @NotBlank(message = "El umbral de aprobación es obligatorio.")
        @Pattern(regexp = Money.AMOUNT_REGEX, message = "El monto debe ser un número positivo con hasta 7 decimales.")
        String approvalThreshold,

        @NotBlank(message = "El activo es obligatorio.")
        @Pattern(regexp = "^USDC$", message = "Por ahora solo se admite USDC.")
        String asset,

        @NotNull(message = "La fecha de expiración es obligatoria.")
        Instant expiresAt,

        @NotNull(message = "El contextRuleId es obligatorio.")
        @Min(value = 0, message = "El contextRuleId no puede ser negativo.")
        Integer contextRuleId,

        @NotNull(message = "El validUntilLedger es obligatorio.")
        @Min(value = 1, message = "El validUntilLedger debe ser mayor que 0.")
        Long validUntilLedger,

        @NotBlank(message = "El hash de la transacción de creación es obligatorio.")
        @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "El hash debe tener 64 caracteres hexadecimales.")
        String createTxHash,

        @NotNull(message = "La versión de la llave es obligatoria.")
        @Min(value = 1, message = "La versión de la llave empieza en 1.")
        Integer keyVersion,

        @NotBlank(message = "La llave pública del agente es obligatoria.")
        @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "La llave pública debe tener 64 caracteres hexadecimales.")
        String agentPublicKeyHex) {
}
