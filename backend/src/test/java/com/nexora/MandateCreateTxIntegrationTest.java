package com.nexora;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nexora.clients.ContractInvocationTest;
import com.nexora.clients.CreateTxLookup;
import com.nexora.clients.LookedUpTx;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Con la verificación forzada, un hash que el RPC no conoce responde 422. */
@TestPropertySource(properties = "app.mandate.verify-create-tx=true")
class MandateCreateTxIntegrationTest extends IntegrationTestBase {

    @MockitoBean
    CreateTxLookup createTxLookup;

    @Test
    void nonexistentHashIs422() throws Exception {
        when(createTxLookup.fetch(anyString())).thenReturn(new LookedUpTx("NOT_FOUND", null));
        String userId = userWithAccount();
        postMandate(userId, "50", "20", "15", Instant.now().plus(7, ChronoUnit.DAYS), 1, currentPublicKeyHex(userId))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("TX_NO_VERIFICADA"))
                .andExpect(jsonPath("$.details[0].field").value("createTxHash"));
    }

    @Test
    void failedHashIs422() throws Exception {
        when(createTxLookup.fetch(anyString())).thenReturn(new LookedUpTx("FAILED", "sobre"));
        String userId = userWithAccount();
        postMandate(userId, "50", "20", "15", Instant.now().plus(7, ChronoUnit.DAYS), 1, currentPublicKeyHex(userId))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("TX_NO_VERIFICADA"));
    }

    @Test
    void successThatDoesNotCallTheAccountIs422() throws Exception {
        String userId = userWithRealContract();
        when(createTxLookup.fetch(anyString()))
                .thenReturn(new LookedUpTx("SUCCESS", ContractInvocationTest.envelope(ContractInvocationTest.OTHER)));
        postMandate(userId, "50", "20", "15", Instant.now().plus(7, ChronoUnit.DAYS), 1, currentPublicKeyHex(userId))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0].message").value("La transacción no llama a tu smart account."));
    }

    @Test
    void successThatCallsTheAccountIsCreated() throws Exception {
        String userId = userWithRealContract();
        when(createTxLookup.fetch(anyString()))
                .thenReturn(new LookedUpTx("SUCCESS", ContractInvocationTest.envelope(ContractInvocationTest.CONTRACT)));
        postMandate(userId, "50", "20", "15", Instant.now().plus(7, ChronoUnit.DAYS), 1, currentPublicKeyHex(userId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVO"));
    }

    private String userWithRealContract() throws Exception {
        String userId = createUser("Josué", null);
        registerAccount(userId, ContractInvocationTest.CONTRACT);
        return userId;
    }
}
