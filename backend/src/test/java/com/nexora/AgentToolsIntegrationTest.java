package com.nexora;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

class AgentToolsIntegrationTest extends IntegrationTestBase {

    private static final String TOOLS_KEY = "clave-tools-test";

    @Test
    void missingServiceKeyIsRejected() throws Exception {
        String userId = userWithAccount();
        mockMvc.perform(get("/api/agent-tools/contacts").header("X-User-Id", userId))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("CLAVE_SERVICIO_INVALIDA"));
    }

    @Test
    void wrongServiceKeyIsRejected() throws Exception {
        String userId = userWithAccount();
        mockMvc.perform(get("/api/agent-tools/limits").header("X-User-Id", userId).header("X-Service-Key", "otra"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("CLAVE_SERVICIO_INVALIDA"));
    }

    @Test
    void serviceKeyWithoutUserIsRejected() throws Exception {
        mockMvc.perform(get("/api/agent-tools/contacts").header("X-Service-Key", TOOLS_KEY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void userEndpointsDoNotAcceptOnlyTheServiceKey() throws Exception {
        mockMvc.perform(get("/api/contacts").header("X-Service-Key", TOOLS_KEY))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("USUARIO_NO_IDENTIFICADO"));
    }

    @Test
    void contactsReturnOnlyActiveIdAndNameWithoutAddresses() throws Exception {
        String userId = userWithAccount();
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);
        String juanId = createContact(userId, "Juan", JUAN_ADDRESS);
        mockMvc.perform(delete("/api/contacts/" + juanId).header("Authorization", bearer(userId)))
                .andExpect(status().is2xxSuccessful());

        tools(userId, "/api/agent-tools/contacts")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].id").value(anaId))
                .andExpect(jsonPath("$.items[0].name").value("Ana"))
                .andExpect(content().string(Matchers.not(Matchers.containsString(ANA_ADDRESS))));
    }

    @Test
    void limitsWithoutMandateSaySinMandato() throws Exception {
        String userId = userWithAccount();
        tools(userId, "/api/agent-tools/limits")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIN_MANDATO"))
                .andExpect(jsonPath("$.dailyLimit").value(nullValue()))
                .andExpect(jsonPath("$.expiresAt").value(nullValue()));
    }

    @Test
    void limitsWithoutAccountSaySinMandato() throws Exception {
        String userId = createUser("Sin cuenta", null);
        tools(userId, "/api/agent-tools/limits")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIN_MANDATO"));
    }

    @Test
    void limitsReflectSpending() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        chatProposalId(userId, "Págale 15 USDC a Ana por el logo");

        tools(userId, "/api/agent-tools/limits")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVO"))
                .andExpect(jsonPath("$.asset").value("USDC"))
                .andExpect(jsonPath("$.dailyLimit").value("50.0000000"))
                .andExpect(jsonPath("$.spentLast24h").value("15.0000000"))
                .andExpect(jsonPath("$.availableLast24h").value("35.0000000"))
                .andExpect(jsonPath("$.perTxLimit").value("20.0000000"))
                .andExpect(jsonPath("$.approvalThreshold").value("15.0000000"))
                .andExpect(jsonPath("$.expiresAt").exists())
                .andExpect(jsonPath("$.mandateId").doesNotExist());
    }

    @Test
    void historyIsNewestFirstAndRespectsLimit() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String first = chatProposalId(userId, "Págale 10 USDC a Ana por el logo");
        String second = chatProposalId(userId, "Págale 18 USDC a Ana por la web");

        tools(userId, "/api/agent-tools/history")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.items[0].proposalId").value(second))
                .andExpect(jsonPath("$.items[0].status").value("PENDIENTE_APROBACION"))
                .andExpect(jsonPath("$.items[1].proposalId").value(first))
                .andExpect(jsonPath("$.items[1].contactName").value("Ana"))
                .andExpect(jsonPath("$.items[1].amount").value("10.0000000"))
                .andExpect(jsonPath("$.items[1].asset").value("USDC"))
                .andExpect(jsonPath("$.items[1].memo").value("el logo"))
                .andExpect(jsonPath("$.items[1].status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.items[1].createdAt").exists())
                .andExpect(content().string(Matchers.not(Matchers.containsString(ANA_ADDRESS))));

        tools(userId, "/api/agent-tools/history?limit=1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].proposalId").value(second));
    }

    @Test
    void historyLimitOutOfRangeIsValidationError() throws Exception {
        String userId = userWithAccount();
        tools(userId, "/api/agent-tools/history?limit=21")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
        tools(userId, "/api/agent-tools/history?limit=0")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
    }

    @Test
    void historyOnlyShowsOwnProposals() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        chatProposalId(userId, "Págale 10 USDC a Ana por el logo");
        String otherUser = createUser("Otra", null);

        tools(otherUser, "/api/agent-tools/history")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    private ResultActions tools(String userId, String path) throws Exception {
        return mockMvc.perform(get(path).header("X-User-Id", userId).header("X-Service-Key", TOOLS_KEY));
    }
}
