package com.nexora.riendas.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.riendas.clients.AiClient;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiContactDto;
import com.nexora.riendas.dtos.ai.AiHistoryItemDto;
import com.nexora.riendas.dtos.ai.AiInterpretRequest;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.dtos.ai.AiMandateDto;
import com.nexora.riendas.dtos.ai.ProposePaymentArguments;
import com.nexora.riendas.dtos.requests.ChatRequest;
import com.nexora.riendas.dtos.responses.ChatMessageResponse;
import com.nexora.riendas.dtos.responses.ChatReplyDto;
import com.nexora.riendas.dtos.responses.ChatResponse;
import com.nexora.riendas.dtos.responses.LimitsResponse;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.dtos.responses.ProposalSummaryDto;
import com.nexora.riendas.entities.Account;
import com.nexora.riendas.entities.ChatMessage;
import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.entities.enums.ChatMessageType;
import com.nexora.riendas.entities.enums.ChatRole;
import com.nexora.riendas.entities.enums.ProposalOrigin;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.exceptions.AiUnavailableException;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.ChatMessageRepository;
import com.nexora.riendas.repositories.PaymentProposalRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orquesta chat → IA → propuesta. Nunca hay una transacción abierta mientras se llama a la IA:
 * (1) guardar mensaje y auditoría, (2) llamar a la IA, (3) crear y validar la propuesta.
 */
@Service
public class ChatService {

    static final String DEFAULT_REPLY = "Puedo pagar a tus contactos. Ejemplo: \"Págale 15 USDC a Ana por el logo\".";
    private static final int HISTORY_SIZE = 6;
    private static final int MAX_MESSAGE_TEXT = 1000;
    private static final int MAX_REJECTION_MESSAGE = 300;
    private static final int MAX_ASSET_CODE = 12;
    private static final int MAX_MODEL = 60;
    private static final Sort NEWEST_FIRST = Sort.by("createdAt").descending();

    private final AccountRepository accountRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final PaymentProposalRepository proposalRepository;
    private final ContactService contactService;
    private final MandateService mandateService;
    private final PaymentValidator paymentValidator;
    private final AiClient aiClient;
    private final AuditService auditService;
    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate tx;

    public ChatService(AccountRepository accountRepository, ChatMessageRepository chatMessageRepository,
                       PaymentProposalRepository proposalRepository, ContactService contactService,
                       MandateService mandateService, PaymentValidator paymentValidator, AiClient aiClient,
                       AuditService auditService, AppProperties properties, ObjectMapper objectMapper,
                       PlatformTransactionManager transactionManager) {
        this.accountRepository = accountRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.proposalRepository = proposalRepository;
        this.contactService = contactService;
        this.mandateService = mandateService;
        this.paymentValidator = paymentValidator;
        this.aiClient = aiClient;
        this.auditService = auditService;
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        Account account = accountRepository.findByUserId(userId).orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
        UUID conversationId = request.conversationId() != null ? request.conversationId() : UUID.randomUUID();
        String text = request.message().trim();
        Optional<Mandate> mandate = mandateService.findActive(account.getId());
        AiMandateDto aiMandate = mandate.map(m -> toAiMandate(mandateService.limitsOf(m))).orElse(null);

        // (1) Mensaje del usuario + auditoría
        AiInterpretRequest aiRequest = tx.execute(status -> {
            List<AiHistoryItemDto> history = history(userId, conversationId);
            saveMessage(userId, conversationId, ChatRole.USUARIO, ChatMessageType.MESSAGE, text, null);
            auditService.record(AuditEventType.CHAT_RECIBIDO, AuditActor.USUARIO, userId, null, null,
                    "Mensaje recibido en el chat.", Map.of("conversationId", conversationId.toString(), "text", text));
            List<AiContactDto> contacts = contactService.listAll(userId).stream()
                    .map(contact -> new AiContactDto(contact.getId(), contact.getName()))
                    .toList();
            return new AiInterpretRequest(UUID.randomUUID(), userId, conversationId, text, "es-CR", Instant.now(),
                    aiMandate, contacts, history, List.of("propose_payment"));
        });

        // (2) IA, fuera de transacción
        AiInterpretResponse response = callAi(userId, aiRequest);

        // (3) Respuesta o propuesta
        return tx.execute(status -> {
            auditService.record(AuditEventType.IA_RESPUESTA, AuditActor.IA, userId, null, null,
                    "La IA respondió con tipo \"" + response.type() + "\".", aiAuditData(response));
            if (AiInterpretResponse.TYPE_MESSAGE.equals(response.type())) {
                String replyText = response.message() == null || response.message().isBlank()
                        ? DEFAULT_REPLY : response.message();
                ChatMessage reply = saveMessage(userId, conversationId, ChatRole.AGENTE, ChatMessageType.MESSAGE,
                        replyText, null);
                return new ChatResponse(conversationId, ChatReplyDto.from(reply), null);
            }
            return handleAction(userId, account, conversationId, text, mandate.orElse(null), response);
        });
    }

    public PageResponse<ChatMessageResponse> messages(UUID userId, UUID conversationId, int limit) {
        PageRequest pageRequest = PageRequest.of(0, limit, NEWEST_FIRST);
        Page<ChatMessage> page = tx.execute(status -> conversationId == null
                ? chatMessageRepository.findByUserId(userId, pageRequest)
                : chatMessageRepository.findByUserIdAndConversationId(userId, conversationId, pageRequest));
        List<ChatMessageResponse> items = new ArrayList<>(page.getContent().stream().map(ChatMessageResponse::from).toList());
        Collections.reverse(items);
        return new PageResponse<>(items, 0, limit, page.getTotalElements());
    }

