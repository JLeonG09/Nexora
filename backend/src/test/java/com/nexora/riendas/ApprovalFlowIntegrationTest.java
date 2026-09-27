package com.nexora.riendas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nexora.riendas.services.ScheduledJobs;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class ApprovalFlowIntegrationTest extends IntegrationTestBase {

    @Autowired
    private ScheduledJobs scheduledJobs;

    @Test
    void approveSendsAndConfirms() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");

        approve(userId, approvalId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(approvalId))
                .andExpect(jsonPath("$.status").value("APROBADA"))
                .andExpect(jsonPath("$.decidedAt").exists())
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.proposal.txHash").exists())
                .andExpect(jsonPath("$.proposal.explorerUrl").value(startsWith("https://stellar.expert/explorer/testnet/tx/")))
                .andExpect(jsonPath("$.proposal.rejectionCode").doesNotExist());

        Map<String, Object> row = proposalOf(approvalId);
        assertThat(row.get("approved_by")).isEqualTo("USUARIO");
        assertThat(auditCount(row.get("id"), "APROBACION_APROBADA")).isEqualTo(1);
        assertThat(auditCount(row.get("id"), "FIRMA_SOLICITADA")).isEqualTo(1);
        assertThat(auditCount(row.get("id"), "TX_CONFIRMADA")).isEqualTo(1);
    }

    @Test
    void approvingTwiceIsInvalidState() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        approve(userId, approvalId).andExpect(status().isOk());

        approve(userId, approvalId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ESTADO_INVALIDO"))
                .andExpect(jsonPath("$.message").value("Esta solicitud ya fue decidida o expiró."));
    }

    @Test
    void rejectWithReason() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");

        mockMvc.perform(post("/api/approvals/" + approvalId + "/reject").header("X-User-Id", userId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"No reconozco este pago\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECHAZADA"))
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("RECHAZADO_POR_USUARIO"))
                .andExpect(jsonPath("$.proposal.rejectionMessage").value("Rechazaste este pago."))
                .andExpect(jsonPath("$.proposal.txHash").doesNotExist());

        assertThat(jdbcTemplate.queryForObject("SELECT decision_note FROM approvals WHERE id = ?", String.class,
                UUID.fromString(approvalId))).isEqualTo("No reconozco este pago");
        assertThat(auditCount(proposalOf(approvalId).get("id"), "APROBACION_RECHAZADA")).isEqualTo(1);
        approve(userId, approvalId).andExpect(status().isConflict());
    }

    @Test
    void rejectWithoutBody() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");

        mockMvc.perform(post("/api/approvals/" + approvalId + "/reject").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECHAZADA"));
    }

    @Test
    void rejectReasonTooLongIsValidationError() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");

        mockMvc.perform(post("/api/approvals/" + approvalId + "/reject").header("X-User-Id", userId)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"" + "x".repeat(201) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
    }

    @Test
    void anotherUsersApprovalIsNotFound() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        String other = createUser("Otra", null);

        approve(other, approvalId)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
        approve(userId, UUID.randomUUID().toString()).andExpect(status().isNotFound());
    }

    @Test
    void approveRevalidatesDailyLimit() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        chatProposalId(userId, "Págale 15 USDC a Ana por el logo");
        chatProposalId(userId, "Págale 15 USDC a Ana por el banner");
        chatProposalId(userId, "Págale 10 USDC a Ana por el video");

        approve(userId, approvalId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECHAZADA"))
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SUPERA_TOPE_DIARIO"))
                .andExpect(jsonPath("$.proposal.rejectionMessage")
                        .value("No hice el pago: solo te quedan 10.00 USDC en las últimas 24 horas."));

        assertThat(auditCount(proposalOf(approvalId).get("id"), "VALIDACION_RECHAZADA")).isEqualTo(1);
    }

    @Test
    void approveRevalidatesMandateExpiry() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        jdbcTemplate.update("UPDATE mandates SET expires_at = now() - interval '1 minute'");

        approve(userId, approvalId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RECHAZADA"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("MANDATO_EXPIRADO"));

        assertThat(jdbcTemplate.queryForObject("SELECT status FROM mandates", String.class)).isEqualTo("EXPIRADO");
    }

    @Test
    void expiredApprovalCannotBeApproved() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        jdbcTemplate.update("UPDATE approvals SET expires_at = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(approvalId));

        approve(userId, approvalId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ESTADO_INVALIDO"));
    }

    @Test
    void expiryJobExpiresOverdueApprovals() throws Exception {
        String userId = readyUser();
        String overdue = pendingApproval(userId, "Págale 18 USDC a Ana por la web");
        String stillOpen = pendingApproval(userId, "Págale 19 USDC a Ana por el logo");
        jdbcTemplate.update("UPDATE approvals SET expires_at = now() - interval '1 minute' WHERE id = ?",
                UUID.fromString(overdue));

        scheduledJobs.expireApprovals();

        assertThat(approvalStatus(overdue)).isEqualTo("EXPIRADA");
        Map<String, Object> row = proposalOf(overdue);
        assertThat(row.get("status")).isEqualTo("RECHAZADO");
        assertThat(row.get("rejection_code")).isEqualTo("APROBACION_EXPIRADA");
        assertThat(auditCount(row.get("id"), "APROBACION_EXPIRADA")).isEqualTo(1);
        assertThat(approvalStatus(stillOpen)).isEqualTo("PENDIENTE");
    }

    @Test
    void signerDownOnApproveIs503AndProposalStaysSent() throws Exception {
        String userId = readyUser();
        String approvalId = pendingApproval(userId, "Págale 18 USDC a Ana por la web #firmante-caido");

        approve(userId, approvalId)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("FIRMANTE_NO_DISPONIBLE"));

        assertThat(approvalStatus(approvalId)).isEqualTo("APROBADA");
        assertThat(proposalOf(approvalId).get("status")).isEqualTo("ENVIADO");
    }

    private String readyUser() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return userId;
    }

    private String pendingApproval(String userId, String message) throws Exception {
        String body = chat(userId, message, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("PENDIENTE_APROBACION"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.proposal.approvalId");
    }

    private ResultActions approve(String userId, String approvalId) throws Exception {
        return mockMvc.perform(post("/api/approvals/" + approvalId + "/approve").header("X-User-Id", userId)
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    private Map<String, Object> proposalOf(String approvalId) {
        return jdbcTemplate.queryForMap("SELECT p.id, p.status, p.approved_by, p.rejection_code FROM payment_proposals p "
                + "JOIN approvals a ON a.proposal_id = p.id WHERE a.id = ?", UUID.fromString(approvalId));
    }

    private String approvalStatus(String approvalId) {
        return jdbcTemplate.queryForObject("SELECT status FROM approvals WHERE id = ?", String.class,
                UUID.fromString(approvalId));
    }

    private int auditCount(Object proposalId, String type) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE proposal_id = ? AND event_type = ?", Integer.class,
                proposalId, type);
        return count == null ? 0 : count;
    }
}
