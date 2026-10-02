package com.nexora.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.clients.SignerClient;
import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.dtos.ai.ProposePaymentArguments;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.dtos.responses.ProposalResponse;
import com.nexora.dtos.signer.SignRequest;
import com.nexora.dtos.signer.SignResponse;
import com.nexora.dtos.signer.SignerErrorDto;
import com.nexora.entities.Account;
import com.nexora.entities.Approval;
import com.nexora.entities.Contact;
import com.nexora.entities.Mandate;
import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ApprovalStatus;
import com.nexora.entities.enums.ApprovedBy;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.entities.enums.MandateStatus;
import com.nexora.entities.enums.ProposalOrigin;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.entities.enums.RejectionCode;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.exceptions.SignerRejectedException;
import com.nexora.exceptions.SignerUnavailableException;
import com.nexora.repositories.AccountRepository;
import com.nexora.repositories.ApprovalRepository;
import com.nexora.repositories.ContactRepository;
import com.nexora.repositories.MandateRepository;
import com.nexora.repositories.PaymentProposalRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Crea propuestas a partir de la IA, las valida con la cuenta bloqueada y las envía al firmante.
 * La llamada al firmante siempre ocurre fuera de transacción; nunca se reenvía un pago automáticamente.
 */
@Service
public class PaymentProposalService {

    private static final Logger log = LoggerFactory.getLogger(PaymentProposalService.class);
    private static final Duration RATE_WINDOW = Duration.ofMinutes(10);
    private static final int MAX_ASSET_CODE = 12;
    private static final int MAX_MODEL = 60;
    private static final int MAX_REJECTION_MESSAGE = 300;
    private static final int MAX_REJECTION_CODE = 60;

    /** Resultado de crear una propuesta. {@code signRequest} viene solo si quedó ENVIADO y falta llamar al firmante. */
    public record Outcome(PaymentProposal proposal, String contactName, UUID approvalId, SignRequest signRequest) {
    }

