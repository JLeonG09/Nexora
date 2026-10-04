package com.nexora.clients;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.clients.RuleInterpreter.ContactMatch;
import com.nexora.clients.RuleInterpreter.Intent;
import com.nexora.clients.RuleInterpreter.Reading;
import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiAction;
import com.nexora.dtos.ai.AiContactDto;
import com.nexora.dtos.ai.AiHistoryItemDto;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.dtos.ai.AiMandateDto;
import com.nexora.services.Money;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Agente pequeño: las reglas de {@link RuleInterpreter} resuelven casi todo y un modelo diminuto solo clasifica
 * la intención cuando el mensaje no trae un verbo conocido ("Ana 20"). Las respuestas son plantillas, así que el
 * modelo nunca redacta. Si el modelo no está, el agente sigue respondiendo con las reglas.
 *
 * <p>Solo propone un pago cuando el contacto queda identificado y el monto está escrito en el mensaje actual:
 * lo demás lo pregunta en vez de dejar que el validador lo rechace.
 */
@Component
@ConditionalOnProperty(name = "app.ai.mode", havingValue = "hybrid")
public class HybridAiClient implements AiClient {

    enum Kind { PAGO, PREGUNTA_MONTO, PREGUNTA_CONTACTO, CONFIRMA_CONTACTO, ELIGE_CONTACTO, UNO_A_LA_VEZ,
        MONTO_AMBIGUO, ACLARAR_MONTO, MONTO_INVALIDO, MONEDA_NO_USDC, NO_ES_PAGO, SALDO, SALUDO, COMO_ESTAS,
        QUIEN_ERES, AGRADECE, DESPEDIDA, ASIENTE, AYUDA, NO_ENTENDI }

    record Decision(Kind kind, AiContactDto contact, String amount, String memo, String text, boolean usedModel) {
    }

    static final String ASK_AMOUNT_PREFIX = "¿Cuánto le quieres pagar a ";
    static final String HELP = "Puedo pagar a tus contactos. Dime a quién, cuánto y por qué. "
            + "Por ejemplo: «Págale 15 a Ana por el café». También te digo cuánto te queda para gastar hoy.";
    static final String OFFER = "¿En qué te ayudo? Puedo pagar a tus contactos o decirte cuánto te queda para gastar.";
    static final String NOT_A_PAYMENT = "Eso suena a dinero que te deben, que recibiste o que ya pagaste, "
            + "y yo solo envío pagos nuevos. Si quieres pagar a alguien, dime a quién, cuánto y por qué.";
    static final double RULES_CONFIDENCE = 0.95;
    static final double MODEL_CONFIDENCE = 0.85;
    private static final double MESSAGE_CONFIDENCE = 0.9;
    private static final int MAX_LISTED_CONTACTS = 5;

    private final IntentModel intentModel;
    private final String modelName;

    @Autowired
    public HybridAiClient(AppProperties properties, RestClient.Builder builder, ObjectMapper objectMapper,
                          @Value("${app.ai.model:}") String model) {
        AppProperties.Ai ai = properties.ai();
        this.modelName = model == null ? "" : model.trim();
        this.intentModel = modelName.isEmpty() ? IntentModel.NONE
                : new OpenAiIntentModel(ai.baseUrl(), ai.serviceKey(), modelName,
                        Duration.ofMillis(ai.connectTimeoutMs()), Duration.ofMillis(ai.readTimeoutMs()),
                        builder, objectMapper);
    }

    HybridAiClient(IntentModel intentModel, String modelName) {
        this.intentModel = intentModel;
        this.modelName = modelName;
    }

    @Override
    public AiInterpretResponse interpret(AiInterpretRequest request) {
        Decision decision = decide(request);
        String model = decision.usedModel() ? modelName : "reglas";
        if (decision.kind() != Kind.PAGO) {
            return new AiInterpretResponse(request.requestId(), AiInterpretResponse.TYPE_MESSAGE, null,
                    decision.text(), MESSAGE_CONFIDENCE, null, List.of(), model);
        }
        Map<String, Object> arguments = new LinkedHashMap<>();
        arguments.put("contactId", decision.contact().id().toString());
        arguments.put("contactName", decision.contact().name());
        arguments.put("amount", decision.amount());
        arguments.put("asset", "USDC");
        if (decision.memo() != null) {
            arguments.put("memo", decision.memo());
        }
        return new AiInterpretResponse(request.requestId(), AiInterpretResponse.TYPE_ACTION,
                new AiAction(AiAction.PROPOSE_PAYMENT, arguments), decision.text(),
                decision.usedModel() ? MODEL_CONFIDENCE : RULES_CONFIDENCE,
                decision.usedModel() ? "Reglas y modelo de intención." : "Reglas.",
                List.of(), model);
    }

