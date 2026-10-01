package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
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

class HttpAiClientTest {

    private static final String SERVICE_KEY = "clave-de-prueba";
    private static final int READ_TIMEOUT_MS = 500;

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
    void parsesActionAndSendsServiceKey() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> method = new AtomicReference<>();
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        HttpAiClient client = clientFor(exchange -> {
            path.set(exchange.getRequestURI().getPath());
            method.set(exchange.getRequestMethod());
            key.set(exchange.getRequestHeaders().getFirst("X-Service-Key"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, """
                    {"requestId":"%s","type":"action",
                     "action":{"tool":"propose_payment","arguments":{"contactName":"Ana","amount":"15","asset":"USDC"}},
                     "message":"Voy a pagarle 15 USDC a Ana.","confidence":0.93,"explanation":"ok",
                     "ungroundedFields":[],"model":"modelo-x"}
                    """.formatted(UUID.randomUUID()));
        });

        AiInterpretResponse response = client.interpret(request("Págale 15 USDC a Ana"));

        assertThat(method.get()).isEqualTo("POST");
        assertThat(path.get()).isEqualTo("/agent/interpret");
        assertThat(key.get()).isEqualTo(SERVICE_KEY);
        assertThat(body.get()).contains("\"message\":\"Págale 15 USDC a Ana\"").contains("\"tools\":[\"propose_payment\"]");
        assertThat(response.type()).isEqualTo("action");
        assertThat(response.action().tool()).isEqualTo("propose_payment");
        assertThat(response.action().arguments()).containsEntry("amount", "15").containsEntry("contactName", "Ana");
        assertThat(response.confidence()).isEqualTo(0.93);
        assertThat(response.model()).isEqualTo("modelo-x");
    }

    @Test
    void serverErrorIsAiUnavailable() throws Exception {
        HttpAiClient client = clientFor(exchange -> respond(exchange, 500, "{\"error\":\"boom\"}"));
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    @Test
    void clientErrorIsAiUnavailable() throws Exception {
        HttpAiClient client = clientFor(exchange -> respond(exchange, 401, "{\"error\":\"clave\"}"));
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    @Test
    void invalidJsonIsAiUnavailable() throws Exception {
        HttpAiClient client = clientFor(exchange -> respond(exchange, 200, "{esto no es json"));
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    @Test
    void timeoutIsAiUnavailable() throws Exception {
        HttpAiClient client = clientFor(exchange -> {
            try {
                Thread.sleep(READ_TIMEOUT_MS * 4L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            respond(exchange, 200, "{}");
        });
        assertThatThrownBy(() -> client.interpret(request("Hola"))).isInstanceOf(AiUnavailableException.class);
    }

    private HttpAiClient clientFor(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.createContext("/agent/interpret", handler);
        server.start();
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        AppProperties properties = new AppProperties(List.of(), "", "", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, "",
                new AppProperties.Ai("http", baseUrl, SERVICE_KEY, 1000, READ_TIMEOUT_MS, new BigDecimal("0.7")),
                null, null, null);
        return new HttpAiClient(properties, RestClient.builder());
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
        return new AiInterpretRequest(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), message, "es-CR",
                Instant.now(), null, List.of(), List.of(), List.of("propose_payment"));
    }
}
