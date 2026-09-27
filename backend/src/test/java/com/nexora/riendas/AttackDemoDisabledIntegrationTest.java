package com.nexora.riendas;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = "app.demo-attack-enabled=false")
class AttackDemoDisabledIntegrationTest extends IntegrationTestBase {

    @Test
    void attackIsNotFoundWhenDisabled() throws Exception {
        String userId = userWithAccount();
        createMandate(userId, 1);

        AttackDemoIntegrationTest.attack(mockMvc, userId, AttackDemoIntegrationTest.UNKNOWN_ADDRESS, "60")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
    }
}
