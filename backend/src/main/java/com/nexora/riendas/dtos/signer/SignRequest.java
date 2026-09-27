package com.nexora.riendas.dtos.signer;

import java.util.UUID;

/** Body de POST {firmante}/sign-and-submit (CONTRATOS_EQUIPO.md §5.2). keyVersion y llave son los del mandato. */
public record SignRequest(
        UUID proposalId,
        String smartAccountAddress,
        int contextRuleId,
        int keyVersion,
        String agentPublicKeyHex,
        String destinationAddress,
        String amount,
        String amountUnits,
        String assetContractId,
        String memo) {
}
