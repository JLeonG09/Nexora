package com.nexora.riendas.services;

import com.nexora.riendas.clients.SignerClient;
import com.nexora.riendas.dtos.signer.SignerAgentKeyDto;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.AccountRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** Llave pública del agente para la versión actual de la cuenta. El backend nunca ve secretos. */
@Service
public class AgentKeyService {

    private final AccountRepository accountRepository;
    private final SignerClient signerClient;

    public AgentKeyService(AccountRepository accountRepository, SignerClient signerClient) {
        this.accountRepository = accountRepository;
        this.signerClient = signerClient;
    }

    /** Sin transacción abierta: la llamada al firmante puede tardar. */
    public SignerAgentKeyDto currentKey(UUID userId) {
        Account account = accountRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
        return keyFor(account.getSmartAccountAddress(), account.getAgentKeyVersion());
    }

    public SignerAgentKeyDto keyFor(String smartAccountAddress, int keyVersion) {
        return signerClient.getAgentKey(smartAccountAddress, keyVersion);
    }
}
