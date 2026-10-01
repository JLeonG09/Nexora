package com.nexora.dtos.responses;

import com.nexora.dtos.signer.SignerAgentKeyDto;

public record AgentKeyResponse(
        String smartAccountAddress,
        int keyVersion,
        String publicKeyHex,
        String address,
        String ed25519VerifierAddress) {

    public static AgentKeyResponse from(SignerAgentKeyDto key) {
        return new AgentKeyResponse(key.smartAccountAddress(), key.keyVersion(), key.publicKeyHex(), key.address(),
                key.ed25519VerifierAddress());
    }
}
