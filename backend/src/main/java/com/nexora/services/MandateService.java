package com.nexora.services;

import com.nexora.config.AppProperties;
import com.nexora.dtos.requests.CreateMandateRequest;
import com.nexora.dtos.responses.LimitsResponse;
import com.nexora.dtos.signer.SignerAgentKeyDto;
import com.nexora.entities.Account;
import com.nexora.entities.Approval;
import com.nexora.entities.Mandate;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovalStatus;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.entities.enums.MandateStatus;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.entities.enums.RejectionCode;
import com.nexora.entities.enums.RevokeReason;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.exceptions.ErrorResponse;
import com.nexora.repositories.AccountRepository;
import com.nexora.repositories.ApprovalRepository;
import com.nexora.repositories.MandateRepository;
import com.nexora.repositories.PaymentProposalRepository;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Mandatos: crear (con la versión actual de la llave), consultar, límites y revocar.
 * Revocar y subir {@code agentKeyVersion} van en la misma transacción con la cuenta bloqueada.
 */
@Service
public class MandateService {

    static final List<ProposalStatus> SPENT_STATUSES =
            List.of(ProposalStatus.APROBADO, ProposalStatus.ENVIADO, ProposalStatus.CONFIRMADO);
    private static final Duration MAX_DURATION = Duration.ofDays(30);
    private static final Duration SPENDING_WINDOW = Duration.ofHours(24);

    private final MandateRepository mandateRepository;
    private final AccountRepository accountRepository;
    private final PaymentProposalRepository proposalRepository;
    private final ApprovalRepository approvalRepository;
    private final AgentKeyService agentKeyService;
    private final AuditService auditService;
    private final AppProperties properties;
    private final MandateCreateTxGuard createTxGuard;
    private final TransactionTemplate tx;
    private final TransactionTemplate readOnlyTx;

    public MandateService(MandateRepository mandateRepository, AccountRepository accountRepository,
                          PaymentProposalRepository proposalRepository, ApprovalRepository approvalRepository,
                          AgentKeyService agentKeyService, AuditService auditService, AppProperties properties,
                          MandateCreateTxGuard createTxGuard, PlatformTransactionManager transactionManager) {
        this.mandateRepository = mandateRepository;
        this.accountRepository = accountRepository;
        this.proposalRepository = proposalRepository;
        this.approvalRepository = approvalRepository;
        this.agentKeyService = agentKeyService;
        this.auditService = auditService;
        this.properties = properties;
        this.createTxGuard = createTxGuard;
        this.tx = new TransactionTemplate(transactionManager);
        this.readOnlyTx = new TransactionTemplate(transactionManager);
        this.readOnlyTx.setReadOnly(true);
    }

