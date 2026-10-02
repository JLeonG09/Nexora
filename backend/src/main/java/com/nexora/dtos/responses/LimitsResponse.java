package com.nexora.dtos.responses;

import com.nexora.entities.enums.MandateStatus;
import java.time.Instant;
import java.util.UUID;

public record LimitsResponse(
        UUID mandateId,
        String asset,
        String dailyLimit,
        String spentLast24h,
        String availableLast24h,
        String perTxLimit,
        String approvalThreshold,
        Instant expiresAt,
        MandateStatus status) {
}
