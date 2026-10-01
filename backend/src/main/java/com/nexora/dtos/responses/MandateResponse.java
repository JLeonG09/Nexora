package com.nexora.dtos.responses;

import com.nexora.entities.Mandate;
import com.nexora.entities.enums.MandateStatus;
import com.nexora.entities.enums.RevokeReason;
import com.nexora.services.Money;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;

public record MandateResponse(
        UUID id,
        UUID accountId,
        String dailyLimit,
        String perTxLimit,
        String approvalThreshold,
        String asset,
        String assetContractId,
        Instant expiresAt,
        MandateStatus status,
        int keyVersion,
        String agentPublicKeyHex,
        int contextRuleId,
        long validUntilLedger,
        String createTxHash,
        String revokeTxHash,
        RevokeReason revokeReason,
        Instant revokedAt,
        Instant createdAt,
        String summary) {

    private static final ZoneId DISPLAY_ZONE = ZoneId.of("America/Costa_Rica");
    private static final String[] MONTHS = {"ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"};

    public static MandateResponse from(Mandate mandate) {
        return new MandateResponse(
                mandate.getId(),
                mandate.getAccountId(),
                Money.format(mandate.getDailyLimit()),
                Money.format(mandate.getPerTxLimit()),
                Money.format(mandate.getApprovalThreshold()),
                mandate.getAssetCode(),
                mandate.getAssetContractId(),
                mandate.getExpiresAt(),
                mandate.getStatus(),
                mandate.getKeyVersion(),
                mandate.getAgentPublicKeyHex(),
                mandate.getContextRuleId(),
                mandate.getValidUntilLedger(),
                mandate.getCreateTxHash(),
                mandate.getRevokeTxHash(),
                mandate.getRevokeReason(),
                mandate.getRevokedAt(),
                mandate.getCreatedAt(),
                summary(mandate));
    }

    static String summary(Mandate mandate) {
        return "Puede pagar hasta " + Money.display(mandate.getApprovalThreshold()) + " USDC sin preguntarte, hasta "
                + Money.display(mandate.getPerTxLimit()) + " USDC por pago con tu aprobación y "
                + Money.display(mandate.getDailyLimit()) + " USDC en 24 horas, solo a tus contactos, hasta el "
                + displayDate(mandate.getExpiresAt()) + ".";
    }

    public static String displayDate(Instant instant) {
        ZonedDateTime date = instant.atZone(DISPLAY_ZONE);
        return date.getDayOfMonth() + " " + MONTHS[date.getMonthValue() - 1] + " " + date.getYear();
    }
}
