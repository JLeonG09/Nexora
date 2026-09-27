package com.nexora.riendas.services;

import com.nexora.riendas.clients.OnchainTransfer;
import com.nexora.riendas.clients.StellarEventsClient;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.entities.Alert;
import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.AlertStatus;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.entities.enums.MandateStatus;
import com.nexora.riendas.entities.enums.ProposalOrigin;
import com.nexora.riendas.exceptions.StellarEventsUnavailableException;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.AlertRepository;
import com.nexora.riendas.repositories.MandateRepository;
import com.nexora.riendas.repositories.PaymentProposalRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Conciliación on-chain (CONTRATOS_EQUIPO.md §14.3): cada minuto revisa las transferencias de USDC que salen
 * de cada smart account registrado. Solo se reconocen los txHash de propuestas de origen CHAT de esa cuenta;
 * el resto crea una alerta PENDIENTE (una por txHash). No hay transacción abierta mientras se llama al RPC.
 */
@Component
public class ReconciliationJob {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationJob.class);
    private static final int MAX_ADDRESS = 56;

    private final AccountRepository accountRepository;
    private final AlertRepository alertRepository;
    private final MandateRepository mandateRepository;
    private final PaymentProposalRepository proposalRepository;
    private final StellarEventsClient eventsClient;
    private final AuditService auditService;
    private final AppProperties properties;
    private final TransactionTemplate tx;

    public ReconciliationJob(AccountRepository accountRepository, AlertRepository alertRepository,
                             MandateRepository mandateRepository, PaymentProposalRepository proposalRepository,
                             StellarEventsClient eventsClient, AuditService auditService, AppProperties properties,
                             PlatformTransactionManager transactionManager) {
        this.accountRepository = accountRepository;
        this.alertRepository = alertRepository;
        this.mandateRepository = mandateRepository;
        this.proposalRepository = proposalRepository;
        this.eventsClient = eventsClient;
        this.auditService = auditService;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${app.reconciliation.interval-ms:60000}",
            initialDelayString = "${app.reconciliation.interval-ms:60000}")
    public void scheduledRun() {
        if (properties.reconciliation().enabled()) {
            reconcileAll();
        }
    }

    public void reconcileAll() {
        for (UUID accountId : accountRepository.findAll().stream().map(Account::getId).toList()) {
            try {
                reconcile(accountId);
            } catch (StellarEventsUnavailableException e) {
                log.warn("RPC no disponible al conciliar la cuenta {}: {}", accountId, e.getMessage());
            } catch (RuntimeException e) {
                log.error("Falló la conciliación de la cuenta {}", accountId, e);
            }
        }
    }

    /** Devuelve cuántas alertas nuevas creó. */
    public int reconcile(UUID accountId) {
        Account account = accountRepository.findById(accountId).orElseThrow();
        Long cursor = account.getLastScannedLedger();
        if (cursor == null) {
            long latest = eventsClient.latestLedger();
            tx.executeWithoutResult(status -> accountRepository.findByIdForUpdate(accountId)
                    .filter(locked -> locked.getLastScannedLedger() == null)
                    .ifPresent(locked -> locked.setLastScannedLedger(latest)));
            return 0;
        }

        StellarEventsClient.Scan scan = eventsClient.outgoingTransfers(account.getSmartAccountAddress(), cursor);

        Integer created = tx.execute(status -> {
            Account locked = accountRepository.findByIdForUpdate(accountId).orElseThrow();
            UUID activeMandateId = mandateRepository.findByAccountIdAndStatus(accountId, MandateStatus.ACTIVO)
                    .map(Mandate::getId).orElse(null);
            int newAlerts = 0;
            for (OnchainTransfer transfer : scan.transfers()) {
                if (!locked.getSmartAccountAddress().equals(transfer.from())) {
                    continue;
                }
                String txHash = transfer.txHash().toLowerCase(Locale.ROOT);
                if (proposalRepository.existsByAccountIdAndOriginAndTxHash(accountId, ProposalOrigin.CHAT, txHash)
                        || alertRepository.existsByAccountIdAndTxHash(accountId, txHash)) {
                    continue;
                }
                createAlert(locked, activeMandateId, transfer, txHash);
                newAlerts++;
            }
            long current = locked.getLastScannedLedger() == null ? 0 : locked.getLastScannedLedger();
            locked.setLastScannedLedger(Math.max(current, scan.scannedUpToLedger()));
            return newAlerts;
        });
        return created == null ? 0 : created;
    }

    private void createAlert(Account account, UUID mandateId, OnchainTransfer transfer, String txHash) {
        String destination = transfer.to();
        if (destination.length() > MAX_ADDRESS) {
            log.warn("Destino de {} con {} caracteres (muxed); se guarda recortado.", txHash, destination.length());
            destination = destination.substring(0, MAX_ADDRESS);
        }
        BigDecimal amount = new BigDecimal(transfer.amountUnits(), Money.SCALE);
        Alert alert = new Alert();
        alert.setUserId(account.getUserId());
        alert.setAccountId(account.getId());
        alert.setMandateId(mandateId);
        alert.setStatus(AlertStatus.PENDIENTE);
        alert.setTxHash(txHash);
        alert.setLedger(transfer.ledger());
        alert.setDestinationAddress(destination);
        alert.setAmount(amount);
        alert.setOccurredAt(transfer.occurredAt());
        alertRepository.saveAndFlush(alert);

        Map<String, Object> data = new HashMap<>();
        data.put("alertId", alert.getId().toString());
        data.put("txHash", txHash);
        data.put("ledger", transfer.ledger());
        data.put("destinationAddress", destination);
        data.put("amount", Money.format(amount));
        auditService.record(AuditEventType.MOVIMIENTO_NO_RECONOCIDO, AuditActor.RED, account.getUserId(), null,
                mandateId, "Movimiento no reconocido: " + Money.display(amount) + " USDC a " + destination
                        + " que no hizo el agente.", data);
    }
}
