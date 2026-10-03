package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** Complementa MandateIntegrationTest: lo que viaja al firmante sale del mandato, no de la cuenta. */
class KeyRotationIntegrationTest extends IntegrationTestBase {

    @Test
    void paymentSendsKeyVersionAndPublicKeyOfTheMandate() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        String firstMandate = createMandate(userId, 1);
        mockMvc.perform(post("/api/mandates/" + firstMandate + "/revoke").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        String keyV2 = currentPublicKeyHex(userId);
        createMandate(userId, 2);

        String proposalId = chatProposalId(userId, "Págale 10 USDC a Ana por el logo");

        assertThat(jdbcTemplate.queryForObject("SELECT (data->>'keyVersion') FROM audit_events "
                + "WHERE proposal_id = ? AND event_type = 'FIRMA_SOLICITADA'", String.class,
                UUID.fromString(proposalId))).isEqualTo("2");
        assertThat(jdbcTemplate.queryForObject("SELECT (data->>'agentPublicKeyHex') FROM audit_events "
                + "WHERE proposal_id = ? AND event_type = 'FIRMA_SOLICITADA'", String.class,
                UUID.fromString(proposalId))).isEqualTo(keyV2);
        chat(userId, "Págale 1 USDC a Ana por otro", null)
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));
    }

    @Test
    void mandateWithAKeyThatDoesNotMatchFailsAtTheSigner() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        jdbcTemplate.update("UPDATE mandates SET agent_public_key_hex = ?", "ab".repeat(32));

        chat(userId, "Págale 10 USDC a Ana por el logo", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("FALLIDO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("LLAVE_NO_COINCIDE"));
    }
}
