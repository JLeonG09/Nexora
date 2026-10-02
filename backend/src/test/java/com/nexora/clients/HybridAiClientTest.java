package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.DynamicTest.dynamicTest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.clients.HybridAiClient.Decision;
import com.nexora.clients.HybridAiClient.Kind;
import com.nexora.clients.RuleInterpreter.Intent;
import com.nexora.dtos.ai.AiContactDto;
import com.nexora.dtos.ai.AiHistoryItemDto;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.dtos.ai.AiMandateDto;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;

class HybridAiClientTest {

    private static final List<AiContactDto> CONTACTS = List.of(
            new AiContactDto(UUID.randomUUID(), "Ana"),
            new AiContactDto(UUID.randomUUID(), "Carlos Pérez"),
            new AiContactDto(UUID.randomUUID(), "Carlos Mora"),
            new AiContactDto(UUID.randomUUID(), "Mamá"),
            new AiContactDto(UUID.randomUUID(), "Doña Rosa"));
    private static final Map<String, Intent> LABELS = Map.of("pagar", Intent.PAY, "saldo", Intent.BALANCE,
            "saludo", Intent.GREETING, "otro", Intent.UNKNOWN);

    record Phrase(String text, String expected, String modelLabel) {
    }

    @TestFactory
    Stream<DynamicTest> phrases() throws IOException {
        return loadPhrases().stream().map(phrase -> dynamicTest(phrase.text(), () -> {
            AtomicInteger modelCalls = new AtomicInteger();
            IntentModel model = message -> {
                modelCalls.incrementAndGet();
                return Optional.ofNullable(LABELS.get(phrase.modelLabel()));
            };
            Decision decision = new HybridAiClient(model, "modelo-test").decide(request(phrase.text(), List.of()));

            assertThat(describe(decision)).isEqualTo(phrase.expected());
            assertThat(modelCalls.get()).as("consultas al modelo").isEqualTo(phrase.modelLabel() == null ? 0 : 1);
        }));
    }

    @Test
    void rulesAloneResolveMostPhrases() throws IOException {
        List<Phrase> phrases = loadPhrases();
        long rulesOnly = phrases.stream().filter(phrase -> phrase.modelLabel() == null).count();
        System.out.printf("Agente híbrido: %d de %d frases sin modelo%n", rulesOnly, phrases.size());
        assertThat(rulesOnly * 100 / phrases.size()).isGreaterThanOrEqualTo(80);
    }

    @Test
    void amountAloneAnswersThePendingQuestion() {
        HybridAiClient client = new HybridAiClient(IntentModel.NONE, "");
        List<AiHistoryItemDto> history = List.of(
                new AiHistoryItemDto("USUARIO", "Págale a Ana"),
                new AiHistoryItemDto("AGENTE", HybridAiClient.ASK_AMOUNT_PREFIX + "Ana? Escríbelo en números."));

        assertThat(describe(client.decide(request("15", history)))).isEqualTo("PAGO|Ana|15|");
    }

    @Test
    void amountAloneWithoutPendingQuestionDoesNotPay() {
        HybridAiClient client = new HybridAiClient(IntentModel.NONE, "");
        List<AiHistoryItemDto> history = List.of(
                new AiHistoryItemDto("USUARIO", "Págale 10 a Ana"),
                new AiHistoryItemDto("AGENTE", "Listo, se envió el pago."));

        assertThat(client.decide(request("15", history)).kind()).isEqualTo(Kind.NO_ENTENDI);
    }

    @Test
    void withoutModelUnknownPhrasesGetHelp() {
        Decision decision = new HybridAiClient(IntentModel.NONE, "").decide(request("Ana 20", List.of()));
        assertThat(decision.kind()).isEqualTo(Kind.NO_ENTENDI);
        assertThat(decision.usedModel()).isFalse();
    }

    @Test
    void greetingIsAnsweredWithTheSameGreeting() {
        HybridAiClient client = new HybridAiClient(IntentModel.NONE, "");
        assertThat(client.decide(request("buenas noches", List.of())).text()).startsWith("¡Buenas noches!");
        assertThat(client.decide(request("Hola, ¿cómo estás?", List.of())).text())
                .startsWith("¡Hola! ¡Muy bien");
        assertThat(client.decide(request("gracias", List.of())).text()).doesNotStartWith("¡Hola");
    }

