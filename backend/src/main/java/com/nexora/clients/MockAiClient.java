package com.nexora.clients;

import com.nexora.dtos.ai.AiAction;
import com.nexora.dtos.ai.AiContactDto;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.exceptions.AiUnavailableException;
import com.nexora.services.AmountExtractor;
import com.nexora.services.Money;
import com.nexora.services.TextNormalizer;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * IA simulada con reglas fijas (MVP_BACKEND.md §6.1). Los marcadores #ia-error, #ia-inventa,
 * #ia-baja e #ia-extra solo existen aquí, para probar cada rama de la validación.
 */
@Component
@ConditionalOnProperty(name = "app.ai.mode", havingValue = "mock", matchIfMissing = true)
public class MockAiClient implements AiClient {

    static final String HELP_MESSAGE = "Puedo pagar a tus contactos. Ejemplo: \"Págale 15 USDC a Ana por el logo\".";

    private static final Pattern PAYMENT_VERB = Pattern.compile("\\b(pag|mand|envi|transf)\\w*");
    private static final Pattern BALANCE_WORD = Pattern.compile("\\b(cuanto|saldo|limite|queda)\\w*");
    /** Los marcadores #firmante-* se quedan en el memo para que los lea el firmante simulado. */
    private static final Pattern MARKER = Pattern.compile("#ia-[\\w-]+");
    private static final int MAX_MEMO = 100;

    @Override
    public AiInterpretResponse interpret(AiInterpretRequest request) {
        String normalized = TextNormalizer.normalize(request.message());
        if (normalized.contains("#ia-error")) {
            throw new AiUnavailableException("Falla simulada de la IA (#ia-error)");
        }

        List<AmountExtractor.Token> numbers = AmountExtractor.extract(request.message());
        Optional<AiContactDto> contact = findContact(normalized, request.contacts());
        if (PAYMENT_VERB.matcher(normalized).find() && !numbers.isEmpty() && contact.isPresent()) {
            return paymentAction(request, normalized, numbers.get(0).value(), contact.get());
        }

        if (BALANCE_WORD.matcher(normalized).find()) {
            String text = request.mandate() == null
                    ? "No tienes un mandato activo."
                    : "Te quedan " + Money.display(new BigDecimal(request.mandate().availableLast24h()))
                            + " USDC en las últimas 24 horas.";
            return message(request, text);
        }
        return message(request, HELP_MESSAGE);
    }

    private AiInterpretResponse paymentAction(AiInterpretRequest request, String normalized, BigDecimal number,
                                              AiContactDto contact) {
        BigDecimal amount = normalized.contains("#ia-inventa")
                ? number.divide(BigDecimal.valueOf(100), Money.SCALE, RoundingMode.DOWN)
                : number;
        String amountText = amount.stripTrailingZeros().toPlainString();

        Map<String, Object> arguments = new LinkedHashMap<>();
        arguments.put("contactId", contact.id().toString());
        arguments.put("contactName", contact.name());
        arguments.put("amount", amountText);
        arguments.put("asset", "USDC");
        String memo = memo(request.message());
        if (memo != null) {
            arguments.put("memo", memo);
        }
        if (normalized.contains("#ia-extra")) {
            arguments.put("destinationAddress", "G" + "X".repeat(55));
        }

        double confidence = normalized.contains("#ia-baja") ? 0.4 : 0.95;
        return new AiInterpretResponse(
                request.requestId(),
                AiInterpretResponse.TYPE_ACTION,
                new AiAction(AiAction.PROPOSE_PAYMENT, arguments),
                "Voy a proponer un pago de " + amountText + " USDC a " + contact.name() + ".",
                confidence,
                "Respuesta simulada por reglas.",
                List.of(),
                "mock");
    }

    private static AiInterpretResponse message(AiInterpretRequest request, String text) {
        return new AiInterpretResponse(request.requestId(), AiInterpretResponse.TYPE_MESSAGE, null, text, 0.9, null,
                List.of(), "mock");
    }

    /** El contacto cuyo nombre aparece como palabra completa; si hay varios, el nombre más largo. */
    private static Optional<AiContactDto> findContact(String normalizedText, List<AiContactDto> contacts) {
        if (contacts == null) {
            return Optional.empty();
        }
        return contacts.stream()
                .filter(contact -> {
                    String name = TextNormalizer.normalize(contact.name());
                    return !name.isEmpty()
                            && Pattern.compile("(^|\\W)" + Pattern.quote(name) + "($|\\W)").matcher(normalizedText).find();
                })
                .max(Comparator.comparingInt(contact -> contact.name().length()));
    }

    private static String memo(String message) {
        int index = message.toLowerCase(Locale.ROOT).indexOf(" por ");
        if (index < 0) {
            return null;
        }
        String memo = MARKER.matcher(message.substring(index + 5)).replaceAll("").trim().replaceAll("\\s+", " ");
        if (memo.isEmpty()) {
            return null;
        }
        return memo.length() > MAX_MEMO ? memo.substring(0, MAX_MEMO) : memo;
    }
}
