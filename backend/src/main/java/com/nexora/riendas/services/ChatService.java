package com.nexora.riendas.services;

import com.nexora.riendas.clients.AiClient;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiContactDto;
import com.nexora.riendas.dtos.ai.AiHistoryItemDto;
import com.nexora.riendas.dtos.ai.AiInterpretRequest;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.dtos.ai.AiMandateDto;
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
import com.nexora.riendas.exceptions.AiUnavailableException;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.AccountRepository;
import com.nexora.riendas.repositories.ChatMessageRepository;
import com.nexora.riendas.repositories.MandateRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orquesta chat → IA → propuesta → firmante. Nunca hay una transacción abierta mientras se llama
 * a la IA o al firmante: (1) guardar mensaje y auditoría, (2) IA, (3) crear y validar la propuesta
 * con la cuenta bloqueada, (4) firmante, (5) guardar el resultado y responder.
 */
@Service
public class ChatService {

    static final String DEFAULT_REPLY = "Puedo pagar a tus contactos. Ejemplo: \"Págale 15 USDC a Ana por el logo\".";
    private static final int HISTORY_SIZE = 6;
    private static final int MAX_MESSAGE_TEXT = 1000;
    private static final Sort NEWEST_FIRST = Sort.by("createdAt").descending();

    private final AccountRepository accountRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final MandateRepository mandateRepository;
    private final ContactService contactService;
    private final MandateService mandateService;
    private final PaymentProposalService proposalService;
    private final AiClient aiClient;
    private final AuditService auditService;
    private final AppProperties properties;
    private final TransactionTemplate tx;

    public ChatService(AccountRepository accountRepository, ChatMessageRepository chatMessageRepository,
                       MandateRepository mandateRepository, ContactService contactService,
                       MandateService mandateService, PaymentProposalService proposalService, AiClient aiClient,
                       AuditService auditService, AppProperties properties,
                       PlatformTransactionManager transactionManager) {
        this.accountRepository = accountRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.mandateRepository = mandateRepository;
        this.contactService = contactService;
        this.mandateService = mandateService;
        this.proposalService = proposalService;
        this.aiClient = aiClient;
        this.auditService = auditService;
        this.properties = properties;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public ChatResponse chat(UUID userId, ChatRequest request) {
        Account account = accountRepository.findByUserId(userId).orElseThrow(() -> new ApiException(ErrorCode.SIN_CUENTA));
        UUID conversationId = request.conversationId() != null ? request.conversationId() : UUID.randomUUID();
        String text = request.message().trim();
        AiMandateDto aiMandate = mandateService.findVigentWithoutExpiring(account.getId())
                .map(mandate -> toAiMandate(mandateService.limitsOf(mandate)))
                .orElse(null);

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
        tx.executeWithoutResult(status -> auditService.record(AuditEventType.IA_RESPUESTA, AuditActor.IA, userId, null,
                null, "La IA respondió con tipo \"" + response.type() + "\".", aiAuditData(response)));

        if (AiInterpretResponse.TYPE_MESSAGE.equals(response.type())) {
            String replyText = response.message() == null || response.message().isBlank()
                    ? DEFAULT_REPLY : response.message();
            ChatMessage reply = tx.execute(status -> saveMessage(userId, conversationId, ChatRole.AGENTE,
                    ChatMessageType.MESSAGE, replyText, null));
            return new ChatResponse(conversationId, ChatReplyDto.from(reply), null);
        }

        // (3) Propuesta validada con la cuenta bloqueada
        PaymentProposalService.Outcome outcome = proposalService.createFromAi(userId, account.getId(), conversationId,
                text, response);
        PaymentProposal proposal = outcome.proposal();

        // (4) Firmante, fuera de transacción
        if (outcome.signRequest() != null) {
            proposal = proposalService.submit(outcome.signRequest());
        }

        // (5) Respuesta del agente
        String replyText = replyFor(proposal, outcome.contactName());
        UUID proposalId = proposal.getId();
        ChatMessage reply = tx.execute(status -> saveMessage(userId, conversationId, ChatRole.AGENTE,
                ChatMessageType.PROPOSAL, replyText, proposalId));
        return new ChatResponse(conversationId, ChatReplyDto.from(reply),
                ProposalSummaryDto.from(proposal, outcome.contactName(), outcome.approvalId(),
                        properties.explorerBaseUrl()));
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

    private String replyFor(PaymentProposal proposal, String contactName) {
        String amount = proposal.getAmount() == null ? null : Money.display(proposal.getAmount());
        return switch (proposal.getStatus()) {
            case CONFIRMADO -> "Listo: le pagué " + amount + " USDC a " + contactName
                    + (proposal.getMemo() == null ? "" : " por \"" + proposal.getMemo() + "\"") + "."
                    + remainingText(proposal);
            case PENDIENTE_APROBACION -> "Ese pago de " + amount + " USDC necesita tu aprobación. Revísalo en la bandeja.";
            case ENVIADO -> "Envié el pago de " + amount + " USDC a " + contactName
                    + ". Estoy esperando la confirmación de la red.";
            case RECHAZADO, FALLIDO -> proposal.getRejectionMessage();
            default -> "Recibí tu pedido de pago.";
        };
    }

    private String remainingText(PaymentProposal proposal) {
        if (proposal.getMandateId() == null) {
            return "";
        }
        return tx.execute(status -> mandateRepository.findById(proposal.getMandateId())
                .map(Mandate::getDailyLimit)
                .map(daily -> daily.subtract(mandateService.spentLast24h(proposal.getAccountId())).max(BigDecimal.ZERO))
                .map(available -> " Te quedan " + Money.display(available) + " USDC en las últimas 24 horas.")
                .orElse(""));
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
        message.setText(text.length() <= MAX_MESSAGE_TEXT ? text : text.substring(0, MAX_MESSAGE_TEXT));
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
}
