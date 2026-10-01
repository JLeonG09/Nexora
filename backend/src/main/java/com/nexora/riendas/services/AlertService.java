package com.nexora.riendas.services;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.responses.AlertResponse;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.dtos.responses.ReportAlertResponse;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.entities.Alert;
import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.AlertStatus;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.entities.enums.MandateStatus;
import com.nexora.riendas.entities.enums.RevokeReason;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.AlertRepository;
import com.nexora.riendas.repositories.MandateRepository;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** "Fui yo" / "No fui yo" sobre movimientos no reconocidos (CONTRATOS_EQUIPO.md §3.10 y §14.4). */
@Service
public class AlertService {

    static final String NEXT_STEP_WITH_MANDATE = "Revoca ahora la regla on-chain con tu passkey: la llave filtrada "
            + "sigue sirviendo en la red hasta que lo hagas. Después crea un mandato nuevo.";
    static final String NEXT_STEP_WITHOUT_MANDATE = "Si todavía tienes una regla del agente on-chain, bórrala con tu "
            + "passkey: la llave filtrada sirve en la red hasta que lo hagas. Después crea un mandato nuevo.";

    private final AlertRepository alertRepository;
    private final AccountRepository accountRepository;
    private final MandateRepository mandateRepository;
    private final MandateService mandateService;
    private final AuditService auditService;
    private final AppProperties properties;
    private final TransactionTemplate tx;

    public AlertService(AlertRepository alertRepository, AccountRepository accountRepository,
                        MandateRepository mandateRepository, MandateService mandateService, AuditService auditService,
                        AppProperties properties, PlatformTransactionManager transactionManager) {
        this.alertRepository = alertRepository;
        this.accountRepository = accountRepository;
        this.mandateRepository = mandateRepository;
        this.mandateService = mandateService;
        this.auditService = auditService;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public PageResponse<AlertResponse> list(UUID userId, AlertStatus statusFilter, int page, int size) {
        return tx.execute(status -> {
            PageRequest pageRequest = PageRequest.of(page, size, Sort.by("detectedAt").descending());
            Page<Alert> alerts = statusFilter == null
                    ? alertRepository.findByUserId(userId, pageRequest)
                    : alertRepository.findByUserIdAndStatus(userId, statusFilter, pageRequest);
            return PageResponse.from(alerts, alert -> AlertResponse.from(alert, properties.explorerBaseUrl()));
        });
    }

    /** El usuario hizo ese pago (p. ej. con su passkey desde otra app). */
    public AlertResponse confirm(UUID userId, UUID alertId) {
        return tx.execute(status -> {
            Alert alert = pendingAlert(userId, alertId);
            alert.setStatus(AlertStatus.RECONOCIDA);
            alert.setDecidedAt(Instant.now());
            auditService.record(AuditEventType.ALERTA_CONFIRMADA, AuditActor.USUARIO, userId, null,
                    alert.getMandateId(), "Confirmaste que hiciste el pago de " + Money.display(alert.getAmount())
                            + " USDC (" + alert.getTxHash() + ").", Map.of("alertId", alert.getId().toString(),
                            "txHash", alert.getTxHash()));
            return AlertResponse.from(alertRepository.saveAndFlush(alert), properties.explorerBaseUrl());
        });
    }

    /**
     * El usuario no hizo ese pago: se asume que la llave del agente se filtró. En una sola transacción, alerta
     * REPORTADA y, si hay mandato ACTIVO, revocación con LLAVE_COMPROMETIDA (pendientes rechazados y llave rotada).
     */
    public ReportAlertResponse report(UUID userId, UUID alertId) {
        return tx.execute(status -> {
            Alert alert = pendingAlert(userId, alertId);
            Account account = accountRepository.findByIdForUpdate(alert.getAccountId()).orElseThrow();
            Instant now = Instant.now();
            alert.setStatus(AlertStatus.REPORTADA);
            alert.setDecidedAt(now);

            Mandate mandate = mandateRepository.findByAccountIdAndStatus(account.getId(), MandateStatus.ACTIVO)
                    .orElse(null);
            if (mandate != null && !mandate.getExpiresAt().isAfter(now)) {
                mandate.setStatus(MandateStatus.EXPIRADO);
                mandate = null;
            }
            Map<String, Object> data = new HashMap<>();
            data.put("alertId", alert.getId().toString());
            data.put("txHash", alert.getTxHash());
            data.put("keyVersion", account.getAgentKeyVersion());
            data.put("mandateId", mandate == null ? null : mandate.getId().toString());
            auditService.record(AuditEventType.LLAVE_COMPROMETIDA, AuditActor.USUARIO, userId, null,
                    mandate == null ? null : mandate.getId(), "Reportaste que no hiciste el pago de "
                            + Money.display(alert.getAmount()) + " USDC: la llave del agente (versión "
                            + account.getAgentKeyVersion() + ") se da por comprometida.", data);
            if (mandate != null) {
                mandateService.revokeLocked(account, mandate, RevokeReason.LLAVE_COMPROMETIDA, AuditActor.USUARIO);
            }
            alertRepository.saveAndFlush(alert);
            return new ReportAlertResponse(alert.getId(), alert.getStatus(), alert.getDecidedAt(),
                    ReportAlertResponse.MandateDto.from(mandate), account.getAgentKeyVersion(),
                    mandate == null ? NEXT_STEP_WITHOUT_MANDATE : NEXT_STEP_WITH_MANDATE);
        });
    }

    private Alert pendingAlert(UUID userId, UUID alertId) {
        if (!alertRepository.existsByIdAndUserId(alertId, userId)) {
            throw new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No encontramos esa alerta.");
        }
        Alert alert = alertRepository.findById(alertId).orElseThrow();
        if (alert.getStatus() != AlertStatus.PENDIENTE) {
            throw new ApiException(ErrorCode.ESTADO_INVALIDO, "Esta alerta ya fue decidida.");
        }
        return alert;
    }
}
