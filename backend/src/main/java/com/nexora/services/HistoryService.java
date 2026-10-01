package com.nexora.services;

import com.nexora.config.AppProperties;
import com.nexora.dtos.responses.AuditEventResponse;
import com.nexora.dtos.responses.HistoryItemResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.entities.AuditEvent;
import com.nexora.entities.Contact;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.repositories.AuditEventRepository;
import com.nexora.repositories.ContactRepository;
import com.nexora.repositories.PaymentProposalRepository;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Historial de pagos enviados y bitácora de auditoría del usuario. */
@Service
public class HistoryService {

    static final List<ProposalStatus> HISTORY_STATUSES =
            List.of(ProposalStatus.ENVIADO, ProposalStatus.CONFIRMADO, ProposalStatus.FALLIDO);

    private final PaymentProposalRepository proposalRepository;
    private final ContactRepository contactRepository;
    private final AuditEventRepository auditEventRepository;
    private final AppProperties properties;

    public HistoryService(PaymentProposalRepository proposalRepository, ContactRepository contactRepository,
                          AuditEventRepository auditEventRepository, AppProperties properties) {
        this.proposalRepository = proposalRepository;
        this.contactRepository = contactRepository;
        this.auditEventRepository = auditEventRepository;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public PageResponse<HistoryItemResponse> history(UUID userId, int page, int size) {
        Page<PaymentProposal> proposals = proposalRepository.findByUserIdAndStatusIn(userId, HISTORY_STATUSES,
                PageRequest.of(page, size, Sort.by("createdAt").descending()));
        Map<UUID, String> names = contactRepository
                .findAllById(proposals.getContent().stream().map(PaymentProposal::getContactId)
                        .filter(Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(Contact::getId, Contact::getName));
        return PageResponse.from(proposals, proposal -> HistoryItemResponse.from(proposal,
                proposal.getContactId() == null ? null : names.get(proposal.getContactId()),
                properties.explorerBaseUrl()));
    }

    /** De la más nueva a la más vieja; con {@code proposalId}, solo los eventos de esa propuesta. */
    @Transactional(readOnly = true)
    public PageResponse<AuditEventResponse> audit(UUID userId, UUID proposalId, int page, int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by("occurredAt").descending());
        Page<AuditEvent> events = proposalId == null
                ? auditEventRepository.findByUserId(userId, pageRequest)
                : auditEventRepository.findByUserIdAndProposalId(userId, proposalId, pageRequest);
        return PageResponse.from(events, AuditEventResponse::from);
    }
}
