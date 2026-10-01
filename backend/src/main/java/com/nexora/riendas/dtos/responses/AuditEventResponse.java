package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.AuditEvent;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Elemento de GET /api/audit (CONTRATOS_EQUIPO.md §3.8). */
public record AuditEventResponse(
        UUID id,
        Instant occurredAt,
        AuditEventType eventType,
        AuditActor actor,
        UUID proposalId,
        UUID mandateId,
        String summary,
        Map<String, Object> data) {

    public static AuditEventResponse from(AuditEvent event) {
        return new AuditEventResponse(event.getId(), event.getOccurredAt(), event.getEventType(), event.getActor(),
                event.getProposalId(), event.getMandateId(), event.getSummary(), event.getData());
    }
}
