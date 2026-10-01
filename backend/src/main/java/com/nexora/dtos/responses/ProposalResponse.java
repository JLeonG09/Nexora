package com.nexora.dtos.responses;

import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.services.Money;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** GET /api/proposals/{id} (CONTRATOS_EQUIPO.md §3.6). */
public record ProposalResponse(
        UUID id,
        ProposalStatus status,
        String originalText,
        UUID contactId,
        String contactName,
        String destinationAddress,
        String amount,
        String asset,
        String memo,
        BigDecimal aiConfidence,
        UUID mandateId,
        UUID approvalId,
        String txHash,
        String explorerUrl,
        String rejectionCode,
        String rejectionMessage,
        Instant createdAt,
        Instant updatedAt) {

    public static ProposalResponse from(PaymentProposal proposal, String contactName, UUID approvalId,
                                        String explorerBaseUrl) {
        return new ProposalResponse(
                proposal.getId(),
                proposal.getStatus(),
                proposal.getOriginalText(),
                proposal.getContactId(),
                contactName,
                proposal.getDestinationAddress(),
                Money.format(proposal.getAmount()),
                proposal.getAssetCode(),
                proposal.getMemo(),
                proposal.getAiConfidence(),
                proposal.getMandateId(),
                approvalId,
                proposal.getTxHash(),
                explorerTxUrl(explorerBaseUrl, proposal.getTxHash()),
                proposal.getRejectionCode(),
                proposal.getRejectionMessage(),
                proposal.getCreatedAt(),
                proposal.getUpdatedAt());
    }

    public static String explorerTxUrl(String explorerBaseUrl, String txHash) {
        return txHash == null ? null : explorerBaseUrl + "/tx/" + txHash;
    }
}