    Decision decide(AiInterpretRequest request) {
        List<AiContactDto> contacts = request.contacts() == null ? List.of() : request.contacts();
        Reading reading = RuleInterpreter.read(request.message(), contacts);
        Intent intent = reading.intent();
        boolean usedModel = false;

        // "15" justo después de "¿Cuánto le quieres pagar a Ana?"
        if (reading.match() == ContactMatch.NONE && reading.hasClearAmount()
                && (intent == Intent.UNKNOWN || intent == Intent.PAY)) {
            Optional<AiContactDto> pending = contactAwaitingAmount(request.history(), contacts);
            if (pending.isPresent()) {
                reading = new Reading(Intent.PAY, ContactMatch.EXACT, List.of(pending.get()), reading.amounts(),
                        reading.memo(), reading.foreignCurrency(), reading.multiplier());
                intent = Intent.PAY;
            }
        }

        if (intent == Intent.UNKNOWN && (reading.match() != ContactMatch.NONE || !reading.amounts().isEmpty())) {
            Optional<Intent> classified = intentModel.classify(request.message());
            usedModel = classified.isPresent();
            intent = classified.orElse(Intent.UNKNOWN);
        }

        return switch (intent) {
            case PAY -> pay(reading, contacts, usedModel);
            case NOT_PAY -> message(Kind.NO_ES_PAGO, NOT_A_PAYMENT, usedModel);
            case NEGATED -> message(Kind.NO_ES_PAGO, "Entendido, no haré ese pago.", usedModel);
            case BALANCE -> message(Kind.SALDO, balance(request.mandate()), usedModel);
            case GREETING -> message(Kind.SALUDO, withGreeting(request.message(), OFFER), usedModel);
            case HOW_ARE_YOU -> message(Kind.COMO_ESTAS, withGreeting(request.message(),
                    "¡Muy bien, gracias por preguntar! ¿A quién le pagamos hoy?"), usedModel);
            case WHO_ARE_YOU -> message(Kind.QUIEN_ERES, withGreeting(request.message(),
                    "Soy Nexora, tu asistente de pagos. Pago a tus contactos dentro de las reglas que tú pusiste "
                            + "y te pregunto antes de los pagos grandes. Por ejemplo: «Págale 15 a Ana por el café»."),
                    usedModel);
            case HELP -> message(Kind.AYUDA, withGreeting(request.message(), HELP), usedModel);
            case THANKS -> message(Kind.AGRADECE, "¡Con gusto! Si necesitas otro pago, aquí estoy.", usedModel);
            case FAREWELL -> message(Kind.DESPEDIDA, "¡Hasta luego! Cuando quieras pagar algo, escríbeme.",
                    usedModel);
            case ACKNOWLEDGE -> message(Kind.ASIENTE, "¡Perfecto! ¿Algo más en lo que te ayude?", usedModel);
            case UNKNOWN -> message(Kind.NO_ENTENDI, "No te entendí bien. " + HELP, usedModel);
        };
    }

    private static String withGreeting(String message, String reply) {
        String greeting = RuleInterpreter.greetingOf(message);
        return greeting == null ? reply : "¡" + greeting + "! " + reply;
    }

