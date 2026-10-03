package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.clients.RuleInterpreter.Intent;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class OpenAiIntentModelTest {

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
    void asksForAClosedJsonLabel() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        OpenAiIntentModel model = modelFor(exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, content("{\\\"intencion\\\":\\\"pagar\\\"}"));
        });

        assertThat(model.classify("Ana 20")).contains(Intent.PAY);
        assertThat(body.get()).contains("\"model\":\"modelo-test\"").contains("\"json_schema\"")
                .contains("\"enum\":[\"pagar\",\"saldo\",\"saludo\",\"otro\"]").contains("Ana 20");
    }

    @Test
    void otherLabelsMapToTheirIntent() throws Exception {
        OpenAiIntentModel model = modelFor(exchange ->
                respond(exchange, 200, content("{\\\"intencion\\\":\\\"otro\\\"}")));
        assertThat(model.classify("Ana me debe 20")).contains(Intent.UNKNOWN);
    }

    @Test
    void labelOutsideTheListIsEmpty() throws Exception {
        OpenAiIntentModel model = modelFor(exchange ->
                respond(exchange, 200, content("{\\\"intencion\\\":\\\"transferir\\\"}")));
        assertThat(model.classify("Ana 20")).isEmpty();
    }

    @Test
    void contentThatIsNotJsonIsEmpty() throws Exception {
        OpenAiIntentModel model = modelFor(exchange -> respond(exchange, 200, content("pagar")));
        assertThat(model.classify("Ana 20")).isEmpty();
    }

    @Test
    void serverErrorIsEmptyInsteadOfFailing() throws Exception {
        OpenAiIntentModel model = modelFor(exchange -> respond(exchange, 500, "{\"error\":\"boom\"}"));
        assertThat(model.classify("Ana 20")).isEmpty();
    }

    @Test
    void unreachableServerIsEmpty() {
        OpenAiIntentModel model = new OpenAiIntentModel("http://127.0.0.1:1", "clave", "modelo-test",
                Duration.ofMillis(300), Duration.ofMillis(300), RestClient.builder(), new ObjectMapper());
        assertThat(model.classify("Ana 20")).isEqualTo(Optional.empty());
    }

    private OpenAiIntentModel modelFor(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.createContext(OpenAiIntentModel.COMPLETIONS_PATH, handler);
        server.start();
        return new OpenAiIntentModel("http://127.0.0.1:" + server.getAddress().getPort(), "clave", "modelo-test",
                Duration.ofSeconds(1), Duration.ofSeconds(2), RestClient.builder(), new ObjectMapper());
    }

    private static String content(String text) {
        return "{\"choices\":[{\"message\":{\"role\":\"assistant\",\"content\":\"" + text + "\"}}]}";
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
