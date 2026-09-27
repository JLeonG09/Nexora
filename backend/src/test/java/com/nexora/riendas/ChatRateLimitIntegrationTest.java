package com.nexora.riendas;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class ChatRateLimitIntegrationTest extends IntegrationTestBase {

    @Test
    void moreThan20MessagesPerMinuteIs429() throws Exception {
        String userId = userWithAccount();
        for (int i = 0; i < 20; i++) {
            chat(userId, "hola", null).andExpect(status().isOk());
        }

        chat(userId, "hola", null)
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("LIMITE_FRECUENCIA"));

        String otherUser = userWithAccountAt(OTHER_C_ADDRESS);
        chat(otherUser, "hola", null).andExpect(status().isOk());
    }

    private String userWithAccountAt(String address) throws Exception {
        String userId = createUser("Otra", null);
        registerAccount(userId, address);
        return userId;
    }
}
