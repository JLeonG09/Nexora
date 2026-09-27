package com.nexora.riendas.dtos.signer;

/** Respuesta de GET {firmante}/agent-key (CONTRATOS_EQUIPO.md §5.1). */
public record SignerAgentKeyDto(
        String smartAccountAddress,
        int keyVersion,
        String publicKeyHex,
        String address,
        String ed25519VerifierAddress) {
}
