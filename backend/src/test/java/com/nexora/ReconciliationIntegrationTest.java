package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;

import com.nexora.services.ReconciliationJob;
import com.nexora.services.ScheduledJobs;
import java.math.BigInteger;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

/** En el perfil test la conciliación está apagada: se llama a mano. Ledger compartido: MockLedger. */
@TestPropertySource(properties = "app.demo-attack-enabled=true")
class ReconciliationIntegrationTest extends IntegrationTestBase {

    private static final String UNKNOWN_ADDRESS = "G" + "C".repeat(55);

    @Autowired
    private ReconciliationJob reconciliationJob;

    @Autowired
    private ScheduledJobs scheduledJobs;

    @Test
    void registeringAnAccountStartsTheCursorAtTheLatestLedger() throws Exception {
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, units("5"));
        long latest = mockLedger.latestLedger();

        String userId = userWithAccount();

        assertThat(cursor(userId)).isEqualTo(latest);
        reconciliationJob.reconcileAll();
        assertThat(alertCount()).isZero();
    }

    @Test
    void chatPaymentIsRecognized() throws Exception {
        String userId = readyUser();
        chatProposalId(userId, "Págale 15 USDC a Ana por el logo");

        reconciliationJob.reconcileAll();

        assertThat(alertCount()).isZero();
    }

    @Test
    void slowChatPaymentIsRecognizedOnceConfirmed() throws Exception {
        String userId = readyUser();
        chatProposalId(userId, "Págale 5 USDC a Ana por el logo #firmante-lento");
        scheduledJobs.pollSentProposals();
        scheduledJobs.pollSentProposals();

        reconciliationJob.reconcileAll();

        assertThat(mockLedger.transfersSnapshot()).hasSize(1);
        assertThat(alertCount()).isZero();
    }

    @Test
    void demoAttackCreatesOnePendingAlert() throws Exception {
        String userId = readyUser();
        AttackDemoIntegrationTest.attack(mockMvc, bearer(userId), UNKNOWN_ADDRESS, "10");

        reconciliationJob.reconcileAll();

        Map<String, Object> alert = jdbcTemplate.queryForMap(
                "SELECT status, destination_address, amount, mandate_id, tx_hash FROM alerts");
        assertThat(alert.get("status")).isEqualTo("PENDIENTE");
        assertThat(alert.get("destination_address")).isEqualTo(UNKNOWN_ADDRESS);
        assertThat(alert.get("amount").toString()).isEqualTo("10.0000000");
        assertThat(alert.get("mandate_id")).isNotNull();
        assertThat(auditCount("MOVIMIENTO_NO_RECONOCIDO")).isEqualTo(1);
    }

    @Test
    void externalTransferCreatesAlertAndRunningTwiceIsIdempotent() throws Exception {
        String userId = userWithAccount();
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, units("7.5"));

        reconciliationJob.reconcileAll();
        jdbcTemplate.update("UPDATE accounts SET last_scanned_ledger = last_scanned_ledger - 10");
        reconciliationJob.reconcileAll();

        assertThat(alertCount()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT amount FROM alerts", String.class)).isEqualTo("7.5000000");
        assertThat(jdbcTemplate.queryForObject("SELECT mandate_id FROM alerts", String.class)).isNull();
        assertThat(jdbcTemplate.queryForObject("SELECT user_id FROM alerts", UUID.class))
                .isEqualTo(UUID.fromString(userId));
    }

    @Test
    void incomingTransfersAreIgnored() throws Exception {
        userWithAccount();
        mockLedger.addExternalTransfer(UNKNOWN_ADDRESS, VALID_C_ADDRESS, units("20"));

        reconciliationJob.reconcileAll();

        assertThat(alertCount()).isZero();
    }

    @Test
    void otherAccountsTransfersDoNotAlertThisAccount() throws Exception {
        userWithAccount();
        String other = createUser("Otra", null);
        registerAccount(other, OTHER_C_ADDRESS);
        mockLedger.addExternalTransfer(OTHER_C_ADDRESS, UNKNOWN_ADDRESS, units("3"));

        reconciliationJob.reconcileAll();

        assertThat(alertCount()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT user_id FROM alerts", UUID.class))
                .isEqualTo(UUID.fromString(other));
    }

    @Test
    void cursorAdvances() throws Exception {
        String userId = userWithAccount();
        long before = cursor(userId);
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, units("1"));
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, units("2"));

        reconciliationJob.reconcileAll();

        assertThat(cursor(userId)).isEqualTo(before + 2).isEqualTo(mockLedger.latestLedger());
        assertThat(alertCount()).isEqualTo(2);
    }

    @Test
    void nullCursorIsInitializedWithoutScanningThePast() throws Exception {
        String userId = userWithAccount();
        jdbcTemplate.update("UPDATE accounts SET last_scanned_ledger = NULL");
        mockLedger.addExternalTransfer(VALID_C_ADDRESS, UNKNOWN_ADDRESS, units("4"));

        reconciliationJob.reconcileAll();

        assertThat(cursor(userId)).isEqualTo(mockLedger.latestLedger());
        assertThat(alertCount()).isZero();
    }

    private String readyUser() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return userId;
    }

    private long cursor(String userId) {
        Long value = jdbcTemplate.queryForObject("SELECT last_scanned_ledger FROM accounts WHERE user_id = ?",
                Long.class, UUID.fromString(userId));
        return value == null ? -1 : value;
    }

    private int alertCount() {
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM alerts", Integer.class);
        return count == null ? 0 : count;
    }

    private int auditCount(String type) {
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM audit_events WHERE event_type = ?",
                Integer.class, type);
        return count == null ? 0 : count;
    }

    static BigInteger units(String amount) {
        return new java.math.BigDecimal(amount).movePointRight(7).toBigIntegerExact();
    }
}
