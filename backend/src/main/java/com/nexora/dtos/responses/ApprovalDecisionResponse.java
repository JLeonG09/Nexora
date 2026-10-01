package com.nexora.dtos.responses;

import com.nexora.entities.Approval;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovalStatus;
import com.nexora.entities.enums.ProposalStatus;
import java.time.Instant;
import java.util.UUID;

/** Respuesta de POST /api/approvals/{id}/approve y /reject (CONTRATOS_EQUIPO.md §3.7). */
public record ApprovalDecisionResponse(
        UUID id,
        ApprovalStatus status,
        Instant decidedAt,
        ProposalDto proposal) {

    public record ProposalDto(
            UUID id,
            ProposalStatus status,
            String txHash,
            String explorerUrl,
            String rejectionCode,
            String rejectionMessage) {
    }

    public static ApprovalDecisionResponse from(Approval approval, PaymentProposal proposal, String explorerBaseUrl) {
        return new ApprovalDecisionResponse(approval.getId(), approval.getStatus(), approval.getDecidedAt(),
                new ProposalDto(proposal.getId(), proposal.getStatus(), proposal.getTxHash(),
                        ProposalResponse.explorerTxUrl(explorerBaseUrl, proposal.getTxHash()),
                        proposal.getRejectionCode(), proposal.getRejectionMessage()));
    }
}
