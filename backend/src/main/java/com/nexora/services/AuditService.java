package com.nexora.services;

import com.nexora.entities.AuditEvent;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.repositories.AuditEventRepository;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Registra eventos en la bitácora de solo inserción. Participa en la transacción de quien lo llama. */
@Service
public class AuditService {

    private final AuditEventRepository auditEventRepository;

    public AuditService(AuditEventRepository auditEventRepository) {
        this.auditEventRepository = auditEventRepository;
    }

    public AuditEvent record(AuditEventType type, AuditActor actor, UUID userId, String summary) {
        return record(type, actor, userId, null, null, summary, Map.of());
    }

    public AuditEvent record(AuditEventType type, AuditActor actor, UUID userId, UUID proposalId, UUID mandateId,
                             String summary, Map<String, Object> data) {
        AuditEvent event = new AuditEvent();
        event.setEventType(type);
        event.setActor(actor);
        event.setUserId(userId);
        event.setProposalId(proposalId);
        event.setMandateId(mandateId);
        event.setSummary(summary);
        event.setData(data == null ? new HashMap<>() : new HashMap<>(data));
        return auditEventRepository.save(event);
    }
}
