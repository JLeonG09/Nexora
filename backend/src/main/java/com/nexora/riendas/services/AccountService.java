package com.nexora.riendas.services;

import com.nexora.riendas.dtos.requests.RegisterAccountRequest;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.AccountRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

    private static final String DEFAULT_NETWORK = "TESTNET";

    private final AccountRepository accountRepository;
    private final AuditService auditService;

    public AccountService(AccountRepository accountRepository, AuditService auditService) {
        this.accountRepository = accountRepository;
        this.auditService = auditService;
    }

    @Transactional
    public Account register(UUID userId, RegisterAccountRequest request) {
        String address = request.smartAccountAddress().trim();
        if (accountRepository.existsByUserId(userId) || accountRepository.existsBySmartAccountAddress(address)) {
            throw new ApiException(ErrorCode.CUENTA_YA_REGISTRADA);
        }
        Account account = new Account();
        account.setUserId(userId);
        account.setSmartAccountAddress(address);
        account.setCredentialId(request.credentialId());
        account.setNetwork(request.network() == null ? DEFAULT_NETWORK : request.network());
        account.setAgentKeyVersion(1);
        Account saved = accountRepository.saveAndFlush(account);
        auditService.record(AuditEventType.CUENTA_REGISTRADA, AuditActor.USUARIO, userId, null, null,
                "Smart account registrado: " + address + ".",
                Map.of("accountId", saved.getId().toString(), "smartAccountAddress", address));
        return saved;
    }

    @Transactional(readOnly = true)
    public Account getByUser(UUID userId) {
        return accountRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO,
                        "Todavía no registraste tu smart account."));
    }
}
