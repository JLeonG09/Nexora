package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nexora.services.ReconciliationJob;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = "app.demo-attack-enabled=true")
class AlertFlowIntegrationTest extends IntegrationTestBase {

    private static final String UNKNOWN_ADDRESS = "G" + "C".repeat(55);

    @Autowired
    private ReconciliationJob reconciliationJob;

    @Test
    void listShowsPendingAlertWithMessage() throws Exception {
        String userId = readyUser();
        String alertId = stolenKeyAlert(userId);

        mockMvc.perform(get("/api/alerts?status=PENDIENTE").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(alertId))
                .andExpect(jsonPath("$.items[0].status").value("PENDIENTE"))
                .andExpect(jsonPath("$.items[0].amount").value("10.0000000"))
                .andExpect(jsonPath("$.items[0].asset").value("USDC"))
                .andExpect(jsonPath("$.items[0].destinationAddress").value(UNKNOWN_ADDRESS))
                .andExpect(jsonPath("$.items[0].explorerUrl").value(startsWith("https://stellar.expert/explorer/testnet/tx/")))
                .andExpect(jsonPath("$.items[0].mandateId").exists())
                .andExpect(jsonPath("$.items[0].message")
                        .value("Detectamos un pago de 10.00 USDC a GCCCC…CCCCC que no hizo el agente. ¿Fuiste tú?"))
                .andExpect(jsonPath("$.items[0].decidedAt").doesNotExist())
                .andExpect(jsonPath("$.totalItems").value(1));
        mockMvc.perform(get("/api/alerts?status=REPORTADA").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void confirmMarksRecognized() throws Exception {
        String userId = readyUser();
        String alertId = stolenKeyAlert(userId);

        decide(userId, alertId, "confirm")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECONOCIDA"))
                .andExpect(jsonPath("$.decidedAt").exists());

        assertThat(auditCount("ALERTA_CONFIRMADA")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM mandates", String.class)).isEqualTo("ACTIVO");
        assertThat(keyVersion(userId)).isEqualTo(1);
    }

    @Test
    void reportRevokesMandateRejectsPendingAndRotatesKey() throws Exception {
        String userId = readyUser();
        String mandateId = jdbcTemplate.queryForObject("SELECT id FROM mandates", UUID.class).toString();
        String pending = JsonPath.read(chat(userId, "Págale 18 USDC a Ana por la web", null)
                .andReturn().getResponse().getContentAsString(), "$.proposal.id");
        String oldKey = currentPublicKeyHex(userId);
        String alertId = stolenKeyAlert(userId);

        decide(userId, alertId, "report")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(alertId))
                .andExpect(jsonPath("$.status").value("REPORTADA"))
                .andExpect(jsonPath("$.decidedAt").exists())
                .andExpect(jsonPath("$.mandate.id").value(mandateId))
                .andExpect(jsonPath("$.mandate.status").value("REVOCADO"))
                .andExpect(jsonPath("$.mandate.revokeReason").value("LLAVE_COMPROMETIDA"))
                .andExpect(jsonPath("$.mandate.contextRuleId").value(1))
                .andExpect(jsonPath("$.mandate.revokeTxHash").doesNotExist())
                .andExpect(jsonPath("$.newKeyVersion").value(2))
                .andExpect(jsonPath("$.nextStep").value(startsWith("Revoca ahora la regla on-chain")));

        assertThat(jdbcTemplate.queryForObject("SELECT status || ':' || rejection_code FROM payment_proposals WHERE id = ?",
                String.class, UUID.fromString(pending))).isEqualTo("RECHAZADO:MANDATO_REVOCADO");
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM approvals", String.class)).isEqualTo("RECHAZADA");
        assertThat(keyVersion(userId)).isEqualTo(2);
        assertThat(currentPublicKeyHex(userId)).isNotEqualTo(oldKey);
        assertThat(auditCount("LLAVE_COMPROMETIDA")).isEqualTo(1);
        assertThat(auditCount("LLAVE_ROTADA")).isEqualTo(1);
        assertThat(auditCount("MANDATO_REVOCADO")).isEqualTo(1);

        chat(userId, "Págale 5 USDC a Ana por el logo", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SIN_MANDATO_ACTIVO"));
    }

    @Test
    void reportWithoutActiveMandateOnlyMarksReported() throws Exception {
        String userId = userWithAccount();
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, ReconciliationIntegrationTest.units("3"));
        reconciliationJob.reconcileAll();
        String alertId = jdbcTemplate.queryForObject("SELECT id FROM alerts", UUID.class).toString();

        decide(userId, alertId, "report")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REPORTADA"))
                .andExpect(jsonPath("$.mandate").doesNotExist())
                .andExpect(jsonPath("$.newKeyVersion").value(1));

        assertThat(auditCount("LLAVE_COMPROMETIDA")).isEqualTo(1);
        assertThat(auditCount("LLAVE_ROTADA")).isZero();
    }

    @Test
    void decidingTwiceIsInvalidState() throws Exception {
        String userId = readyUser();
        String alertId = stolenKeyAlert(userId);
        decide(userId, alertId, "confirm").andExpect(status().isOk());

        decide(userId, alertId, "report")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ESTADO_INVALIDO"));
        decide(userId, alertId, "confirm")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ESTADO_INVALIDO"));
    }

    @Test
    void anotherUsersAlertIsNotFound() throws Exception {
        String userId = readyUser();
        String alertId = stolenKeyAlert(userId);
        String other = createUser("Otra", null);

        decide(other, alertId, "confirm")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
        decide(other, alertId, "report").andExpect(status().isNotFound());
        mockMvc.perform(get("/api/alerts").header("Authorization", bearer(other)))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    private String readyUser() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return userId;
    }

    /** Demo "llave robada": ataque de 10 USDC (bajo el tope on-chain) y conciliación. */
    private String stolenKeyAlert(String userId) throws Exception {
        AttackDemoIntegrationTest.attack(mockMvc, bearer(userId), UNKNOWN_ADDRESS, "10")
                .andExpect(jsonPath("$.status").value("CONFIRMADO"));
        reconciliationJob.reconcileAll();
        return jdbcTemplate.queryForObject("SELECT id FROM alerts", UUID.class).toString();
    }

    private ResultActions decide(String userId, String alertId, String action) throws Exception {
        return mockMvc.perform(post("/api/alerts/" + alertId + "/" + action).header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    private int keyVersion(String userId) {
        Integer version = jdbcTemplate.queryForObject("SELECT agent_key_version FROM accounts WHERE user_id = ?",
                Integer.class, UUID.fromString(userId));
        return version == null ? 0 : version;
    }

    private int auditCount(String type) {
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM audit_events WHERE event_type = ?",
                Integer.class, type);
        return count == null ? 0 : count;
    }
}
