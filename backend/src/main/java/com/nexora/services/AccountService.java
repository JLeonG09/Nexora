package com.nexora.services;

import com.nexora.clients.StellarEventsClient;
import com.nexora.dtos.requests.RegisterAccountRequest;
import com.nexora.exceptions.StellarEventsUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.nexora.entities.Account;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.repositories.AccountRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {

    private static final String DEFAULT_NETWORK = "TESTNET";

    private static final Logger log = LoggerFactory.getLogger(AccountService.class);

    private final AccountRepository accountRepository;
    private final AuditService auditService;
    private final StellarEventsClient eventsClient;

    public AccountService(AccountRepository accountRepository, AuditService auditService,
                          StellarEventsClient eventsClient) {
        this.accountRepository = accountRepository;
        this.auditService = auditService;
        this.eventsClient = eventsClient;
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
        account.setLastScannedLedger(latestLedgerOrNull());
        Account saved = accountRepository.saveAndFlush(account);
        auditService.record(AuditEventType.CUENTA_REGISTRADA, AuditActor.USUARIO, userId, null, null,
                "Smart account registrado: " + address + ".",
                Map.of("accountId", saved.getId().toString(), "smartAccountAddress", address));
        return saved;
    }

    /** La conciliación no revisa el pasado; si el RPC no responde, la primera vuelta inicializa el cursor. */
    private Long latestLedgerOrNull() {
        try {
            return eventsClient.latestLedger();
        } catch (StellarEventsUnavailableException e) {
            log.warn("No se pudo leer el último ledger al registrar la cuenta: {}", e.getMessage());
            return null;
        }
    }

    @Transactional(readOnly = true)
    public Account getByUser(UUID userId) {
        return accountRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO,
                        "Todavía no registraste tu smart account."));
    }
}
