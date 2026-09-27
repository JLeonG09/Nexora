package com.nexora.riendas.clients;

import com.nexora.riendas.dtos.signer.SignerAgentKeyDto;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Firmante simulado (MVP_BACKEND.md §6.2). La llave es SHA-256(address + ":" + version):
 * distinta por cuenta y versión, determinista y <b>sin valor on-chain</b>.
 */
@Component
@ConditionalOnProperty(name = "app.signer.mode", havingValue = "mock", matchIfMissing = true)
public class MockSignerClient implements SignerClient {

    static final String MOCK_AGENT_ADDRESS = "GMOCK...NO-USAR-ON-CHAIN";
    static final String ED25519_VERIFIER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";

    @Override
    public SignerAgentKeyDto getAgentKey(String smartAccountAddress, int keyVersion) {
        return new SignerAgentKeyDto(smartAccountAddress, keyVersion, mockPublicKeyHex(smartAccountAddress, keyVersion),
                MOCK_AGENT_ADDRESS, ED25519_VERIFIER);
    }

    public static String mockPublicKeyHex(String smartAccountAddress, int keyVersion) {
        return sha256Hex(smartAccountAddress + ":" + keyVersion);
    }

    static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
