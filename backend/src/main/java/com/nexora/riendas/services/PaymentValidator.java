package com.nexora.riendas.services;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiAction;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.dtos.ai.ProposePaymentArguments;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.enums.RejectionCode;
import com.nexora.riendas.repositories.ContactRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Valida cada propose_payment de la IA (MVP_BACKEND.md §5). La IA no es confiable.
 * Reglas implementadas: 1 (esquema), 2 (confianza) y 3 (contacto en la lista blanca).
 */
@Component
public class PaymentValidator {

    private static final Set<String> ALLOWED_ARGUMENTS = Set.of("contactId", "contactName", "amount", "asset", "memo");
    private static final int MAX_MEMO = 100;

    private final ContactRepository contactRepository;
    private final AppProperties properties;

    public PaymentValidator(ContactRepository contactRepository, AppProperties properties) {
        this.contactRepository = contactRepository;
        this.properties = properties;
    }

    public record Result(
            boolean valid,
            RejectionCode code,
            String message,
            ProposePaymentArguments arguments,
            Contact contact,
            List<String> checks) {

        static Result rejected(RejectionCode code, String message, ProposePaymentArguments arguments,
                               Contact contact, List<String> checks) {
            return new Result(false, code, message, arguments, contact, List.copyOf(checks));
        }
    }

    public Result validate(UUID userId, AiInterpretResponse response) {
        List<String> checks = new ArrayList<>();

        // Regla 1 · Esquema
        ParsedArguments parsed = parse(response.action());
        if (parsed.error() != null) {
            return Result.rejected(parsed.error(), parsed.error().defaultMessage(), parsed.arguments(), null, checks);
        }
        ProposePaymentArguments arguments = parsed.arguments();
        checks.add("ESQUEMA");

        // Regla 2 · Confianza y campos no fundamentados
        Double confidence = response.confidence();
        if (confidence == null || BigDecimal.valueOf(confidence).compareTo(properties.ai().minConfidence()) < 0) {
            return Result.rejected(RejectionCode.CONFIANZA_BAJA, RejectionCode.CONFIANZA_BAJA.defaultMessage(),
                    arguments, null, checks);
        }
        if (response.ungroundedFields() != null && !response.ungroundedFields().isEmpty()) {
            return Result.rejected(RejectionCode.CAMPO_NO_FUNDAMENTADO,
                    RejectionCode.CAMPO_NO_FUNDAMENTADO.defaultMessage(), arguments, null, checks);
        }
        checks.add("CONFIANZA");

        // Regla 3 · Destinatario en la lista blanca (la dirección sale siempre de la base)
        String shownName = arguments.contactName() != null ? arguments.contactName() : String.valueOf(arguments.contactId());
        Contact contact;
        if (arguments.contactId() != null) {
            Optional<Contact> byId = contactRepository.findByIdAndUserIdAndArchivedFalse(arguments.contactId(), userId);
            if (byId.isEmpty() || (arguments.contactName() != null
                    && !byId.get().getNameNormalized().equals(TextNormalizer.normalize(arguments.contactName())))) {
                return Result.rejected(RejectionCode.CONTACTO_NO_ENCONTRADO,
                        contactMessage(RejectionCode.CONTACTO_NO_ENCONTRADO, shownName), arguments, null, checks);
            }
            contact = byId.get();
        } else {
            List<Contact> matches = contactRepository.findByUserIdAndNameNormalizedAndArchivedFalse(userId,
                    TextNormalizer.normalize(arguments.contactName()));
            if (matches.isEmpty()) {
                return Result.rejected(RejectionCode.CONTACTO_NO_ENCONTRADO,
                        contactMessage(RejectionCode.CONTACTO_NO_ENCONTRADO, shownName), arguments, null, checks);
            }
            if (matches.size() > 1) {
                return Result.rejected(RejectionCode.CONTACTO_AMBIGUO,
                        contactMessage(RejectionCode.CONTACTO_AMBIGUO, shownName), arguments, null, checks);
            }
            contact = matches.get(0);
        }
        checks.add("CONTACTO");

        return new Result(true, null, null, arguments, contact, List.copyOf(checks));
    }

    private record ParsedArguments(ProposePaymentArguments arguments, RejectionCode error) {
    }

    private static ParsedArguments parse(AiAction action) {
        if (action == null || !AiAction.PROPOSE_PAYMENT.equals(action.tool()) || action.arguments() == null) {
            return new ParsedArguments(null, RejectionCode.ESQUEMA_INVALIDO);
        }
        Map<String, Object> raw = action.arguments();
        if (!ALLOWED_ARGUMENTS.containsAll(raw.keySet())) {
            return new ParsedArguments(null, RejectionCode.ESQUEMA_INVALIDO);
        }
        for (Object value : raw.values()) {
            if (value != null && !(value instanceof String)) {
                // Números JSON (15 sin comillas), listas u objetos no se aceptan.
                return new ParsedArguments(null, RejectionCode.ESQUEMA_INVALIDO);
            }
        }

        String contactIdText = blankToNull((String) raw.get("contactId"));
        String contactName = blankToNull((String) raw.get("contactName"));
        String amountText = (String) raw.get("amount");
        String asset = (String) raw.get("asset");
        String memo = blankToNull((String) raw.get("memo"));

        UUID contactId = null;
        if (contactIdText != null) {
            try {
                contactId = UUID.fromString(contactIdText);
            } catch (IllegalArgumentException e) {
                return new ParsedArguments(null, RejectionCode.ESQUEMA_INVALIDO);
            }
        }
        BigDecimal amount = Money.isValid(amountText) ? Money.parse(amountText) : null;
        ProposePaymentArguments partial = new ProposePaymentArguments(contactId, contactName, amount, asset,
                memo != null && memo.length() > MAX_MEMO ? null : memo);

        if (contactId == null && contactName == null) {
            return new ParsedArguments(partial, RejectionCode.ESQUEMA_INVALIDO);
        }
        if (amount == null || amount.signum() <= 0) {
            return new ParsedArguments(partial, RejectionCode.ESQUEMA_INVALIDO);
        }
        if (asset == null) {
            return new ParsedArguments(partial, RejectionCode.ESQUEMA_INVALIDO);
        }
        if (!"USDC".equals(asset)) {
            return new ParsedArguments(partial, RejectionCode.ACTIVO_NO_PERMITIDO);
        }
        if (memo != null && memo.length() > MAX_MEMO) {
            return new ParsedArguments(partial, RejectionCode.ESQUEMA_INVALIDO);
        }
        return new ParsedArguments(partial, null);
    }

    private static String contactMessage(RejectionCode code, String name) {
        return code.defaultMessage().replace("{nombre}", name);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
