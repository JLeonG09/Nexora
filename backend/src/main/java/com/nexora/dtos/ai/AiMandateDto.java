package com.nexora.dtos.ai;

import java.time.Instant;

public record AiMandateDto(
        String status,
        String asset,
        String dailyLimit,
        String availableLast24h,
        String perTxLimit,
        String approvalThreshold,
        Instant expiresAt) {
}
