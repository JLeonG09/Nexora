package com.nexora;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nexora.clients.MockLedger;
import com.nexora.clients.MockSignerClient;
import com.nexora.config.AppProperties;
import com.nexora.config.TestProfileJwtDecoder;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Base de los tests de integración: base nexora_test limpia antes de cada test. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    protected static final String VALID_C_ADDRESS = "C" + "A".repeat(55);
    protected static final String OTHER_C_ADDRESS = "C" + "B".repeat(55);
    protected static final String ANA_ADDRESS = "G" + "A".repeat(55);
    protected static final String JUAN_ADDRESS = "G" + "B".repeat(55);
    protected static final String CREATE_TX_HASH = "4cc555049075d5acbdb50b9fff9e02ea163214f046da6d05ebcc597ab190f4ce";

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @Autowired
    protected MockSignerClient mockSignerClient;

    @Autowired
    protected MockLedger mockLedger;

    @Autowired
    private AppProperties appProperties;

    private final Map<String, String> tokens = new HashMap<>();

    @BeforeEach
    void cleanDatabase() {
        tokens.clear();
        // TRUNCATE no dispara el trigger de solo inserción de audit_events.
        jdbcTemplate.execute("TRUNCATE TABLE audit_events, alerts, approvals, chat_messages, payment_proposals, "
                + "contacts, mandates, accounts, users CASCADE");
        // El firmante simulado es un singleton: sin esto el gasto on-chain se acumula entre tests.
        mockSignerClient.clear();
        mockLedger.clear();
    }

    protected String createUser(String name, String email) throws Exception {
        String did = "did:privy:" + UUID.randomUUID().toString().replace("-", "");
        String token = TestProfileJwtDecoder.token(did, appProperties.privyAppId(), email);
        String body = mockMvc.perform(post("/api/users").header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"" + name + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String userId = JsonPath.read(body, "$.id");
        tokens.put(userId, token);
        return userId;
    }

    /** Authorization del usuario creado con {@link #createUser}. */
    protected String bearer(String userId) {
        String token = tokens.get(userId);
        if (token == null) {
            throw new IllegalStateException("No hay access token para " + userId);
        }
        return "Bearer " + token;
    }

    /** Token válido de un DID que todavía no tiene fila. Sirve para probar el alta. */
    protected String freshBearer() {
        return "Bearer " + token("did:privy:" + UUID.randomUUID().toString().replace("-", ""), null);
    }

    protected String token(String did, String email) {
        return TestProfileJwtDecoder.token(did, appProperties.privyAppId(), email);
    }

    protected void registerAccount(String userId, String address) throws Exception {
        mockMvc.perform(post("/api/accounts").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smartAccountAddress\":\"" + address + "\"}"))
                .andExpect(status().isCreated());
    }

    /** Usuario con smart account registrado. */
    protected String userWithAccount() throws Exception {
        String userId = createUser("Josué", null);
        registerAccount(userId, VALID_C_ADDRESS);
        return userId;
    }

    protected String createContact(String userId, String name, String address) throws Exception {
        String body = mockMvc.perform(post("/api/contacts").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"stellarAddress\":\"" + address + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    protected String currentPublicKeyHex(String userId) throws Exception {
        String body = mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.publicKeyHex");
    }

    protected ResultActions postMandate(String userId, String daily, String perTx, String threshold, Instant expiresAt,
                                        int keyVersion, String publicKeyHex) throws Exception {
        String body = "{\"dailyLimit\":\"" + daily + "\",\"perTxLimit\":\"" + perTx + "\",\"approvalThreshold\":\""
                + threshold + "\",\"asset\":\"USDC\",\"expiresAt\":\"" + expiresAt + "\",\"contextRuleId\":1,"
                + "\"validUntilLedger\":1234567,\"createTxHash\":\"" + CREATE_TX_HASH + "\",\"keyVersion\":"
                + keyVersion + ",\"agentPublicKeyHex\":\"" + publicKeyHex + "\"}";
        return mockMvc.perform(post("/api/mandates").header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** Mandato 50 / 20 / 15 por 7 días con la llave actual. Devuelve su id. */
    protected String createMandate(String userId, int keyVersion) throws Exception {
        String body = postMandate(userId, "50", "20", "15", Instant.now().plus(7, ChronoUnit.DAYS), keyVersion,
                currentPublicKeyHex(userId))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    protected ResultActions chat(String userId, String message, String conversationId) throws Exception {
        return chat(userId, message, conversationId, null);
    }

    protected ResultActions chat(String userId, String message, String conversationId, String clientMessageId)
            throws Exception {
        String conversation = conversationId == null ? "" : ",\"conversationId\":\"" + conversationId + "\"";
        String client = clientMessageId == null ? "" : ",\"clientMessageId\":\"" + clientMessageId + "\"";
        return mockMvc.perform(post("/api/chat").header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + message + "\"" + conversation + client + "}"));
    }

    /** Envía un pedido de pago por el chat y devuelve el id de la propuesta creada. */
    protected String chatProposalId(String userId, String message) throws Exception {
        String body = chat(userId, message, null)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.proposal.id");
    }
}