    public Mandate create(UUID userId, CreateMandateRequest request) {
        BigDecimal dailyLimit = Money.parse(request.dailyLimit());
        BigDecimal perTxLimit = Money.parse(request.perTxLimit());
        BigDecimal approvalThreshold = Money.parse(request.approvalThreshold());
        validateRules(dailyLimit, perTxLimit, approvalThreshold, request.expiresAt());

        Account account = requireAccount(userId);
        expireDue(account.getId());
        if (mandateRepository.findByAccountIdAndStatus(account.getId(), MandateStatus.ACTIVO).isPresent()) {
            throw new ApiException(ErrorCode.MANDATO_ACTIVO_EXISTENTE);
        }
        if (!account.getAgentKeyVersion().equals(request.keyVersion())) {
            throw new ApiException(ErrorCode.LLAVE_DESACTUALIZADA);
        }
        // Fuera de la transacción: el firmante puede tardar.
        SignerAgentKeyDto currentKey = agentKeyService.keyFor(account.getSmartAccountAddress(), request.keyVersion());
        if (!currentKey.publicKeyHex().equalsIgnoreCase(request.agentPublicKeyHex())) {
            throw new ApiException(ErrorCode.LLAVE_DESACTUALIZADA);
        }
        createTxGuard.verify(request.createTxHash(), account.getSmartAccountAddress());

        try {
            return tx.execute(status -> {
                Account locked = lockAccount(account.getId());
                if (!locked.getAgentKeyVersion().equals(request.keyVersion())) {
                    throw new ApiException(ErrorCode.LLAVE_DESACTUALIZADA);
                }
                if (mandateRepository.findByAccountIdAndStatus(locked.getId(), MandateStatus.ACTIVO).isPresent()) {
                    throw new ApiException(ErrorCode.MANDATO_ACTIVO_EXISTENTE);
                }
                Mandate mandate = new Mandate();
                mandate.setAccountId(locked.getId());
                mandate.setAssetCode("USDC");
                mandate.setAssetContractId(properties.usdcContractId());
                mandate.setDailyLimit(dailyLimit);
                mandate.setPerTxLimit(perTxLimit);
                mandate.setApprovalThreshold(approvalThreshold);
                mandate.setExpiresAt(request.expiresAt());
                mandate.setStatus(MandateStatus.ACTIVO);
                mandate.setKeyVersion(request.keyVersion());
                mandate.setAgentPublicKeyHex(request.agentPublicKeyHex().toLowerCase(Locale.ROOT));
                mandate.setContextRuleId(request.contextRuleId());
                mandate.setValidUntilLedger(request.validUntilLedger());
                mandate.setCreateTxHash(request.createTxHash().toLowerCase(Locale.ROOT));
                Mandate saved = mandateRepository.saveAndFlush(mandate);
                auditService.record(AuditEventType.MANDATO_CREADO, AuditActor.USUARIO, userId, null, saved.getId(),
                        "Mandato creado: " + Money.display(approvalThreshold) + " USDC sin aprobación, "
                                + Money.display(perTxLimit) + " por pago y " + Money.display(dailyLimit)
                                + " en 24 horas, llave versión " + saved.getKeyVersion() + ".",
                        Map.of("keyVersion", saved.getKeyVersion(),
                                "agentPublicKeyHex", saved.getAgentPublicKeyHex(),
                                "contextRuleId", saved.getContextRuleId(),
                                "createTxHash", saved.getCreateTxHash()));
                return saved;
            });
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.MANDATO_ACTIVO_EXISTENTE);
        }
    }

    public Mandate getActive(UUID userId) {
        Account account = requireAccount(userId);
        return findActive(account.getId())
                .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No tienes un mandato activo."));
    }

    public LimitsResponse limits(UUID userId) {
        Account account = requireAccount(userId);
        Mandate mandate = findActive(account.getId()).orElseThrow(() -> new ApiException(ErrorCode.SIN_MANDATO_ACTIVO));
        return limitsOf(mandate);
    }

    public LimitsResponse limitsOf(Mandate mandate) {
        BigDecimal spent = spentLast24h(mandate.getAccountId());
        BigDecimal available = mandate.getDailyLimit().subtract(spent).max(BigDecimal.ZERO);
        return new LimitsResponse(mandate.getId(), mandate.getAssetCode(), Money.format(mandate.getDailyLimit()),
                Money.format(spent), Money.format(available), Money.format(mandate.getPerTxLimit()),
                Money.format(mandate.getApprovalThreshold()), mandate.getExpiresAt(), mandate.getStatus());
    }

    public Page<Mandate> list(UUID userId, int page, int size) {
        Account account = requireAccount(userId);
        expireDue(account.getId());
        return readOnlyTx.execute(status -> mandateRepository.findByAccountId(account.getId(),
                PageRequest.of(page, size, Sort.by("createdAt").descending())));
    }

    public Mandate revoke(UUID userId, UUID mandateId, String revokeTxHash) {
        Account account = requireAccount(userId);
        expireDue(account.getId());
        String txHash = revokeTxHash == null ? null : revokeTxHash.toLowerCase(Locale.ROOT);
        return tx.execute(status -> {
            Account locked = lockAccount(account.getId());
            Mandate mandate = mandateRepository.findByIdAndAccountId(mandateId, locked.getId())
                    .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No encontramos ese mandato."));
            switch (mandate.getStatus()) {
                case EXPIRADO -> throw new ApiException(ErrorCode.ESTADO_INVALIDO,
                        "Este mandato ya expiró: no hace falta revocarlo.");
                case REVOCADO -> {
                    // Segunda llamada (o revocado por LLAVE_COMPROMETIDA): solo se guarda el hash on-chain.
                    if (txHash != null && mandate.getRevokeTxHash() == null) {
                        mandate.setRevokeTxHash(txHash);
                    }
                    return mandate;
                }
                case ACTIVO -> {
                    revokeLocked(locked, mandate, RevokeReason.USUARIO, AuditActor.USUARIO);
                    mandate.setRevokeTxHash(txHash);
                    return mandate;
                }
                default -> throw new IllegalStateException("Estado de mandato desconocido: " + mandate.getStatus());
            }
        });
    }

    /**
     * Revoca un mandato ACTIVO, rechaza sus aprobaciones pendientes y rota la llave de la cuenta.
     * Requiere una transacción abierta con la fila de la cuenta bloqueada.
     */
    public void revokeLocked(Account lockedAccount, Mandate mandate, RevokeReason reason, AuditActor actor) {
        Instant now = Instant.now();
        mandate.setStatus(MandateStatus.REVOCADO);
        mandate.setRevokeReason(reason);
        mandate.setRevokedAt(now);

        int rejected = 0;
        for (PaymentProposal proposal : proposalRepository.findByMandateIdAndStatus(mandate.getId(),
                ProposalStatus.PENDIENTE_APROBACION)) {
            proposal.setStatus(ProposalStatus.RECHAZADO);
            proposal.setRejectionCode(RejectionCode.MANDATO_REVOCADO.name());
            proposal.setRejectionMessage(RejectionCode.MANDATO_REVOCADO.defaultMessage());
            Optional<Approval> approval = approvalRepository.findByProposalIdAndStatus(proposal.getId(),
                    ApprovalStatus.PENDIENTE);
            approval.ifPresent(a -> {
                a.setStatus(ApprovalStatus.RECHAZADA);
                a.setDecidedAt(now);
            });
            rejected++;
        }

        int previousVersion = lockedAccount.getAgentKeyVersion();
        int newVersion = previousVersion + 1;
        lockedAccount.setAgentKeyVersion(newVersion);

        UUID userId = lockedAccount.getUserId();
        auditService.record(AuditEventType.MANDATO_REVOCADO, actor, userId, null, mandate.getId(),
                "Mandato revocado (" + reason + "). Pagos pendientes rechazados: " + rejected + ".",
                Map.of("revokeReason", reason.name(), "contextRuleId", mandate.getContextRuleId(),
                        "rejectedPendingProposals", rejected));
        auditService.record(AuditEventType.LLAVE_ROTADA, AuditActor.BACKEND, userId, null, mandate.getId(),
                "Llave del agente rotada: versión " + previousVersion + " → " + newVersion + ".",
                Map.of("previousKeyVersion", previousVersion, "newKeyVersion", newVersion));
    }

    /** Mandato activo y vigente de la cuenta (marca EXPIRADO si ya venció). */
    public Optional<Mandate> findActive(UUID accountId) {
        expireDue(accountId);
        return readOnlyTx.execute(status -> mandateRepository.findByAccountIdAndStatus(accountId, MandateStatus.ACTIVO));
    }

    /** Mandato ACTIVO y todavía vigente, sin marcar EXPIRADO: la regla 5 necesita ver el vencimiento. */
    public Optional<Mandate> findVigentWithoutExpiring(UUID accountId) {
        return readOnlyTx.execute(status -> mandateRepository.findByAccountIdAndStatus(accountId, MandateStatus.ACTIVO)
                .filter(mandate -> mandate.getExpiresAt().isAfter(Instant.now())));
    }

    public BigDecimal spentLast24h(UUID accountId) {
        BigDecimal spent = proposalRepository.sumSpentSince(accountId, SPENT_STATUSES,
                Instant.now().minus(SPENDING_WINDOW));
        return spent == null ? BigDecimal.ZERO : spent;
    }

    /** Al expirar no se sube la versión de la llave: la regla on-chain ya no sirve por valid_until. */
    private void expireDue(UUID accountId) {
        tx.executeWithoutResult(status -> mandateRepository.findByAccountIdAndStatus(accountId, MandateStatus.ACTIVO)
                .filter(mandate -> !mandate.getExpiresAt().isAfter(Instant.now()))
                .ifPresent(mandate -> mandate.setStatus(MandateStatus.EXPIRADO)));
    }

    private Account requireAccount(UUID userId) {
        return accountRepository.findByUserId(userId).orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
    }

    private Account lockAccount(UUID accountId) {
        return accountRepository.findByIdForUpdate(accountId)
                .orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
    }

    private static void validateRules(BigDecimal dailyLimit, BigDecimal perTxLimit, BigDecimal approvalThreshold,
                                      Instant expiresAt) {
        List<ErrorResponse.FieldErrorDetail> details = new ArrayList<>();
        requirePositive(details, "dailyLimit", dailyLimit);
        requirePositive(details, "perTxLimit", perTxLimit);
        requirePositive(details, "approvalThreshold", approvalThreshold);
        if (perTxLimit.compareTo(dailyLimit) > 0) {
            details.add(new ErrorResponse.FieldErrorDetail("perTxLimit",
                    "El tope por transacción no puede ser mayor que el tope diario."));
        }
        if (approvalThreshold.compareTo(perTxLimit) > 0) {
            details.add(new ErrorResponse.FieldErrorDetail("approvalThreshold",
                    "El umbral de aprobación no puede ser mayor que el tope por transacción."));
        }
        Instant now = Instant.now();
        if (!expiresAt.isAfter(now)) {
            details.add(new ErrorResponse.FieldErrorDetail("expiresAt", "La fecha de expiración debe estar en el futuro."));
        } else if (expiresAt.isAfter(now.plus(MAX_DURATION))) {
            details.add(new ErrorResponse.FieldErrorDetail("expiresAt",
                    "La fecha de expiración no puede pasar de 30 días."));
        }
        if (!details.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDACION_FALLIDA, ErrorCode.VALIDACION_FALLIDA.defaultMessage(), details);
        }
    }

    private static void requirePositive(List<ErrorResponse.FieldErrorDetail> details, String field, BigDecimal value) {
        if (value.signum() <= 0) {
            details.add(new ErrorResponse.FieldErrorDetail(field, "El monto debe ser mayor que 0."));
        }
    }
}