    private final PaymentProposalRepository proposalRepository;
    private final AccountRepository accountRepository;
    private final MandateRepository mandateRepository;
    private final ContactRepository contactRepository;
    private final ApprovalRepository approvalRepository;
    private final MandateService mandateService;
    private final ApprovalService approvalService;
    private final PaymentValidator paymentValidator;
    private final ProposalStateMachine stateMachine;
    private final SignerClient signerClient;
    private final AuditService auditService;
    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public PaymentProposalService(PaymentProposalRepository proposalRepository, AccountRepository accountRepository,
                                  MandateRepository mandateRepository, ContactRepository contactRepository,
                                  ApprovalRepository approvalRepository, MandateService mandateService,
                                  ApprovalService approvalService, PaymentValidator paymentValidator,
                                  ProposalStateMachine stateMachine, SignerClient signerClient,
                                  AuditService auditService, AppProperties properties, ObjectMapper objectMapper,
                                  PlatformTransactionManager transactionManager) {
        this.proposalRepository = proposalRepository;
        this.accountRepository = accountRepository;
        this.mandateRepository = mandateRepository;
        this.contactRepository = contactRepository;
        this.approvalRepository = approvalRepository;
        this.mandateService = mandateService;
        this.approvalService = approvalService;
        this.paymentValidator = paymentValidator;
        this.stateMachine = stateMachine;
        this.signerClient = signerClient;
        this.auditService = auditService;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** Crea la propuesta (PROPUESTO), corre las reglas 1–8 y aplica la decisión, con la cuenta bloqueada. */
    public Outcome createFromAi(UUID userId, UUID accountId, UUID conversationId, String originalText,
                                AiInterpretResponse response) {
        return tx.execute(status -> {
            Account account = accountRepository.findByIdForUpdate(accountId)
                    .orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
            Instant now = Instant.now();
            Mandate active = mandateRepository.findByAccountIdAndStatus(accountId, MandateStatus.ACTIVO).orElse(null);
            Mandate last = active != null ? active
                    : mandateRepository.findFirstByAccountIdOrderByCreatedAtDesc(accountId).orElse(null);

            PaymentProposal proposal = new PaymentProposal();
            proposal.setUserId(userId);
            proposal.setAccountId(accountId);
            proposal.setMandateId(active == null ? null : active.getId());
            proposal.setConversationId(conversationId);
            proposal.setOrigin(ProposalOrigin.CHAT);
            proposal.setOriginalText(originalText);
            proposal.setAiConfidence(confidence(response.confidence()));
            proposal.setAiModel(truncate(response.model(), MAX_MODEL));
            proposal.setAiRaw(objectMapper.convertValue(response, new TypeReference<Map<String, Object>>() { }));
            proposal.setStatus(ProposalStatus.PROPUESTO);
            proposal = proposalRepository.saveAndFlush(proposal);
            auditService.record(AuditEventType.PROPUESTA_CREADA, AuditActor.BACKEND, userId, proposal.getId(),
                    proposal.getMandateId(), "Propuesta creada a partir de la respuesta de la IA.",
                    Map.of("originalText", originalText));

            PaymentValidator.Context context = new PaymentValidator.Context(userId, originalText, active, last,
                    mandateService.spentLast24h(accountId),
                    proposalRepository.countByUserIdAndOriginAndCreatedAtAfter(userId, ProposalOrigin.CHAT,
                            now.minus(RATE_WINDOW)),
                    now);
            PaymentValidator.Result result = paymentValidator.validate(response, context);
            applyArguments(proposal, result);

            UUID approvalId = null;
            SignRequest signRequest = null;
            if (!result.valid()) {
                reject(proposal, result.code().name(), result.message());
                if (result.code() == RejectionCode.MANDATO_EXPIRADO && active != null) {
                    active.setStatus(MandateStatus.EXPIRADO);
                }
                auditService.record(AuditEventType.VALIDACION_RECHAZADA, AuditActor.BACKEND, userId, proposal.getId(),
                        proposal.getMandateId(), "Propuesta rechazada (" + result.code() + "): " + proposal.getRejectionMessage(),
                        Map.of("rejectionCode", result.code().name(), "checksPassed", result.checks()));
            } else {
                Contact contact = result.contact();
                boolean needsApproval = result.decision() == ProposalStatus.PENDIENTE_APROBACION;
                auditService.record(AuditEventType.VALIDACION_OK, AuditActor.BACKEND, userId, proposal.getId(),
                        active.getId(), validSummary(proposal.getAmount(), contact, active, needsApproval),
                        Map.of("checks", result.checks()));
                if (needsApproval) {
                    stateMachine.transition(proposal, ProposalStatus.PENDIENTE_APROBACION);
                    approvalId = approvalService.request(proposal, active, contact).getId();
                } else {
                    stateMachine.transition(proposal, ProposalStatus.APROBADO);
                    proposal.setApprovedBy(ApprovedBy.AUTOMATICO);
                    signRequest = markSent(proposal, account, active);
                }
            }
            proposal = proposalRepository.saveAndFlush(proposal);
            String contactName = result.contact() == null ? null : result.contact().getName();
            return new Outcome(proposal, contactName, approvalId, signRequest);
        });
    }

    /**
     * Llama al firmante (fuera de transacción) y guarda el resultado. Si el firmante no responde,
     * la propuesta se queda en ENVIADO para que la consulte la tarea programada.
     */
    public PaymentProposal submit(SignRequest request) {
        try {
            return submitOrThrow(request);
        } catch (SignerUnavailableException e) {
            return proposalRepository.findById(request.proposalId()).orElseThrow();
        }
    }

    /** Igual que {@link #submit}, pero si el firmante no responde relanza el error (503) tras dejar la propuesta en ENVIADO. */
    public PaymentProposal submitOrThrow(SignRequest request) {
        try {
            SignResponse response = signerClient.signAndSubmit(request);
            return applySignerResponse(request.proposalId(), response);
        } catch (SignerRejectedException e) {
            return applySignerResponse(request.proposalId(), new SignResponse(request.proposalId(), SignResponse.FALLIDO,
                    null, null, null, null, new SignerErrorDto(e.code(), null, null, e.getMessage(), null)));
        } catch (SignerUnavailableException e) {
            log.warn("Firmante no disponible para la propuesta {}: {}", request.proposalId(), e.getMessage());
            throw e;
        }
    }

    /** Resultado de decidir una aprobación. {@code signRequest} viene solo si se aprobó y falta llamar al firmante. */
    public record Decision(Approval approval, PaymentProposal proposal, SignRequest signRequest) {
    }

    /**
     * Aprueba desde la bandeja: revalida las reglas 5, 6 y 7 con la cuenta bloqueada. Si ya no pasan,
     * la aprobación queda RECHAZADA y la propuesta RECHAZADO con ese motivo.
     */
    public Decision approve(UUID userId, UUID approvalId) {
        return tx.execute(status -> {
            requireApprovalOf(userId, approvalId);
            Account account = lockAccount(userId);
            Approval approval = pendingApproval(userId, approvalId);
            PaymentProposal proposal = proposalRepository.findById(approval.getProposalId()).orElseThrow();
            Instant now = Instant.now();
            Mandate mandate = proposal.getMandateId() == null ? null
                    : mandateRepository.findById(proposal.getMandateId()).orElse(null);
            List<String> checks = new ArrayList<>();
            PaymentValidator.Rejection rejection = paymentValidator.checkMandateAndLimits(proposal.getAmount(),
                    mandate, mandate, mandateService.spentLast24h(account.getId()), now, checks);

            approval.setDecidedAt(now);
            SignRequest signRequest = null;
            if (rejection != null) {
                approval.setStatus(ApprovalStatus.RECHAZADA);
                reject(proposal, rejection.code().name(), rejection.message());
                if (rejection.code() == RejectionCode.MANDATO_EXPIRADO && mandate != null
                        && mandate.getStatus() == MandateStatus.ACTIVO) {
                    mandate.setStatus(MandateStatus.EXPIRADO);
                }
                auditService.record(AuditEventType.VALIDACION_RECHAZADA, AuditActor.BACKEND, userId, proposal.getId(),
                        proposal.getMandateId(), "Al aprobar, la propuesta ya no pasa la revalidación ("
                                + rejection.code() + "): " + proposal.getRejectionMessage(),
                        Map.of("rejectionCode", rejection.code().name(), "checksPassed", checks, "revalidation", true));
            } else {
                approval.setStatus(ApprovalStatus.APROBADA);
                auditService.record(AuditEventType.APROBACION_APROBADA, AuditActor.USUARIO, userId, proposal.getId(),
                        mandate.getId(), "Aprobaste el pago de " + Money.display(proposal.getAmount()) + " USDC.",
                        Map.of("approvalId", approval.getId().toString(), "checks", checks));
                stateMachine.transition(proposal, ProposalStatus.APROBADO);
                proposal.setApprovedBy(ApprovedBy.USUARIO);
                signRequest = markSent(proposal, account, mandate);
            }
            return new Decision(approvalRepository.saveAndFlush(approval), proposalRepository.saveAndFlush(proposal),
                    signRequest);
        });
    }

    /** Rechazo desde la bandeja: aprobación RECHAZADA y propuesta RECHAZADO (RECHAZADO_POR_USUARIO). */
    public Decision rejectByUser(UUID userId, UUID approvalId, String note) {
        return tx.execute(status -> {
            requireApprovalOf(userId, approvalId);
            lockAccount(userId);
            Approval approval = pendingApproval(userId, approvalId);
            PaymentProposal proposal = proposalRepository.findById(approval.getProposalId()).orElseThrow();
            approval.setStatus(ApprovalStatus.RECHAZADA);
            approval.setDecidedAt(Instant.now());
            approval.setDecisionNote(note == null || note.isBlank() ? null : note.trim());
            reject(proposal, RejectionCode.RECHAZADO_POR_USUARIO.name(),
                    RejectionCode.RECHAZADO_POR_USUARIO.defaultMessage());
            Map<String, Object> data = new HashMap<>();
            data.put("approvalId", approval.getId().toString());
            data.put("reason", approval.getDecisionNote());
            auditService.record(AuditEventType.APROBACION_RECHAZADA, AuditActor.USUARIO, userId, proposal.getId(),
                    proposal.getMandateId(), "Rechazaste el pago de " + Money.display(proposal.getAmount()) + " USDC.",
                    data);
            return new Decision(approvalRepository.saveAndFlush(approval), proposalRepository.saveAndFlush(proposal),
                    null);
        });
    }

    /** Vence una aprobación PENDIENTE cuyo plazo pasó. No hace nada si ya se decidió. */
    public void expireApproval(UUID approvalId) {
        tx.executeWithoutResult(status -> {
            Approval approval = approvalRepository.findById(approvalId).orElse(null);
            if (approval == null) {
                return;
            }
            // El estado de la propuesta, leído con su fila bloqueada, es el que manda si hay una decisión en paralelo.
            lockAccount(approval.getUserId());
            PaymentProposal proposal = proposalRepository.findByIdForUpdate(approval.getProposalId()).orElseThrow();
            if (approval.getStatus() != ApprovalStatus.PENDIENTE || !approval.getExpiresAt().isBefore(Instant.now())
                    || proposal.getStatus() != ProposalStatus.PENDIENTE_APROBACION) {
                return;
            }
            approval.setStatus(ApprovalStatus.EXPIRADA);
            approval.setDecidedAt(Instant.now());
            reject(proposal, RejectionCode.APROBACION_EXPIRADA.name(), RejectionCode.APROBACION_EXPIRADA.defaultMessage());
            auditService.record(AuditEventType.APROBACION_EXPIRADA, AuditActor.BACKEND, approval.getUserId(),
                    proposal.getId(), proposal.getMandateId(), "La solicitud de aprobación de "
                            + Money.display(proposal.getAmount()) + " USDC venció sin respuesta.",
                    Map.of("approvalId", approval.getId().toString()));
            approvalRepository.saveAndFlush(approval);
            proposalRepository.saveAndFlush(proposal);
        });
    }

    /**
     * Modo atacante (CONTRATOS_EQUIPO.md §3.9): se salta a propósito todas las validaciones y firma con la
     * cuenta y la regla del mandato activo, para mostrar que la red frena el pago. Devuelve el SignRequest.
     */
    public SignRequest prepareAttack(UUID userId, String destinationAddress, BigDecimal amount) {
        return tx.execute(status -> {
            Account account = lockAccount(userId);
            Mandate mandate = mandateRepository.findByAccountIdAndStatus(account.getId(), MandateStatus.ACTIVO)
                    .filter(active -> active.getExpiresAt().isAfter(Instant.now()))
                    .orElseThrow(() -> new ApiException(ErrorCode.SIN_MANDATO_ACTIVO));
            PaymentProposal proposal = new PaymentProposal();
            proposal.setUserId(userId);
            proposal.setAccountId(account.getId());
            proposal.setMandateId(mandate.getId());
            proposal.setOrigin(ProposalOrigin.ATAQUE_DEMO);
            proposal.setOriginalText("Modo atacante: " + Money.display(amount) + " USDC a " + destinationAddress);
            proposal.setDestinationAddress(destinationAddress);
            proposal.setAmount(amount);
            proposal.setAssetCode(mandate.getAssetCode());
            proposal.setStatus(ProposalStatus.PROPUESTO);
            proposal = proposalRepository.saveAndFlush(proposal);
            Map<String, Object> data = new HashMap<>();
            data.put("destinationAddress", destinationAddress);
            data.put("amount", Money.format(amount));
            auditService.record(AuditEventType.ATAQUE_DEMO, AuditActor.USUARIO, userId, proposal.getId(),
                    mandate.getId(), "Modo atacante: el backend se saltó sus validaciones y pidió firmar "
                            + Money.display(amount) + " USDC a un destino desconocido.", data);
            stateMachine.transition(proposal, ProposalStatus.APROBADO);
            SignRequest request = markSent(proposal, account, mandate);
            proposalRepository.saveAndFlush(proposal);
            return request;
        });
    }

    private Account lockAccount(UUID userId) {
        UUID accountId = accountRepository.findByUserId(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA)).getId();
        return accountRepository.findByIdForUpdate(accountId).orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
    }

