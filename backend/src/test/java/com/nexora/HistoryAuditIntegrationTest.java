package com.nexora;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class HistoryAuditIntegrationTest extends IntegrationTestBase {

    @Test
    void historyOnlyHasSentConfirmedAndFailedNewestFirst() throws Exception {
        String userId = readyUser();
        String confirmed = chatProposalId(userId, "Págale 10 USDC a Ana por el logo");
        chatProposalId(userId, "Págale 18 USDC a Ana por la web");
        chatProposalId(userId, "Págale 25 USDC a Ana por el banner");
        String sent = chatProposalId(userId, "Págale 5 USDC a Ana por el video #firmante-lento");

        mockMvc.perform(get("/api/history").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[0].proposalId").value(sent))
                .andExpect(jsonPath("$.items[0].status").value("ENVIADO"))
                .andExpect(jsonPath("$.items[1].proposalId").value(confirmed))
                .andExpect(jsonPath("$.items[1].status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.items[1].contactName").value("Ana"))
                .andExpect(jsonPath("$.items[1].destinationAddress").value(ANA_ADDRESS))
                .andExpect(jsonPath("$.items[1].amount").value("10.0000000"))
                .andExpect(jsonPath("$.items[1].asset").value("USDC"))
                .andExpect(jsonPath("$.items[1].memo").value("el logo"))
                .andExpect(jsonPath("$.items[1].txHash").exists())
                .andExpect(jsonPath("$.items[1].explorerUrl").value(startsWith("https://stellar.expert/explorer/testnet/tx/")))
                .andExpect(jsonPath("$.items[1].approvedBy").value("AUTOMATICO"))
                .andExpect(jsonPath("$.items[1].sentAt").exists())
                .andExpect(jsonPath("$.items[1].confirmedAt").exists());
    }

    @Test
    void historyIsPaginatedAndPerUser() throws Exception {
        String userId = readyUser();
        chatProposalId(userId, "Págale 1 USDC a Ana por uno");
        chatProposalId(userId, "Págale 2 USDC a Ana por dos");
        chatProposalId(userId, "Págale 3 USDC a Ana por tres");

        mockMvc.perform(get("/api/history?page=1&size=2").header("X-User-Id", userId))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].amount").value("1.0000000"))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.totalItems").value(3));
        mockMvc.perform(get("/api/history").header("X-User-Id", createUser("Otra", null)))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void auditFilteredByProposalTellsTheWholeStory() throws Exception {
        String userId = readyUser();
        String proposalId = chatProposalId(userId, "Págale 15 USDC a Ana por el logo");

        mockMvc.perform(get("/api/audit?proposalId=" + proposalId).header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.totalItems").value(4))
                .andExpect(jsonPath("$.items[0].eventType").value("TX_CONFIRMADA"))
                .andExpect(jsonPath("$.items[0].actor").value("RED"))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("PROPUESTA_CREADA")))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("VALIDACION_OK")))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("FIRMA_SOLICITADA")))
                .andExpect(jsonPath("$.items[?(@.eventType == 'VALIDACION_OK')].data.checks[0]").value(hasItem("ESQUEMA")))
                .andExpect(jsonPath("$.items[?(@.eventType == 'FIRMA_SOLICITADA')].data.keyVersion").value(hasItem(1)))
                .andExpect(jsonPath("$.items[?(@.eventType == 'FIRMA_SOLICITADA')].data.contextRuleId").value(hasItem(1)))
                .andExpect(jsonPath("$.items[0].proposalId").value(proposalId))
                .andExpect(jsonPath("$.items[0].occurredAt").exists())
                .andExpect(jsonPath("$.items[0].summary").exists());
    }

    @Test
    void auditWithoutFilterIsPerUser() throws Exception {
        String userId = readyUser();
        chatProposalId(userId, "Págale 15 USDC a Ana por el logo");
        String other = createUser("Otra", null);

        mockMvc.perform(get("/api/audit").header("X-User-Id", userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("USUARIO_CREADO")))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("MANDATO_CREADO")))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("CHAT_RECIBIDO")));
        mockMvc.perform(get("/api/audit").header("X-User-Id", other))
                .andExpect(jsonPath("$.items[*].eventType").value(hasItem("USUARIO_CREADO")))
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    void auditSizeIsValidated() throws Exception {
        String userId = readyUser();
        mockMvc.perform(get("/api/audit?size=101").header("X-User-Id", userId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
    }

    private String readyUser() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        return userId;
    }
}
