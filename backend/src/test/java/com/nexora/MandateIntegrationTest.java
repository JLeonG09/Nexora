package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nexora.clients.MockSignerClient;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class MandateIntegrationTest extends IntegrationTestBase {

    private static final Instant IN_7_DAYS = Instant.now().plus(7, ChronoUnit.DAYS);

    @Test
    void publicKeyRequiresAccount() throws Exception {
        String userId = createUser("Josué", null);
        mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIN_CUENTA"));
    }

    @Test
    void publicKeyIsPerAccountAndVersion() throws Exception {
        String userId = userWithAccount();
        mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.smartAccountAddress").value(VALID_C_ADDRESS))
                .andExpect(jsonPath("$.keyVersion").value(1))
                .andExpect(jsonPath("$.publicKeyHex").value(MockSignerClient.mockPublicKeyHex(VALID_C_ADDRESS, 1)))
                .andExpect(jsonPath("$.ed25519VerifierAddress").value("CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4"));
    }

    @Test
    void createsMandateWithFormattedAmountsAndSummary() throws Exception {
        String userId = userWithAccount();
        postMandate(userId, "50", "20", "15", IN_7_DAYS, 1, currentPublicKeyHex(userId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVO"))
                .andExpect(jsonPath("$.dailyLimit").value("50.0000000"))
                .andExpect(jsonPath("$.perTxLimit").value("20.0000000"))
                .andExpect(jsonPath("$.approvalThreshold").value("15.0000000"))
                .andExpect(jsonPath("$.asset").value("USDC"))
                .andExpect(jsonPath("$.assetContractId").value("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"))
                .andExpect(jsonPath("$.keyVersion").value(1))
                .andExpect(jsonPath("$.revokeReason").doesNotExist())
                .andExpect(jsonPath("$.summary").value(org.hamcrest.Matchers.startsWith(
                        "Puede pagar hasta 15.00 USDC sin preguntarte, hasta 20.00 USDC por pago con tu aprobación "
                                + "y 50.00 USDC en 24 horas, solo a tus contactos, hasta el ")));

        mockMvc.perform(get("/api/mandates/active").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVO"));
        mockMvc.perform(get("/api/mandates/active/limits").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.spentLast24h").value("0.0000000"))
                .andExpect(jsonPath("$.availableLast24h").value("50.0000000"));
        Integer audits = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type = 'MANDATO_CREADO'", Integer.class);
        assertThat(audits).isEqualTo(1);
    }

    @Test
    void mandateRequiresAccountAndOnlyOneActive() throws Exception {
        String noAccount = createUser("Sin cuenta", null);
        postMandate(noAccount, "50", "20", "15", IN_7_DAYS, 1, "a".repeat(64))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIN_CUENTA"));

        String userId = userWithAccount();
        createMandate(userId, 1);
        postMandate(userId, "50", "20", "15", IN_7_DAYS, 1, currentPublicKeyHex(userId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MANDATO_ACTIVO_EXISTENTE"));
    }

    @Test
    void mandateRulesAreValidated() throws Exception {
        String userId = userWithAccount();
        String key = currentPublicKeyHex(userId);
        postMandate(userId, "10", "20", "25", IN_7_DAYS, 1, key)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"))
                .andExpect(jsonPath("$.details.length()").value(2));
        postMandate(userId, "50", "20", "15", Instant.now().plus(31, ChronoUnit.DAYS), 1, key)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("expiresAt"));
        postMandate(userId, "50", "20", "15", Instant.now().minus(1, ChronoUnit.HOURS), 1, key)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("expiresAt"));
        postMandate(userId, "0", "0", "0", IN_7_DAYS, 1, key)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(3));
        postMandate(userId, "50.12345678", "20", "15", IN_7_DAYS, 1, key)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("dailyLimit"));
    }

    @Test
    void noActiveMandateGivesNotFoundAndNoLimits() throws Exception {
        String userId = userWithAccount();
        mockMvc.perform(get("/api/mandates/active").header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/mandates/active/limits").header("Authorization", bearer(userId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIN_MANDATO_ACTIVO"));
    }

    @Test
    void revokeRotatesKeyAndOldVersionIsRejected() throws Exception {
        String userId = userWithAccount();
        String keyV1 = currentPublicKeyHex(userId);
        String mandateId = createMandate(userId, 1);

        mockMvc.perform(post("/api/mandates/" + mandateId + "/revoke").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"revokeTxHash\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOCADO"))
                .andExpect(jsonPath("$.revokeReason").value("USUARIO"))
                .andExpect(jsonPath("$.revokedAt").exists())
                .andExpect(jsonPath("$.revokeTxHash").doesNotExist());

        mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.keyVersion").value(2));
        String keyV2 = currentPublicKeyHex(userId);
        assertThat(keyV2).isNotEqualTo(keyV1);

        // Segunda llamada con el hash de kit.rules.remove: idempotente
        String revokeHash = "b".repeat(64);
        mockMvc.perform(post("/api/mandates/" + mandateId + "/revoke").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"revokeTxHash\":\"" + revokeHash + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revokeTxHash").value(revokeHash));
        mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.keyVersion").value(2));

        postMandate(userId, "50", "20", "15", IN_7_DAYS, 1, keyV1)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LLAVE_DESACTUALIZADA"));
        postMandate(userId, "50", "20", "15", IN_7_DAYS, 2, keyV1)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LLAVE_DESACTUALIZADA"));
        postMandate(userId, "50", "20", "15", IN_7_DAYS, 2, keyV2)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.keyVersion").value(2))
                .andExpect(jsonPath("$.agentPublicKeyHex").value(keyV2));

        Integer rotations = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type = 'LLAVE_ROTADA'", Integer.class);
        assertThat(rotations).isEqualTo(1);
        mockMvc.perform(get("/api/mandates").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVO"))
                .andExpect(jsonPath("$.items[1].status").value("REVOCADO"));
    }

    @Test
    void expiringDoesNotRotateKeyAndSameVersionCanBeReused() throws Exception {
        String userId = userWithAccount();
        String mandateId = createMandate(userId, 1);
        jdbcTemplate.update("UPDATE mandates SET expires_at = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(mandateId));

        mockMvc.perform(get("/api/mandates/active").header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound());
        String status = jdbcTemplate.queryForObject("SELECT status FROM mandates WHERE id = ?", String.class,
                UUID.fromString(mandateId));
        assertThat(status).isEqualTo("EXPIRADO");

        mockMvc.perform(post("/api/mandates/" + mandateId + "/revoke").header("Authorization", bearer(userId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ESTADO_INVALIDO"));

        mockMvc.perform(get("/api/agent/public-key").header("Authorization", bearer(userId)))
                .andExpect(jsonPath("$.keyVersion").value(1));
        createMandate(userId, 1);
    }

    @Test
    void mandateOfAnotherUserCannotBeRevoked() throws Exception {
        String owner = userWithAccount();
        String mandateId = createMandate(owner, 1);
        String intruder = createUser("Otro", null);
        registerAccount(intruder, OTHER_C_ADDRESS);

        mockMvc.perform(post("/api/mandates/" + mandateId + "/revoke").header("Authorization", bearer(intruder)))
                .andExpect(status().isNotFound());
    }

    @Test
    void revokeRejectsPendingApprovals() throws Exception {
        String userId = userWithAccount();
        String mandateId = createMandate(userId, 1);
        UUID userUuid = UUID.fromString(userId);
        UUID accountId = jdbcTemplate.queryForObject("SELECT id FROM accounts WHERE user_id = ?", UUID.class, userUuid);
        UUID proposalId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO payment_proposals (id, user_id, account_id, mandate_id, original_text, amount, "
                        + "asset_code, status) VALUES (?, ?, ?, ?, 'Mándale 18 USDC a Juan', 18, 'USDC', 'PENDIENTE_APROBACION')",
                proposalId, userUuid, accountId, UUID.fromString(mandateId));
        jdbcTemplate.update("INSERT INTO approvals (proposal_id, user_id, status, reason, expires_at) "
                + "VALUES (?, ?, 'PENDIENTE', 'Supera el umbral', now() + interval '1 day')", proposalId, userUuid);

        mockMvc.perform(post("/api/mandates/" + mandateId + "/revoke").header("Authorization", bearer(userId)))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForObject("SELECT status || ':' || rejection_code FROM payment_proposals WHERE id = ?",
                String.class, proposalId)).isEqualTo("RECHAZADO:MANDATO_REVOCADO");
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM approvals WHERE proposal_id = ?", String.class,
                proposalId)).isEqualTo("RECHAZADA");
    }
}