    /** 404 antes de bloquear nada; no carga la entidad para que la lectura tras el bloqueo sea fresca. */
    private void requireApprovalOf(UUID userId, UUID approvalId) {
        if (!approvalRepository.existsByIdAndUserId(approvalId, userId)) {
            throw new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No encontramos esa solicitud de aprobación.");
        }
    }

    private Approval pendingApproval(UUID userId, UUID approvalId) {
        Approval approval = approvalRepository.findByIdAndUserId(approvalId, userId)
                .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO,
                        "No encontramos esa solicitud de aprobación."));
        PaymentProposal proposal = proposalRepository.findByIdForUpdate(approval.getProposalId()).orElseThrow();
        if (approval.getStatus() != ApprovalStatus.PENDIENTE || !approval.getExpiresAt().isAfter(Instant.now())
                || proposal.getStatus() != ProposalStatus.PENDIENTE_APROBACION) {
            throw new ApiException(ErrorCode.ESTADO_INVALIDO, "Esta solicitud ya fue decidida o expiró.");
        }
        return approval;
    }

    /** Aplica CONFIRMADO / FALLIDO. ENVIADO o una propuesta que ya no está en ENVIADO no cambian nada. */
    public PaymentProposal applySignerResponse(UUID proposalId, SignResponse response) {
        return tx.execute(status -> {
            PaymentProposal proposal = proposalRepository.findByIdForUpdate(proposalId).orElseThrow();
            if (proposal.getStatus() != ProposalStatus.ENVIADO || response == null) {
                return proposal;
            }
            if (SignResponse.CONFIRMADO.equals(response.status())) {
                stateMachine.transition(proposal, ProposalStatus.CONFIRMADO);
                proposal.setTxHash(response.txHash() == null ? null : response.txHash().toLowerCase(Locale.ROOT));
                proposal.setLedger(response.ledger());
                proposal.setConfirmedAt(response.confirmedAt() != null ? response.confirmedAt() : Instant.now());
                auditService.record(AuditEventType.TX_CONFIRMADA, AuditActor.RED, proposal.getUserId(), proposal.getId(),
                        proposal.getMandateId(), "Pago confirmado en la red: " + Money.display(proposal.getAmount())
                                + " USDC.", txData(proposal));
            } else if (SignResponse.FALLIDO.equals(response.status())) {
                stateMachine.transition(proposal, ProposalStatus.FALLIDO);
                SignerErrorDto error = response.error();
                String code = error == null || error.code() == null ? "ERROR_FIRMANTE" : error.code();
                String message = error == null || error.message() == null
                        ? "El pago no se pudo completar." : error.message();
                proposal.setRejectionCode(truncate(code, MAX_REJECTION_CODE));
                proposal.setRejectionMessage(truncate(message, MAX_REJECTION_MESSAGE));
                if (error != null) {
                    proposal.setSignerError(objectMapper.convertValue(error, new TypeReference<Map<String, Object>>() { }));
                }
                auditService.record(AuditEventType.TX_FALLIDA, AuditActor.FIRMANTE, proposal.getUserId(),
                        proposal.getId(), proposal.getMandateId(), "El pago falló (" + code + "): " + message,
                        proposal.getSignerError() == null ? Map.of("code", code) : proposal.getSignerError());
            }
            return proposalRepository.saveAndFlush(proposal);
        });
    }

    public ProposalResponse get(UUID userId, UUID proposalId) {
        return tx.execute(status -> {
            PaymentProposal proposal = proposalRepository.findByIdAndUserId(proposalId, userId)
                    .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No encontramos esa propuesta."));
            String contactName = proposal.getContactId() == null ? null
                    : contactRepository.findById(proposal.getContactId()).map(Contact::getName).orElse(null);
            UUID approvalId = approvalRepository.findByProposalId(proposalId).map(Approval::getId).orElse(null);
            return ProposalResponse.from(proposal, contactName, approvalId, properties.explorerBaseUrl());
        });
    }

    public PageResponse<ProposalResponse> list(UUID userId, ProposalStatus statusFilter, int page, int size) {
        return tx.execute(status -> {
            PageRequest pageRequest = PageRequest.of(page, size, Sort.by("createdAt").descending());
            Page<PaymentProposal> proposals = statusFilter == null
                    ? proposalRepository.findByUserId(userId, pageRequest)
                    : proposalRepository.findByUserIdAndStatus(userId, statusFilter, pageRequest);
            Map<UUID, String> contactNames = contactRepository
                    .findAllById(proposals.getContent().stream().map(PaymentProposal::getContactId)
                            .filter(Objects::nonNull).toList()).stream()
                    .collect(Collectors.toMap(Contact::getId, Contact::getName));
            Map<UUID, UUID> approvalIds = approvalRepository
                    .findByProposalIdIn(proposals.getContent().stream().map(PaymentProposal::getId).toList()).stream()
                    .collect(Collectors.toMap(Approval::getProposalId, Approval::getId));
            return PageResponse.from(proposals, proposal -> ProposalResponse.from(proposal,
                    proposal.getContactId() == null ? null : contactNames.get(proposal.getContactId()),
                    approvalIds.get(proposal.getId()), properties.explorerBaseUrl()));
        });
    }

    /** APROBADO → ENVIADO justo antes de llamar al firmante, con la llave y la regla del mandato. */
    private SignRequest markSent(PaymentProposal proposal, Account account, Mandate mandate) {
        stateMachine.transition(proposal, ProposalStatus.ENVIADO);
        proposal.setSentAt(Instant.now());
        SignRequest request = new SignRequest(
                proposal.getId(),
                account.getSmartAccountAddress(),
                mandate.getContextRuleId(),
                mandate.getKeyVersion(),
                mandate.getAgentPublicKeyHex(),
                proposal.getDestinationAddress(),
                Money.format(proposal.getAmount()),
                Money.toUnits(proposal.getAmount()),
                mandate.getAssetContractId(),
                proposal.getMemo());
        Map<String, Object> data = new HashMap<>();
        data.put("keyVersion", request.keyVersion());
        data.put("agentPublicKeyHex", request.agentPublicKeyHex());
        data.put("contextRuleId", request.contextRuleId());
        data.put("destinationAddress", request.destinationAddress());
        data.put("amountUnits", request.amountUnits());
        auditService.record(AuditEventType.FIRMA_SOLICITADA, AuditActor.BACKEND, proposal.getUserId(), proposal.getId(),
                mandate.getId(), "Firma solicitada al firmante con la llave versión " + request.keyVersion() + ".", data);
        return request;
    }

    private void reject(PaymentProposal proposal, String code, String message) {
        stateMachine.transition(proposal, ProposalStatus.RECHAZADO);
        proposal.setRejectionCode(code);
        proposal.setRejectionMessage(truncate(message, MAX_REJECTION_MESSAGE));
    }

    private static void applyArguments(PaymentProposal proposal, PaymentValidator.Result result) {
        ProposePaymentArguments arguments = result.arguments();
        if (arguments != null) {
            proposal.setAmount(arguments.amount());
            proposal.setAssetCode(arguments.asset() != null && arguments.asset().length() <= MAX_ASSET_CODE
                    ? arguments.asset() : null);
            proposal.setMemo(arguments.memo());
        }
        if (result.contact() != null) {
            proposal.setContactId(result.contact().getId());
            proposal.setDestinationAddress(result.contact().getStellarAddress());
        }
    }

    private static String validSummary(BigDecimal amount, Contact contact, Mandate mandate, boolean needsApproval) {
        String threshold = Money.display(mandate.getApprovalThreshold());
        return "Propuesta válida: " + Money.display(amount) + " USDC a " + contact.getName() + ". "
                + (needsApproval
                        ? "Supera el umbral de aprobación (" + threshold + "), necesita tu aprobación."
                        : "No supera el umbral de aprobación (" + threshold + "), se paga sin preguntar.");
    }

    private static Map<String, Object> txData(PaymentProposal proposal) {
        Map<String, Object> data = new HashMap<>();
        data.put("txHash", proposal.getTxHash());
        data.put("ledger", proposal.getLedger());
        return data;
    }

    private static BigDecimal confidence(Double value) {
        if (value == null || value < 0 || value > 1) {
            return null;
        }
        return BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP);
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
