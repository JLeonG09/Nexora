package com.nexora.services;

import com.nexora.config.AppProperties;
import com.nexora.dtos.responses.ApprovalResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.entities.Approval;
import com.nexora.entities.Contact;
import com.nexora.entities.Mandate;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovalStatus;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.repositories.ApprovalRepository;
import com.nexora.repositories.ContactRepository;
import com.nexora.repositories.PaymentProposalRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cola de aprobaciones: una fila por propuesta que supera el umbral. */
@Service
public class ApprovalService {

    private final ApprovalRepository approvalRepository;
    private final PaymentProposalRepository proposalRepository;
    private final ContactRepository contactRepository;
    private final AuditService auditService;
    private final AppProperties properties;

    public ApprovalService(ApprovalRepository approvalRepository, PaymentProposalRepository proposalRepository,
                           ContactRepository contactRepository, AuditService auditService, AppProperties properties) {
        this.approvalRepository = approvalRepository;
        this.proposalRepository = proposalRepository;
        this.contactRepository = contactRepository;
        this.auditService = auditService;
        this.properties = properties;
    }

    /** Participa en la transacción de quien crea la propuesta. */
    public Approval request(PaymentProposal proposal, Mandate mandate, Contact contact) {
        Approval approval = new Approval();
        approval.setProposalId(proposal.getId());
        approval.setUserId(proposal.getUserId());
        approval.setStatus(ApprovalStatus.PENDIENTE);
        approval.setReason("El monto (" + Money.display(proposal.getAmount()) + " USDC) supera el umbral de aprobación ("
                + Money.display(mandate.getApprovalThreshold()) + " USDC).");
        approval.setExpiresAt(Instant.now().plus(Duration.ofHours(properties.approvalTtlHours())));
        Approval saved = approvalRepository.saveAndFlush(approval);
        auditService.record(AuditEventType.APROBACION_SOLICITADA, AuditActor.BACKEND, proposal.getUserId(),
                proposal.getId(), mandate.getId(),
                "Pago de " + Money.display(proposal.getAmount()) + " USDC a " + contact.getName()
                        + " enviado a la bandeja de aprobación.",
                Map.of("approvalId", saved.getId().toString(), "expiresAt", saved.getExpiresAt().toString()));
        return saved;
    }

    @Transactional(readOnly = true)
    public PageResponse<ApprovalResponse> list(UUID userId, ApprovalStatus status, int page, int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Page<Approval> approvals = status == null
                ? approvalRepository.findByUserId(userId, pageRequest)
                : approvalRepository.findByUserIdAndStatus(userId, status, pageRequest);
        Map<UUID, PaymentProposal> proposals = proposalRepository
                .findAllById(approvals.getContent().stream().map(Approval::getProposalId).toList()).stream()
                .collect(Collectors.toMap(PaymentProposal::getId, Function.identity()));
        Map<UUID, String> contactNames = contactRepository
                .findAllById(proposals.values().stream().map(PaymentProposal::getContactId)
                        .filter(Objects::nonNull).toList()).stream()
                .collect(Collectors.toMap(Contact::getId, Contact::getName));
        return PageResponse.from(approvals, approval -> {
            PaymentProposal proposal = proposals.get(approval.getProposalId());
            String contactName = proposal == null || proposal.getContactId() == null
                    ? null : contactNames.get(proposal.getContactId());
            return ApprovalResponse.from(approval, proposal, contactName);
        });
    }
}
