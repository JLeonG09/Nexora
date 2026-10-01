package com.nexora.riendas.dtos.ai;

import java.math.BigDecimal;
import java.util.UUID;

/** Argumentos de propose_payment ya revisados por la regla 1 (esquema). */
public record ProposePaymentArguments(
        UUID contactId,
        String contactName,
        BigDecimal amount,
        String asset,
        String memo) {
}
