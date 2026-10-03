package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = "app.demo-attack-enabled=true")
class AttackDemoIntegrationTest extends IntegrationTestBase {

    static final String UNKNOWN_ADDRESS = "G" + "C".repeat(55);

    @Test
    void attackAboveOnchainLimitIsBlockedByTheNetwork() throws Exception {
        String userId = userWithMandate();

        String body = attack(userId, UNKNOWN_ADDRESS, "60")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FALLIDO"))
                .andExpect(jsonPath("$.txHash").doesNotExist())
                .andExpect(jsonPath("$.error.code").value("SpendingLimitExceeded"))
                .andExpect(jsonPath("$.error.contractCode").value(3221))
                .andExpect(jsonPath("$.error.stage").value("SIMULACION"))
                .andExpect(jsonPath("$.error.message").value("La red rechazó el pago: supera el tope de gasto del mandato."))
                .andReturn().getResponse().getContentAsString();

        UUID proposalId = UUID.fromString(JsonPath.read(body, "$.proposalId"));
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT origin, status, destination_address, contact_id FROM payment_proposals WHERE id = ?", proposalId);
        assertThat(row.get("origin")).isEqualTo("ATAQUE_DEMO");
        assertThat(row.get("status")).isEqualTo("FALLIDO");
        assertThat(row.get("destination_address")).isEqualTo(UNKNOWN_ADDRESS);
        assertThat(row.get("contact_id")).isNull();
        assertThat(auditCount(proposalId, "ATAQUE_DEMO")).isEqualTo(1);
        assertThat(auditCount(proposalId, "TX_FALLIDA")).isEqualTo(1);
    }

    @Test
    void attackBelowOnchainLimitGoesThrough() throws Exception {
        String userId = userWithMandate();

        attack(userId, UNKNOWN_ADDRESS, "10")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.txHash").exists())
                .andExpect(jsonPath("$.error").doesNotExist());
    }

    @Test
    void attackSkipsBackendLimitsButDoesNotCountAsChatFrequency() throws Exception {
        String userId = userWithMandate();
        // 25 supera el tope por transacción del mandato (20): el backend no lo frena, la red sí lo deja pasar.
        attack(userId, UNKNOWN_ADDRESS, "25")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMADO"));
        for (int i = 0; i < 5; i++) {
            attack(userId, UNKNOWN_ADDRESS, "1").andExpect(status().isOk());
        }

        chat(userId, "Págale 1 USDC a Ana por el logo", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));
    }

    @Test
    void attackWithoutMandateIsConflict() throws Exception {
        String userId = userWithAccount();
        attack(userId, UNKNOWN_ADDRESS, "10")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIN_MANDATO_ACTIVO"));
    }

    @Test
    void attackWithInvalidBodyIsValidationError() throws Exception {
        String userId = userWithMandate();
        attack(userId, "GNOVALIDA", "10")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
        attack(userId, UNKNOWN_ADDRESS, "0")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
        attack(userId, UNKNOWN_ADDRESS, "1,000")
                .andExpect(status().isBadRequest());
    }

    private String userWithMandate() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return userId;
    }

    static ResultActions attack(org.springframework.test.web.servlet.MockMvc mockMvc, String userId, String destination,
                                String amount) throws Exception {
        return mockMvc.perform(post("/api/demo/attack").header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"destinationAddress\":\"" + destination + "\",\"amount\":\"" + amount + "\"}"));
    }

    private ResultActions attack(String userId, String destination, String amount) throws Exception {
        return attack(mockMvc, userId, destination, amount);
    }

    private int auditCount(UUID proposalId, String type) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE proposal_id = ? AND event_type = ?", Integer.class,
                proposalId, type);
        return count == null ? 0 : count;
    }
}
