package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiContactDto;
import com.nexora.dtos.ai.AiHistoryItemDto;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.dtos.ai.AiMandateDto;
import com.nexora.exceptions.AiUnavailableException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class LocalAiClientTest {

    private static final UUID ANA = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID CARLOS = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final List<AiContactDto> CONTACTS = List.of(new AiContactDto(ANA, "Ana"),
            new AiContactDto(CARLOS, "Carlos Pérez"));

    private HttpServer server;
    private ExecutorService executor;

    @AfterEach
    void stopServer() {
        if (server != null) {
            server.stop(0);
        }
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    void toolCallBecomesProposePaymentAction() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> auth = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        LocalAiClient client = clientFor(exchange -> {
            path.set(exchange.getRequestURI().getPath());
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, toolCall("\"{\\\"contactId\\\":\\\"" + ANA + "\\\",\\\"amount\\\":\\\"15\\\","
                    + "\\\"memo\\\":\\\"el café\\\"}\""));
        });

        AiInterpretResponse response = client.interpret(request("Págale 15 USDC a Ana por el café"));

        assertThat(path.get()).isEqualTo("/v1/chat/completions");
        assertThat(auth.get()).isEqualTo("Bearer clave");
        assertThat(body.get()).contains("\"model\":\"modelo-test\"").contains("\"propose_payment\"")
                .contains(ANA.toString()).contains("\"role\":\"assistant\"");
        assertThat(response.type()).isEqualTo(AiInterpretResponse.TYPE_ACTION);
        assertThat(response.action().tool()).isEqualTo("propose_payment");
        assertThat(response.action().arguments())
                .containsEntry("contactId", ANA.toString())
                .containsEntry("contactName", "Ana")
                .containsEntry("amount", "15")
                .containsEntry("asset", "USDC")
                .containsEntry("memo", "el café");
        assertThat(response.confidence()).isEqualTo(LocalAiClient.GROUNDED_CONFIDENCE);
        assertThat(response.ungroundedFields()).isEmpty();
        assertThat(response.model()).isEqualTo("modelo-servido");
    }

    @Test
    void argumentsAsObjectAndContactByNameAreAccepted() throws Exception {
        LocalAiClient client = clientFor(exchange ->
                respond(exchange, 200, toolCall("{\"contactId\":\"carlos pérez\",\"amount\":2.5}")));

        AiInterpretResponse response = client.interpret(request("Mándale 2.5 a Carlos Pérez"));

        assertThat(response.action().arguments())
                .containsEntry("contactId", CARLOS.toString())
                .containsEntry("amount", "2.5");
        assertThat(response.ungroundedFields()).isEmpty();
    }

    @Test
    void contactNotNamedInMessageIsUngrounded() throws Exception {
        LocalAiClient client = clientFor(exchange ->
                respond(exchange, 200, toolCall("{\"contactId\":\"" + CARLOS + "\",\"amount\":\"20\"}")));

        AiInterpretResponse response = client.interpret(request("Paga 20 USDC a mi primo"));

        assertThat(response.ungroundedFields()).containsExactly("contactId");
        assertThat(response.confidence()).isEqualTo(LocalAiClient.UNGROUNDED_CONFIDENCE);
    }

    @Test
    void unknownContactIsPassedAsNameForTheValidatorToReject() throws Exception {
        LocalAiClient client = clientFor(exchange ->
                respond(exchange, 200, toolCall("{\"contactId\":\"" + UUID.randomUUID() + "\",\"amount\":\"5\"}")));

        AiInterpretResponse response = client.interpret(request("Paga 5 a Ana"));

        assertThat(response.action().arguments()).doesNotContainKey("contactId").containsKey("contactName");
        assertThat(response.ungroundedFields()).containsExactly("contactId");
    }

    @Test
    void plainTextBecomesMessage() throws Exception {
        LocalAiClient client = clientFor(exchange -> respond(exchange, 200, """
                {"model":"m","choices":[{"message":{"role":"assistant","content":"¿Cuánto le quieres pagar a Ana?"}}]}
                """));

        AiInterpretResponse response = client.interpret(request("Págale a Ana"));

        assertThat(response.type()).isEqualTo(AiInterpretResponse.TYPE_MESSAGE);
        assertThat(response.message()).isEqualTo("¿Cuánto le quieres pagar a Ana?");
        assertThat(response.action()).isNull();
    }

    @Test
    void withoutContactsNoToolIsOffered() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        LocalAiClient client = clientFor(exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, """
                    {"choices":[{"message":{"role":"assistant","content":""}}]}
                    """);
        });

        AiInterpretResponse response = client.interpret(new AiInterpretRequest(UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "Hola", "es-CR", Instant.now(), null, List.of(), List.of(),
                List.of("propose_payment")));

        assertThat(body.get()).doesNotContain("\"tools\"");
        assertThat(response.message()).isEqualTo(LocalAiClient.FALLBACK_REPLY);
    }

    @Test
    void serverErrorIsAiUnavailable() throws Exception {
        LocalAiClient client = clientFor(exchange -> respond(exchange, 500, "{\"error\":\"boom\"}"));
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    @Test
    void missingChoicesIsAiUnavailable() throws Exception {
        LocalAiClient client = clientFor(exchange -> respond(exchange, 200, "{\"model\":\"m\"}"));
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    @Test
    void systemPromptListsContactsAndLimits() {
        String prompt = LocalAiClient.systemPrompt(request("Hola"));
        assertThat(prompt).contains(ANA + ": Ana").contains("Le quedan 40 USDC").contains("Por encima de 10 USDC");
    }

    private LocalAiClient clientFor(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.createContext(LocalAiClient.COMPLETIONS_PATH, handler);
        server.start();
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        AppProperties properties = new AppProperties(List.of(), "", "", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, "",
                new AppProperties.Ai("local", baseUrl, "clave", 1000, 2000, new BigDecimal("0.7")),
                null, null, null);
        return new LocalAiClient(properties, RestClient.builder(), new ObjectMapper(), "modelo-test");
    }

    private static String toolCall(String arguments) {
        return """
                {"model":"modelo-servido","choices":[{"message":{"role":"assistant","content":null,
                 "tool_calls":[{"id":"1","type":"function","function":{"name":"propose_payment","arguments":%s}}]}}]}
                """.formatted(arguments);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static AiInterpretRequest request(String message) {
        AiMandateDto mandate = new AiMandateDto("ACTIVO", "USDC", "45", "40", "25", "10", Instant.now());
        return new AiInterpretRequest(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), message, "es-CR",
                Instant.now(), mandate, CONTACTS, List.of(new AiHistoryItemDto("AGENTE", "Hola, ¿en qué te ayudo?")),
                List.of("propose_payment"));
    }
}
