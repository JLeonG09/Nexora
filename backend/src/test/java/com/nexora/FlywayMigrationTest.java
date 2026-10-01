package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

class FlywayMigrationTest extends IntegrationTestBase {

    @Test
    void appliesV1Successfully() {
        Boolean success = jdbcTemplate.queryForObject(
                "SELECT success FROM flyway_schema_history WHERE version = '1'", Boolean.class);
        assertThat(success).isTrue();
    }

    @Test
    void createsAllTables() {
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'", String.class);
        assertThat(tables).contains("users", "accounts", "mandates", "contacts", "chat_messages",
                "payment_proposals", "approvals", "alerts", "audit_events");
    }

    @Test
    void auditEventsRejectUpdateAndDelete() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO audit_events (id, event_type, actor, summary) VALUES (?, 'USUARIO_CREADO', 'BACKEND', 'prueba')", id);

        assertThatThrownBy(() -> jdbcTemplate.update("UPDATE audit_events SET summary = 'cambiado' WHERE id = ?", id))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("solo de inserción");
        assertThatThrownBy(() -> jdbcTemplate.update("DELETE FROM audit_events WHERE id = ?", id))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("solo de inserción");
    }
}
