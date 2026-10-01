package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class UserAccountIntegrationTest extends IntegrationTestBase {

    @Test
    void healthIsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OK"))
                .andExpect(jsonPath("$.aiMode").value("mock"))
                .andExpect(jsonPath("$.signerMode").value("mock"))
                .andExpect(jsonPath("$.network").value("TESTNET"));
    }

    @Test
    void createsUserAndReadsMe() throws Exception {
        String userId = createUser("Josué", "Josue@Example.com");

        mockMvc.perform(get("/api/users/me").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId))
                .andExpect(jsonPath("$.displayName").value("Josué"))
                .andExpect(jsonPath("$.email").value("josue@example.com"));
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        createUser("Josué", "josue@example.com");
        mockMvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"Otro\",\"email\":\"JOSUE@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("email"));
    }

    @Test
    void logsInWithEmailWithoutUserHeader() throws Exception {
        String userId = createUser("Josué", "josue@example.com");

        mockMvc.perform(post("/api/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"JOSUE@Example.com\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId))
                .andExpect(jsonPath("$.displayName").value("Josué"));
    }

    @Test
    void loginWithUnknownEmailIsNotFound() throws Exception {
        mockMvc.perform(post("/api/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nadie@example.com\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"))
                .andExpect(jsonPath("$.details[0].field").value("email"));
    }

    @Test
    void registersAccountOncePerUser() throws Exception {
        String userId = createUser("Josué", null);

        mockMvc.perform(get("/api/accounts/me").header("X-User-Id", userId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));

        mockMvc.perform(post("/api/accounts").header("X-User-Id", userId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smartAccountAddress\":\"" + VALID_C_ADDRESS + "\",\"credentialId\":\"cred-demo\",\"network\":\"TESTNET\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(userId))
                .andExpect(jsonPath("$.smartAccountAddress").value(VALID_C_ADDRESS))
                .andExpect(jsonPath("$.explorerUrl").value("https://stellar.expert/explorer/testnet/contract/" + VALID_C_ADDRESS));

        mockMvc.perform(post("/api/accounts").header("X-User-Id", userId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smartAccountAddress\":\"" + OTHER_C_ADDRESS + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CUENTA_YA_REGISTRADA"));

        mockMvc.perform(get("/api/accounts/me").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.network").value("TESTNET"));

        Integer keyVersion = jdbcTemplate.queryForObject(
                "SELECT agent_key_version FROM accounts WHERE smart_account_address = ?", Integer.class, VALID_C_ADDRESS);
        assertThat(keyVersion).isEqualTo(1);
        Integer auditCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type IN ('USUARIO_CREADO', 'CUENTA_REGISTRADA')", Integer.class);
        assertThat(auditCount).isEqualTo(2);
    }

    @Test
    void addressAlreadyUsedByAnotherUserIsRejected() throws Exception {
        String first = createUser("Ana", null);
        String second = createUser("Juan", null);
        registerAccount(first, VALID_C_ADDRESS);

        mockMvc.perform(post("/api/accounts").header("X-User-Id", second).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smartAccountAddress\":\"" + VALID_C_ADDRESS + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CUENTA_YA_REGISTRADA"));
    }

    @Test
    void invalidAddressIsRejected() throws Exception {
        String userId = createUser("Josué", null);
        mockMvc.perform(post("/api/accounts").header("X-User-Id", userId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"smartAccountAddress\":\"GABC\",\"network\":\"MAINNET\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
    }
}
