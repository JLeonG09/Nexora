package com.nexora;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/** El access token de Privy es la única credencial de la API de usuario. */
class AuthIntegrationTest extends IntegrationTestBase {

    @Test
    void missingTokenIs401() throws Exception {
        mockMvc.perform(get("/api/contacts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void userIdHeaderAloneIs401() throws Exception {
        mockMvc.perform(get("/api/contacts").header("X-User-Id", UUID.randomUUID().toString()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void wrongAudienceIs401() throws Exception {
        String bearer = "Bearer " + tokenWithAudience("did:privy:ajeno", "otra-app");
        mockMvc.perform(get("/api/users/me").header("Authorization", bearer))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void userDoesNotSeeAnotherUsersContactsApprovalsOrProposals() throws Exception {
        String owner = userWithAccount();
        createContact(owner, "Ana", ANA_ADDRESS);
        createMandate(owner, 1);
        String proposalId = chatProposalId(owner, "Págale 20 USDC a Ana por el logo");
        String intruder = createUser("Intruso", "intruso@example.com");

        mockMvc.perform(get("/api/contacts").header("Authorization", bearer(intruder)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(intruder)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(intruder)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
        mockMvc.perform(get("/api/proposals/{id}", proposalId).header("Authorization", bearer(intruder)))
                .andExpect(status().isNotFound());
    }

    private String tokenWithAudience(String did, String audience) {
        return com.nexora.config.TestProfileJwtDecoder.token(did, audience, null);
    }
}
