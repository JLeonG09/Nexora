package com.nexora.dtos.responses;

import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ProposalStatus;
import java.util.Map;
import java.util.UUID;

/** Respuesta de POST /api/demo/attack (CONTRATOS_EQUIPO.md §3.9). */
public record AttackDemoResponse(
        UUID proposalId,
        ProposalStatus status,
        String txHash,
        ErrorDto error) {

    public record ErrorDto(String code, Integer contractCode, String stage, String message) {
    }

    public static AttackDemoResponse from(PaymentProposal proposal) {
        ErrorDto error = null;
        if (proposal.getStatus() == ProposalStatus.FALLIDO) {
            Map<String, Object> signerError = proposal.getSignerError();
            error = new ErrorDto(
                    proposal.getRejectionCode(),
                    signerError == null || !(signerError.get("contractCode") instanceof Number number)
                            ? null : number.intValue(),
                    signerError == null ? null : (String) signerError.get("stage"),
                    proposal.getRejectionMessage());
        }
        return new AttackDemoResponse(proposal.getId(), proposal.getStatus(), proposal.getTxHash(), error);
    }
}