    private ChatResponse handleAction(UUID userId, Account account, UUID conversationId, String text, Mandate mandate,
                                      AiInterpretResponse response) {
        PaymentProposal proposal = new PaymentProposal();
        proposal.setUserId(userId);
        proposal.setAccountId(account.getId());
        proposal.setMandateId(mandate == null ? null : mandate.getId());
        proposal.setConversationId(conversationId);
        proposal.setOrigin(ProposalOrigin.CHAT);
        proposal.setOriginalText(text);
        proposal.setAiConfidence(confidence(response.confidence()));
        proposal.setAiModel(truncate(response.model(), MAX_MODEL));
        proposal.setAiRaw(objectMapper.convertValue(response, new TypeReference<Map<String, Object>>() { }));
        proposal.setStatus(ProposalStatus.PROPUESTO);
        proposal = proposalRepository.saveAndFlush(proposal);
        auditService.record(AuditEventType.PROPUESTA_CREADA, AuditActor.BACKEND, userId, proposal.getId(),
                proposal.getMandateId(), "Propuesta creada a partir de la respuesta de la IA.",
                Map.of("originalText", text));

        PaymentValidator.Result result = paymentValidator.validate(userId, response);
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

        String replyText;
        if (!result.valid()) {
            String message = truncate(result.message(), MAX_REJECTION_MESSAGE);
            proposal.setStatus(ProposalStatus.RECHAZADO);
            proposal.setRejectionCode(result.code().name());
            proposal.setRejectionMessage(message);
            auditService.record(AuditEventType.VALIDACION_RECHAZADA, AuditActor.BACKEND, userId, proposal.getId(),
                    proposal.getMandateId(), "Propuesta rechazada: " + result.code() + ".",
                    Map.of("rejectionCode", result.code().name(), "checksPassed", result.checks()));
            replyText = message;
        } else {
            // TODO(fase 3): reglas 4–8 y decisión (PENDIENTE_APROBACION / APROBADO → firmante).
            replyText = "Entendí un pago de " + Money.display(arguments.amount()) + " USDC a "
                    + result.contact().getName() + (arguments.memo() == null ? "" : " por \"" + arguments.memo() + "\"")
                    + ". Todavía no lo envié: falta completar la validación.";
        }
        proposal = proposalRepository.saveAndFlush(proposal);

        ChatMessage reply = saveMessage(userId, conversationId, ChatRole.AGENTE, ChatMessageType.PROPOSAL,
                truncate(replyText, MAX_MESSAGE_TEXT), proposal.getId());
        String contactName = result.contact() == null ? null : result.contact().getName();
        return new ChatResponse(conversationId, ChatReplyDto.from(reply),
                ProposalSummaryDto.from(proposal, contactName, null, properties.explorerBaseUrl()));
    }

    private AiInterpretResponse callAi(UUID userId, AiInterpretRequest request) {
        try {
            AiInterpretResponse response = aiClient.interpret(request);
            if (response == null || !(AiInterpretResponse.TYPE_ACTION.equals(response.type())
                    || AiInterpretResponse.TYPE_MESSAGE.equals(response.type()))) {
                throw new AiUnavailableException("La IA respondió con un tipo desconocido");
            }
            return response;
        } catch (AiUnavailableException e) {
            tx.executeWithoutResult(status -> auditService.record(AuditEventType.IA_ERROR, AuditActor.IA, userId,
                    null, null, "La IA no respondió o respondió algo inválido.",
                    Map.of("requestId", request.requestId().toString(), "error", String.valueOf(e.getMessage()))));
            throw e;
        }
    }

    private List<AiHistoryItemDto> history(UUID userId, UUID conversationId) {
        List<AiHistoryItemDto> history = new ArrayList<>(chatMessageRepository
                .findByUserIdAndConversationId(userId, conversationId, PageRequest.of(0, HISTORY_SIZE, NEWEST_FIRST))
                .getContent().stream()
                .map(message -> new AiHistoryItemDto(message.getRole().name(), message.getText()))
                .toList());
        Collections.reverse(history);
        return history;
    }

    private ChatMessage saveMessage(UUID userId, UUID conversationId, ChatRole role, ChatMessageType type, String text,
                                    UUID proposalId) {
        ChatMessage message = new ChatMessage();
        message.setUserId(userId);
        message.setConversationId(conversationId);
        message.setRole(role);
        message.setType(type);
        message.setText(truncate(text, MAX_MESSAGE_TEXT));
        message.setProposalId(proposalId);
        return chatMessageRepository.saveAndFlush(message);
    }

    private static AiMandateDto toAiMandate(LimitsResponse limits) {
        return new AiMandateDto(limits.status().name(), limits.asset(), limits.dailyLimit(), limits.availableLast24h(),
                limits.perTxLimit(), limits.approvalThreshold(), limits.expiresAt());
    }

    private static Map<String, Object> aiAuditData(AiInterpretResponse response) {
        Map<String, Object> data = new HashMap<>();
        data.put("type", response.type());
        data.put("model", response.model());
        data.put("confidence", response.confidence());
        data.put("ungroundedFields", response.ungroundedFields());
        if (response.action() != null) {
            data.put("tool", response.action().tool());
            data.put("arguments", response.action().arguments());
        }
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