    private static Decision pay(Reading reading, List<AiContactDto> contacts, boolean usedModel) {
        if (reading.foreignCurrency()) {
            return new Decision(Kind.MONEDA_NO_USDC, reading.identifiesOneContact() ? reading.contact() : null,
                    null, null, "Solo puedo pagar en USDC. Dime el monto en USDC, por ejemplo: "
                    + "«Págale 15 USDC a Ana».", usedModel);
        }
        if (reading.multiplier()) {
            return new Decision(Kind.MONTO_AMBIGUO, reading.identifiesOneContact() ? reading.contact() : null,
                    null, null, "No uso «mil» como monto. Escríbelo en números, por ejemplo 1000 o 2000.", usedModel);
        }
        AiContactDto contact = reading.contact();
        String example = reading.amount() != null ? reading.amount().raw() : "15";
        return switch (reading.match()) {
            case MULTIPLE -> message(Kind.UNO_A_LA_VEZ,
                    "Hagamos los pagos de uno en uno. ¿A quién le pago primero?", usedModel);
            case AMBIGUOUS -> message(Kind.ELIGE_CONTACTO, "Tienes varios contactos con un nombre parecido: "
                    + names(reading.contacts(), "o") + ". Escríbeme el nombre completo de a quién le pago.", usedModel);
            case FUZZY -> new Decision(Kind.CONFIRMA_CONTACTO, contact, null, null, "¿Te refieres a "
                    + contact.name() + "? Si es así, escríbelo con su nombre: «Págale " + example + " a "
                    + contact.name() + "».", usedModel);
            case NONE -> {
                Decision amountProblem = amountProblem(reading, null, usedModel);
                if (amountProblem != null) {
                    yield amountProblem;
                }
                yield message(Kind.PREGUNTA_CONTACTO, contacts.isEmpty()
                        ? "Todavía no tienes contactos. Agrégalos en «Mis contactos» y luego te ayudo a pagarles."
                        : "No encuentro a esa persona en tus contactos. Tus contactos son: "
                                + names(contacts, "y") + ". Si es otra persona, agrégala en «Mis contactos».",
                        usedModel);
            }
            case EXACT, PARTIAL -> {
                Decision amountProblem = amountProblem(reading, contact, usedModel);
                if (amountProblem != null) {
                    yield amountProblem;
                }
                if (reading.amount() != null) {
                    String amount = reading.amount().value().stripTrailingZeros().toPlainString();
                    yield new Decision(Kind.PAGO, contact, amount, reading.memo(),
                            "Voy a proponer un pago de " + amount + " USDC a " + contact.name() + ".", usedModel);
                }
                if (reading.hasOnlyAmbiguousAmounts()) {
                    yield new Decision(Kind.MONTO_AMBIGUO, contact, null, null, "No sé si «"
                            + reading.amounts().get(0).raw() + "» es con miles o con decimales. Escríbelo sin "
                            + "separador de miles (1000) o con punto decimal (2.50).", usedModel);
                }
                yield new Decision(Kind.PREGUNTA_MONTO, contact, null, null, ASK_AMOUNT_PREFIX + contact.name()
                        + "? Escríbelo en números, por ejemplo 15.", usedModel);
            }
        };
    }

    /** Varios números, o un monto que no es mayor que cero. Null si el monto se puede usar. */
    private static Decision amountProblem(Reading reading, AiContactDto contact, boolean usedModel) {
        int payable = reading.payableAmounts().size();
        if (payable > 1 || (payable == 1 && reading.amounts().size() > 1)) {
            String numbers = reading.amounts().stream()
                    .filter(token -> !token.ambiguous())
                    .map(token -> token.value().stripTrailingZeros().toPlainString())
                    .reduce((left, right) -> left + " o " + right)
                    .orElse("");
            String who = contact == null ? "esa persona" : contact.name();
            return new Decision(Kind.ACLARAR_MONTO, contact, null, null,
                    "Vi más de un número (" + numbers + "). ¿Cuánto le pago a " + who + "?", usedModel);
        }
        boolean nonPositive = reading.amounts().stream()
                .anyMatch(token -> !token.ambiguous() && token.value().signum() <= 0);
        if (payable == 0 && nonPositive) {
            return new Decision(Kind.MONTO_INVALIDO, contact, null, null,
                    "El monto tiene que ser mayor que cero.", usedModel);
        }
        return null;
    }

    private static Optional<AiContactDto> contactAwaitingAmount(List<AiHistoryItemDto> history,
                                                                List<AiContactDto> contacts) {
        if (history == null || history.size() < 2) {
            return Optional.empty();
        }
        AiHistoryItemDto last = history.get(history.size() - 1);
        AiHistoryItemDto previous = history.get(history.size() - 2);
        if (!"AGENTE".equals(last.role()) || last.text() == null || !last.text().startsWith(ASK_AMOUNT_PREFIX)
                || !"USUARIO".equals(previous.role())) {
            return Optional.empty();
        }
        Reading earlier = RuleInterpreter.read(previous.text(), contacts);
        return earlier.identifiesOneContact() ? Optional.of(earlier.contact()) : Optional.empty();
    }

    private static String balance(AiMandateDto mandate) {
        if (mandate == null) {
            return "Todavía no tienes reglas de pago. Créalas en «Mis reglas de pago» y luego te ayudo a pagar.";
        }
        return "Hoy todavía puedes pagar " + Money.display(new BigDecimal(mandate.availableLast24h()))
                + " USDC. Los pagos de más de " + Money.display(new BigDecimal(mandate.approvalThreshold()))
                + " USDC te los pregunto antes.";
    }

    private static String names(List<AiContactDto> contacts, String lastJoiner) {
        List<String> names = contacts.stream().limit(MAX_LISTED_CONTACTS).map(AiContactDto::name).toList();
        if (names.size() == 1) {
            return names.get(0);
        }
        String joined = String.join(", ", names.subList(0, names.size() - 1)) + " " + lastJoiner + " "
                + names.get(names.size() - 1);
        return contacts.size() > MAX_LISTED_CONTACTS ? joined + ", entre otros" : joined;
    }

    private static Decision message(Kind kind, String text, boolean usedModel) {
        return new Decision(kind, null, null, null, text, usedModel);
    }
}
