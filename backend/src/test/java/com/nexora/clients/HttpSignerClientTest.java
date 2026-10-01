package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nexora.config.AppProperties;
import com.nexora.dtos.signer.SignRequest;
import com.nexora.dtos.signer.SignResponse;
import com.nexora.dtos.signer.SignerAgentKeyDto;
import com.nexora.exceptions.SignerRejectedException;
import com.nexora.exceptions.SignerUnavailableException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;
import org.springframework.web.client.RestClient;

class HttpSignerClientTest {

    private static final String SERVICE_KEY = "clave-firmante-prueba";
    private static final int READ_TIMEOUT_MS = 500;
    private static final String C_ADDRESS = "C" + "A".repeat(55);
    private static final String TX_HASH = "7786da27fb36b3091c92994a911234ac09f2a4b2e77b2839c0e9fbed99bca446";

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
    void signAndSubmitParsesConfirmedAndSendsContractFields() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        SignRequest request = request();
        HttpSignerClient client = clientFor(exchange -> {
            path.set(exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath());
            key.set(exchange.getRequestHeaders().getFirst("X-Service-Key"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            respond(exchange, 200, """
                    {"proposalId":"%s","status":"CONFIRMADO","txHash":"%s","ledger":1234600,
                     "submittedAt":"2026-09-28T16:15:02Z","confirmedAt":"2026-09-28T16:15:06Z","error":null}
                    """.formatted(request.proposalId(), TX_HASH));
        });

        SignResponse response = client.signAndSubmit(request);

        assertThat(path.get()).isEqualTo("POST /sign-and-submit");
        assertThat(key.get()).isEqualTo(SERVICE_KEY);
        assertThat(body.get())
                .contains("\"keyVersion\":2")
                .contains("\"agentPublicKeyHex\":\"" + "ab".repeat(32) + "\"")
                .contains("\"amountUnits\":\"150000000\"")
                .contains("\"contextRuleId\":1");
        assertThat(response.status()).isEqualTo(SignResponse.CONFIRMADO);
        assertThat(response.txHash()).isEqualTo(TX_HASH);
        assertThat(response.ledger()).isEqualTo(1234600L);
        assertThat(response.confirmedAt()).isNotNull();
    }

    @Test
    void signAndSubmitParsesFailedWithContractError() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 200, """
                {"proposalId":"%s","status":"FALLIDO","txHash":null,"ledger":null,"submittedAt":null,
                 "confirmedAt":null,"error":{"code":"SpendingLimitExceeded","contractCode":3221,"stage":"SIMULACION",
                 "message":"La red rechazó el pago: supera el tope de gasto del mandato.",
                 "raw":"HostError: Error(Contract, #3221)"}}
                """.formatted(UUID.randomUUID())));

        SignResponse response = client.signAndSubmit(request());

        assertThat(response.status()).isEqualTo(SignResponse.FALLIDO);
        assertThat(response.error().code()).isEqualTo("SpendingLimitExceeded");
        assertThat(response.error().contractCode()).isEqualTo(3221);
        assertThat(response.error().stage()).isEqualTo("SIMULACION");
    }

    @Test
    void keyMismatchIsRejectedWithItsCode() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 400,
                "{\"code\":\"LLAVE_NO_COINCIDE\",\"message\":\"La llave derivada no es la del mandato.\"}"));

        assertThatThrownBy(() -> client.signAndSubmit(request()))
                .isInstanceOf(SignerRejectedException.class)
                .satisfies(e -> assertThat(((SignerRejectedException) e).code()).isEqualTo("LLAVE_NO_COINCIDE"))
                .hasMessageContaining("no es la del mandato");
    }

    @Test
    void badRequestWithoutBodyIsRejectedAsInvalidRequest() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 400, "no json"));

        assertThatThrownBy(() -> client.signAndSubmit(request()))
                .isInstanceOf(SignerRejectedException.class)
                .satisfies(e -> assertThat(((SignerRejectedException) e).code()).isEqualTo("SOLICITUD_INVALIDA"));
    }

    @Test
    void unavailableRpcIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 503,
                "{\"code\":\"RPC_NO_DISPONIBLE\",\"message\":\"RPC caído\"}"));
        assertThatThrownBy(() -> client.signAndSubmit(request())).isInstanceOf(SignerUnavailableException.class);
    }

    @Test
    void inProgressIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 409,
                "{\"code\":\"EN_PROCESO\",\"message\":\"En curso\"}"));
        assertThatThrownBy(() -> client.signAndSubmit(request())).isInstanceOf(SignerUnavailableException.class);
    }

    @Test
    void invalidJsonIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 200, "{esto no es json"));
        assertThatThrownBy(() -> client.signAndSubmit(request())).isInstanceOf(SignerUnavailableException.class);
    }

    @Test
    void timeoutIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> {
            try {
                Thread.sleep(READ_TIMEOUT_MS * 4L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            respond(exchange, 200, "{}");
        });
        assertThatThrownBy(() -> client.signAndSubmit(request())).isInstanceOf(SignerUnavailableException.class);
    }

    @Test
    void getTransactionNotFoundIsEmpty() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        UUID proposalId = UUID.randomUUID();
        HttpSignerClient client = clientFor(exchange -> {
            path.set(exchange.getRequestURI().getPath());
            respond(exchange, 404, "{\"code\":\"NO_ENCONTRADA\"}");
        });

        assertThat(client.getTransaction(proposalId)).isEmpty();
        assertThat(path.get()).isEqualTo("/transactions/" + proposalId);
    }

    @Test
    void getTransactionReturnsSignerState() throws Exception {
        UUID proposalId = UUID.randomUUID();
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 200, """
                {"proposalId":"%s","status":"CONFIRMADO","txHash":"%s","ledger":1234601,
                 "submittedAt":"2026-09-28T16:15:02Z","confirmedAt":"2026-09-28T16:15:06Z","error":null}
                """.formatted(proposalId, TX_HASH)));

        Optional<SignResponse> response = client.getTransaction(proposalId);

        assertThat(response).isPresent();
        assertThat(response.get().status()).isEqualTo(SignResponse.CONFIRMADO);
        assertThat(response.get().ledger()).isEqualTo(1234601L);
    }

    @Test
    void getTransactionServerErrorIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 500, "{}"));
        assertThatThrownBy(() -> client.getTransaction(UUID.randomUUID()))
                .isInstanceOf(SignerUnavailableException.class);
    }

    @Test
    void getAgentKeySendsAddressAndVersion() throws Exception {
        AtomicReference<String> uri = new AtomicReference<>();
        HttpSignerClient client = clientFor(exchange -> {
            uri.set(exchange.getRequestURI().toString());
            respond(exchange, 200, """
                    {"smartAccountAddress":"%s","keyVersion":3,"publicKeyHex":"%s","address":"GAGENTE",
                     "ed25519VerifierAddress":"CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4"}
                    """.formatted(C_ADDRESS, "cd".repeat(32)));
        });

        SignerAgentKeyDto key = client.getAgentKey(C_ADDRESS, 3);

        assertThat(uri.get()).isEqualTo("/agent-key?smartAccountAddress=" + C_ADDRESS + "&keyVersion=3");
        assertThat(key.keyVersion()).isEqualTo(3);
        assertThat(key.publicKeyHex()).isEqualTo("cd".repeat(32));
    }

    @Test
    void getAgentKeyErrorIsSignerUnavailable() throws Exception {
        HttpSignerClient client = clientFor(exchange -> respond(exchange, 400,
                "{\"code\":\"SOLICITUD_INVALIDA\",\"message\":\"dirección inválida\"}"));
        assertThatThrownBy(() -> client.getAgentKey(C_ADDRESS, 1)).isInstanceOf(SignerUnavailableException.class);
    }

    private HttpSignerClient clientFor(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.createContext("/", handler);
        server.start();
        String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
        AppProperties properties = new AppProperties(List.of(), "", "", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, "", null,
                new AppProperties.Signer("http", baseUrl, SERVICE_KEY, 1000, READ_TIMEOUT_MS,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                null, null);
        return new HttpSignerClient(properties, RestClient.builder(), Jackson2ObjectMapperBuilder.json().build());
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static SignRequest request() {
        return new SignRequest(UUID.randomUUID(), C_ADDRESS, 1, 2, "ab".repeat(32), "G" + "A".repeat(55),
                "15.0000000", "150000000", "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "logo");
    }
}