    @Test
    void paymentBecomesProposePaymentAction() {
        AiInterpretResponse response = new HybridAiClient(IntentModel.NONE, "")
                .interpret(request("Págale 15 a Ana por el café", List.of()));

        assertThat(response.type()).isEqualTo(AiInterpretResponse.TYPE_ACTION);
        assertThat(response.action().tool()).isEqualTo("propose_payment");
        assertThat(response.action().arguments())
                .containsEntry("contactId", CONTACTS.get(0).id().toString())
                .containsEntry("contactName", "Ana")
                .containsEntry("amount", "15")
                .containsEntry("asset", "USDC")
                .containsEntry("memo", "el café");
        assertThat(response.confidence()).isEqualTo(HybridAiClient.RULES_CONFIDENCE);
        assertThat(response.ungroundedFields()).isEmpty();
        assertThat(response.model()).isEqualTo("reglas");
    }

    @Test
    void balanceUsesTheMandate() {
        AiInterpretResponse response = new HybridAiClient(IntentModel.NONE, "")
                .interpret(request("¿Cuánto me queda?", List.of()));
        assertThat(response.message()).contains("40").contains("10");
    }

    /** Mide el modelo real: AGENT_EVAL_URL=http://localhost:11434 AGENT_EVAL_MODEL=qwen2.5:0.5b. */
    @Test
    @EnabledIfEnvironmentVariable(named = "AGENT_EVAL_URL", matches = ".+")
    void realModelClassifiesThePhrasesThatNeedIt() throws IOException {
        IntentModel model = new OpenAiIntentModel(System.getenv("AGENT_EVAL_URL"), "eval",
                Optional.ofNullable(System.getenv("AGENT_EVAL_MODEL")).orElse("qwen2.5:0.5b"),
                Duration.ofSeconds(5), Duration.ofSeconds(60), RestClient.builder(), new ObjectMapper());
        List<Phrase> needModel = loadPhrases().stream().filter(phrase -> phrase.modelLabel() != null).toList();
        int correct = 0;
        for (Phrase phrase : needModel) {
            long start = System.nanoTime();
            Optional<Intent> intent = model.classify(phrase.text());
            boolean ok = intent.equals(Optional.of(LABELS.get(phrase.modelLabel())));
            correct += ok ? 1 : 0;
            System.out.printf("%s %-35s esperado=%-6s modelo=%-8s %d ms%n", ok ? "ok " : "MAL", phrase.text(),
                    phrase.modelLabel(), intent.map(Enum::name).orElse("-"), (System.nanoTime() - start) / 1_000_000);
        }
        System.out.printf("Modelo: %d de %d correctas%n", correct, needModel.size());
        assertThat(correct * 100 / needModel.size()).isGreaterThanOrEqualTo(70);
    }

    private static String describe(Decision decision) {
        return String.join("|", decision.kind().name(),
                decision.contact() == null ? "" : decision.contact().name(),
                decision.amount() == null ? "" : decision.amount(),
                decision.memo() == null ? "" : decision.memo());
    }

    private static AiInterpretRequest request(String message, List<AiHistoryItemDto> history) {
        AiMandateDto mandate = new AiMandateDto("ACTIVO", "USDC", "45", "40", "25", "10", Instant.now());
        return new AiInterpretRequest(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), message, "es-CR",
                Instant.now(), mandate, CONTACTS, history, List.of("propose_payment"));
    }

    private static List<Phrase> loadPhrases() throws IOException {
        try (InputStream in = HybridAiClientTest.class.getResourceAsStream("/agente/frases.txt")) {
            assertThat(in).as("agente/frases.txt").isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .map(String::trim)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .map(line -> {
                        String[] columns = line.split("\\s+\\|\\|\\s+", 3);
                        return new Phrase(columns[0], columns[1], columns.length > 2 ? columns[2] : null);
                    })
                    .toList();
        }
    }
}
