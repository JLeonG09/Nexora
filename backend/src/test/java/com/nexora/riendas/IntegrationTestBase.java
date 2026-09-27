package com.nexora.riendas;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Base de los tests de integración: base riendas_test limpia antes de cada test. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    protected static final String VALID_C_ADDRESS = "C" + "A".repeat(55);
    protected static final String OTHER_C_ADDRESS = "C" + "B".repeat(55);

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDatabase() {
        // TRUNCATE no dispara el trigger de solo inserción de audit_events.
        jdbcTemplate.execute("TRUNCATE TABLE audit_events, alerts, approvals, chat_messages, payment_proposals, "
                + "contacts, mandates, accounts, users CASCADE");
    }
}
