package com.nexora.dtos.responses;

import com.nexora.entities.Approval;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovalStatus;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.services.Money;
import java.time.Instant;
import java.util.UUID;

/** Elemento de la bandeja GET /api/approvals (CONTRATOS_EQUIPO.md §3.7). */
public record ApprovalResponse(
        UUID id,
        ApprovalStatus status,
        String reason,
        Instant expiresAt,
        Instant createdAt,
        Instant decidedAt,
        ProposalDto proposal) {

    public record ProposalDto(
            UUID id,
            ProposalStatus status,
            String contactName,
            String amount,
            String asset,
            String memo,
            String originalText) {
    }

    public static ApprovalResponse from(Approval approval, PaymentProposal proposal, String contactName) {
        ProposalDto proposalDto = proposal == null ? null : new ProposalDto(
                proposal.getId(),
                proposal.getStatus(),
                contactName,
                Money.format(proposal.getAmount()),
                proposal.getAssetCode(),
                proposal.getMemo(),
                proposal.getOriginalText());
        return new ApprovalResponse(approval.getId(), approval.getStatus(), approval.getReason(),
                approval.getExpiresAt(), approval.getCreatedAt(), approval.getDecidedAt(), proposalDto);
    }
}
