package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.services.Money;
import java.util.UUID;

/** La propuesta tal como la ve el chat (CONTRATOS_EQUIPO.md §3.5). */
public record ProposalSummaryDto(
        UUID id,
        ProposalStatus status,
        UUID contactId,
        String contactName,
        String amount,
        String asset,
        String memo,
        String txHash,
        String explorerUrl,
        String rejectionCode,
        String rejectionMessage,
        UUID approvalId) {

    public static ProposalSummaryDto from(PaymentProposal proposal, String contactName, UUID approvalId,
                                          String explorerBaseUrl) {
        String txHash = proposal.getTxHash();
        return new ProposalSummaryDto(
                proposal.getId(),
                proposal.getStatus(),
                proposal.getContactId(),
                contactName,
                Money.format(proposal.getAmount()),
                proposal.getAssetCode(),
                proposal.getMemo(),
                txHash,
                txHash == null ? null : explorerBaseUrl + "/tx/" + txHash,
                proposal.getRejectionCode(),
                proposal.getRejectionMessage(),
                approvalId);
    }
}
