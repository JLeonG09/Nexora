package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.Approval;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ApprovalStatus;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.services.Money;
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
