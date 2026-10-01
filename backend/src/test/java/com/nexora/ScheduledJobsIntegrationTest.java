package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;

import com.nexora.services.ScheduledJobs;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** La tarea de propuestas ENVIADO se invoca a mano: en el perfil test el scheduler está apagado. */
class ScheduledJobsIntegrationTest extends IntegrationTestBase {

    @Autowired
    private ScheduledJobs scheduledJobs;

    @Test
    void slowSignerEndsConfirmedAfterPolling() throws Exception {
        String proposalId = paymentWithMemo("el logo #firmante-lento");
        assertThat(proposal(proposalId).get("status")).isEqualTo("ENVIADO");

        scheduledJobs.pollSentProposals();
        assertThat(proposal(proposalId).get("status")).isEqualTo("ENVIADO");

        scheduledJobs.pollSentProposals();
        Map<String, Object> row = proposal(proposalId);
        assertThat(row.get("status")).isEqualTo("CONFIRMADO");
        assertThat(row.get("tx_hash")).isNotNull();
        assertThat(row.get("ledger")).isNotNull();
        assertThat(auditCount(proposalId, "TX_CONFIRMADA")).isEqualTo(1);
    }

    @Test
    void notFoundWhileSignerMayStillBeWorkingStaysSent() throws Exception {
        String proposalId = paymentWithMemo("el logo #firmante-caido");

        scheduledJobs.pollSentProposals();

        assertThat(proposal(proposalId).get("status")).isEqualTo("ENVIADO");
    }

    @Test
    void notFoundAfterSignerTimeoutFails() throws Exception {
        String proposalId = paymentWithMemo("el logo #firmante-caido");
        jdbcTemplate.update("UPDATE payment_proposals SET sent_at = now() - interval '60 seconds' WHERE id = ?",
                UUID.fromString(proposalId));

        scheduledJobs.pollSentProposals();

        Map<String, Object> row = proposal(proposalId);
        assertThat(row.get("status")).isEqualTo("FALLIDO");
        assertThat(row.get("rejection_code")).isEqualTo("ENVIO_FALLIDO");
        assertThat(auditCount(proposalId, "TX_FALLIDA")).isEqualTo(1);
    }

    @Test
    void sentOutsideThePollingWindowIsLeftAlone() throws Exception {
        String proposalId = paymentWithMemo("el logo #firmante-caido");
        jdbcTemplate.update("UPDATE payment_proposals SET sent_at = now() - interval '10 minutes' WHERE id = ?",
                UUID.fromString(proposalId));

        scheduledJobs.pollSentProposals();

        assertThat(proposal(proposalId).get("status")).isEqualTo("ENVIADO");
    }

    @Test
    void confirmedProposalsAreNotTouched() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String proposalId = chatProposalId(userId, "Págale 10 USDC a Ana por el logo");

        scheduledJobs.pollSentProposals();

        assertThat(proposal(proposalId).get("status")).isEqualTo("CONFIRMADO");
        assertThat(auditCount(proposalId, "TX_CONFIRMADA")).isEqualTo(1);
    }

    private String paymentWithMemo(String memo) throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return chatProposalId(userId, "Págale 5 USDC a Ana por " + memo);
    }

    private Map<String, Object> proposal(String proposalId) {
        return jdbcTemplate.queryForMap("SELECT status, tx_hash, ledger, rejection_code FROM payment_proposals WHERE id = ?",
                UUID.fromString(proposalId));
    }

    private int auditCount(String proposalId, String type) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE proposal_id = ? AND event_type = ?", Integer.class,
                UUID.fromString(proposalId), type);
        return count == null ? 0 : count;
    }
}
