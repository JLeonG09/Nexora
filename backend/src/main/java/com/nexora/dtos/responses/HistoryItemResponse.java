package com.nexora.dtos.responses;

import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovedBy;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.services.Money;
import java.time.Instant;
import java.util.UUID;

/** Elemento de GET /api/history (CONTRATOS_EQUIPO.md §3.8). */
public record HistoryItemResponse(
        UUID proposalId,
        ProposalStatus status,
        String contactName,
        String destinationAddress,
        String amount,
        String asset,
        String memo,
        String txHash,
        String explorerUrl,
        ApprovedBy approvedBy,
        Instant sentAt,
        Instant confirmedAt) {

    public static HistoryItemResponse from(PaymentProposal proposal, String contactName, String explorerBaseUrl) {
        return new HistoryItemResponse(proposal.getId(), proposal.getStatus(), contactName,
                proposal.getDestinationAddress(), Money.format(proposal.getAmount()), proposal.getAssetCode(),
                proposal.getMemo(), proposal.getTxHash(),
                ProposalResponse.explorerTxUrl(explorerBaseUrl, proposal.getTxHash()), proposal.getApprovedBy(),
                proposal.getSentAt(), proposal.getConfirmedAt());
    }
}
