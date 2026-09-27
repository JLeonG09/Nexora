package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.AlertStatus;
import com.nexora.riendas.entities.enums.MandateStatus;
import com.nexora.riendas.entities.enums.RevokeReason;
import java.time.Instant;
import java.util.UUID;

/** Respuesta de POST /api/alerts/{id}/report (CONTRATOS_EQUIPO.md §3.10). */
public record ReportAlertResponse(
        UUID id,
        AlertStatus status,
        Instant decidedAt,
        MandateDto mandate,
        int newKeyVersion,
        String nextStep) {

    public record MandateDto(UUID id, MandateStatus status, RevokeReason revokeReason, Integer contextRuleId,
                             String revokeTxHash) {

        public static MandateDto from(Mandate mandate) {
            return mandate == null ? null : new MandateDto(mandate.getId(), mandate.getStatus(),
                    mandate.getRevokeReason(), mandate.getContextRuleId(), mandate.getRevokeTxHash());
        }
    }
}
