package com.nexora.riendas.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.riendas.clients.SignerClient;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.dtos.ai.ProposePaymentArguments;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.dtos.responses.ProposalResponse;
import com.nexora.riendas.dtos.signer.SignRequest;
import com.nexora.riendas.dtos.signer.SignResponse;
import com.nexora.riendas.dtos.signer.SignerErrorDto;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.entities.Approval;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ApprovedBy;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.entities.enums.MandateStatus;
import com.nexora.riendas.entities.enums.ProposalOrigin;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.entities.enums.RejectionCode;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.exceptions.SignerRejectedException;
import com.nexora.riendas.exceptions.SignerUnavailableException;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.ApprovalRepository;
import com.nexora.riendas.repositories.ContactRepository;
import com.nexora.riendas.repositories.MandateRepository;
import com.nexora.riendas.repositories.PaymentProposalRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
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
            SignResponse response = signerClient.signAndSubmit(request);
            return applySignerResponse(request.proposalId(), response);
        } catch (SignerRejectedException e) {
            return applySignerResponse(request.proposalId(), new SignResponse(request.proposalId(), SignResponse.FALLIDO,
                    null, null, null, null, new SignerErrorDto(e.code(), null, null, e.getMessage(), null)));
        } catch (SignerUnavailableException e) {
            log.warn("Firmante no disponible para la propuesta {}: {}", request.proposalId(), e.getMessage());
            return proposalRepository.findById(request.proposalId()).orElseThrow();
        }
    }

    /** Aplica CONFIRMADO / FALLIDO. ENVIADO o una propuesta que ya no está en ENVIADO no cambian nada. */
    public PaymentProposal applySignerResponse(UUID proposalId, SignResponse response) {
        return tx.execute(status -> {
            PaymentProposal proposal = proposalRepository.findById(proposalId).orElseThrow();
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
