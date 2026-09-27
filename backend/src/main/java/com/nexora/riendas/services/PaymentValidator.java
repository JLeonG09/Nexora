package com.nexora.riendas.services;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiAction;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.dtos.ai.ProposePaymentArguments;
import com.nexora.riendas.dtos.responses.MandateResponse;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.MandateStatus;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.entities.enums.RejectionCode;
import com.nexora.riendas.repositories.ContactRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Valida cada propose_payment de la IA (MVP_BACKEND.md §5). La IA no es confiable: reglas 1–8
 * en orden, se corta en la primera que falla. Si pasan todas, decide PENDIENTE_APROBACION o APROBADO.
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

    /**
     * Datos que el servicio calcula con la fila de la cuenta bloqueada.
     *
     * @param mandate          mandato ACTIVO de la cuenta (puede estar vencido) o null
     * @param lastMandate      el mandato más reciente de la cuenta, para distinguir "expirado" de "sin mandato"
     * @param proposalsLast10Min propuestas del usuario en los últimos 10 minutos, incluida la actual
     */
    public record Context(
            UUID userId,
            String originalText,
            Mandate mandate,
            Mandate lastMandate,
            BigDecimal spentLast24h,
            long proposalsLast10Min,
            Instant now) {
    }

    public record Result(
            boolean valid,
            RejectionCode code,
            String message,
            ProposePaymentArguments arguments,
            Contact contact,
            List<String> checks,
            ProposalStatus decision) {

        static Result rejected(RejectionCode code, String message, ProposePaymentArguments arguments,
                               Contact contact, List<String> checks) {
            return new Result(false, code, message, arguments, contact, List.copyOf(checks), ProposalStatus.RECHAZADO);
        }
    }

    public Result validate(AiInterpretResponse response, Context context) {
        List<String> checks = new ArrayList<>();

        // Regla 1 · Esquema
        ParsedArguments parsed = parse(response.action());
        if (parsed.error() != null) {
            return Result.rejected(parsed.error(), parsed.error().defaultMessage(), parsed.arguments(), null, checks);
        }
        ProposePaymentArguments arguments = parsed.arguments();
        BigDecimal amount = arguments.amount();
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
        ContactCheck contactCheck = resolveContact(context.userId(), arguments);
        if (contactCheck.error() != null) {
            return Result.rejected(contactCheck.error(), contactCheck.message(), arguments, null, checks);
        }
        Contact contact = contactCheck.contact();
        checks.add("CONTACTO");

        // Regla 4 · El monto aparece literalmente en el texto del usuario
        List<AmountExtractor.Token> tokens = AmountExtractor.extract(context.originalText());
        boolean literal = tokens.stream()
                .anyMatch(token -> !token.ambiguous() && token.value().compareTo(amount) == 0);
        if (!literal) {
            if (tokens.stream().anyMatch(AmountExtractor.Token::ambiguous)) {
                return Result.rejected(RejectionCode.MONTO_AMBIGUO, RejectionCode.MONTO_AMBIGUO.defaultMessage(),
                        arguments, contact, checks);
            }
            String message = tokens.isEmpty()
                    ? "Escribe el monto en números."
                    : RejectionCode.MONTO_NO_EN_TEXTO.defaultMessage()
                            .replace("{monto}", amount.stripTrailingZeros().toPlainString());
            return Result.rejected(RejectionCode.MONTO_NO_EN_TEXTO, message, arguments, contact, checks);
        }
        checks.add("MONTO_EN_TEXTO");

        // Regla 5 · Mandato vigente
        Mandate mandate = context.mandate();
        if (mandate == null || mandate.getStatus() != MandateStatus.ACTIVO) {
            Mandate last = context.lastMandate();
            if (last != null && last.getStatus() == MandateStatus.EXPIRADO) {
                return expired(last, arguments, contact, checks);
            }
            return Result.rejected(RejectionCode.SIN_MANDATO_ACTIVO, RejectionCode.SIN_MANDATO_ACTIVO.defaultMessage(),
                    arguments, contact, checks);
        }
        if (!mandate.getExpiresAt().isAfter(context.now())) {
            return expired(mandate, arguments, contact, checks);
        }
        checks.add("MANDATO");

        // Regla 6 · Tope por transacción
        if (amount.compareTo(mandate.getPerTxLimit()) > 0) {
            return Result.rejected(RejectionCode.SUPERA_TOPE_TRANSACCION,
                    RejectionCode.SUPERA_TOPE_TRANSACCION.defaultMessage()
                            .replace("{perTxLimit}", Money.display(mandate.getPerTxLimit())),
                    arguments, contact, checks);
        }
        checks.add("TOPE_TRANSACCION");

        // Regla 7 · Tope diario (ventana móvil de 24 h, calculada con la cuenta bloqueada)
        if (context.spentLast24h().add(amount).compareTo(mandate.getDailyLimit()) > 0) {
            BigDecimal available = mandate.getDailyLimit().subtract(context.spentLast24h()).max(BigDecimal.ZERO);
            return Result.rejected(RejectionCode.SUPERA_TOPE_DIARIO,
                    RejectionCode.SUPERA_TOPE_DIARIO.defaultMessage().replace("{disponible}", Money.display(available)),
                    arguments, contact, checks);
        }
        checks.add("TOPE_DIARIO");

        // Regla 8 · Frecuencia
        if (context.proposalsLast10Min() > properties.rateLimit().proposalsPer10Min()) {
            return Result.rejected(RejectionCode.LIMITE_FRECUENCIA, RejectionCode.LIMITE_FRECUENCIA.defaultMessage(),
                    arguments, contact, checks);
        }
        checks.add("FRECUENCIA");

        ProposalStatus decision = amount.compareTo(mandate.getApprovalThreshold()) > 0
                ? ProposalStatus.PENDIENTE_APROBACION
                : ProposalStatus.APROBADO;
        return new Result(true, null, null, arguments, contact, List.copyOf(checks), decision);
    }

    private static Result expired(Mandate mandate, ProposePaymentArguments arguments, Contact contact,
                                  List<String> checks) {
        return Result.rejected(RejectionCode.MANDATO_EXPIRADO, RejectionCode.MANDATO_EXPIRADO.defaultMessage()
                .replace("{fecha}", MandateResponse.displayDate(mandate.getExpiresAt())), arguments, contact, checks);
    }

    private record ContactCheck(Contact contact, RejectionCode error, String message) {
    }

    private ContactCheck resolveContact(UUID userId, ProposePaymentArguments arguments) {
        String shownName = arguments.contactName() != null ? arguments.contactName() : String.valueOf(arguments.contactId());
        if (shownName.length() > 40) {
            shownName = shownName.substring(0, 40);
        }
        if (arguments.contactId() != null) {
            Optional<Contact> byId = contactRepository.findByIdAndUserIdAndArchivedFalse(arguments.contactId(), userId);
            if (byId.isEmpty() || (arguments.contactName() != null
                    && !byId.get().getNameNormalized().equals(TextNormalizer.normalize(arguments.contactName())))) {
                return notFound(RejectionCode.CONTACTO_NO_ENCONTRADO, shownName);
            }
            return new ContactCheck(byId.get(), null, null);
        }
        List<Contact> matches = contactRepository.findByUserIdAndNameNormalizedAndArchivedFalse(userId,
                TextNormalizer.normalize(arguments.contactName()));
        if (matches.isEmpty()) {
            return notFound(RejectionCode.CONTACTO_NO_ENCONTRADO, shownName);
        }
        if (matches.size() > 1) {
            return notFound(RejectionCode.CONTACTO_AMBIGUO, shownName);
        }
        return new ContactCheck(matches.get(0), null, null);
    }

    private static ContactCheck notFound(RejectionCode code, String name) {
        return new ContactCheck(null, code, code.defaultMessage().replace("{nombre}", name));
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

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
