package com.nexora;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProposalIntegrationTest extends IntegrationTestBase {

    @Test
    void listsProposalsNewestFirstAndFiltersByStatus() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String confirmed = chatProposalId(userId, "Págale 15 USDC a Ana por el logo");
        String pending = chatProposalId(userId, "Págale 18 USDC a Ana por el video");
        String rejected = chatProposalId(userId, "Págale 25 USDC a Ana");

        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(3))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.items[0].id").value(rejected))
                .andExpect(jsonPath("$.items[1].id").value(pending))
                .andExpect(jsonPath("$.items[1].approvalId").exists())
                .andExpect(jsonPath("$.items[2].id").value(confirmed))
                .andExpect(jsonPath("$.items[2].contactName").value("Ana"));

        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("status", "CONFIRMADO"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].id").value(confirmed))
                .andExpect(jsonPath("$.items[0].status").value("CONFIRMADO"));

        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("status", "RECHAZADO"))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].rejectionCode").value("SUPERA_TOPE_TRANSACCION"));

        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("size", "2").param("page", "1"))
                .andExpect(jsonPath("$.totalItems").value(3))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(confirmed));
    }

    @Test
    void invalidListParamsAreRejected() throws Exception {
        String userId = userWithAccount();
        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("status", "INVENTADO"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDACION_FALLIDA"));
        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("size", "101"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(userId)).param("page", "-1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getsProposalDetail() throws Exception {
        String userId = userWithAccount();
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);
        String mandateId = createMandate(userId, 1);
        String proposalId = chatProposalId(userId, "Págale 15 USDC a Ana por el logo");

        mockMvc.perform(get("/api/proposals/{id}", proposalId).header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(proposalId))
                .andExpect(jsonPath("$.status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.originalText").value("Págale 15 USDC a Ana por el logo"))
                .andExpect(jsonPath("$.contactId").value(anaId))
                .andExpect(jsonPath("$.contactName").value("Ana"))
                .andExpect(jsonPath("$.destinationAddress").value(ANA_ADDRESS))
                .andExpect(jsonPath("$.amount").value("15.0000000"))
                .andExpect(jsonPath("$.asset").value("USDC"))
                .andExpect(jsonPath("$.memo").value("el logo"))
                .andExpect(jsonPath("$.aiConfidence").value(0.95))
                .andExpect(jsonPath("$.mandateId").value(mandateId))
                .andExpect(jsonPath("$.txHash").exists())
                .andExpect(jsonPath("$.explorerUrl").exists())
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    void proposalOfAnotherUserIsNotFound() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        String proposalId = chatProposalId(userId, "Págale 15 USDC a Ana");

        String otherId = createUser("Otra", null);
        registerAccount(otherId, OTHER_C_ADDRESS);
        mockMvc.perform(get("/api/proposals/{id}", proposalId).header("Authorization", bearer(otherId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RECURSO_NO_ENCONTRADO"));
        mockMvc.perform(get("/api/proposals").header("Authorization", bearer(otherId)))
                .andExpect(jsonPath("$.totalItems").value(0));
        mockMvc.perform(get("/api/proposals/{id}", UUID.randomUUID()).header("Authorization", bearer(userId)))
                .andExpect(status().isNotFound());
    }

    @Test
    void approvalsInboxListsAndFiltersByStatus() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);
        chatProposalId(userId, "Págale 15 USDC a Ana");
        String first = chatProposalId(userId, "Págale 16 USDC a Ana por el video");
        String second = chatProposalId(userId, "Págale 18 USDC a Ana por la foto");

        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[0].proposal.id").value(second))
                .andExpect(jsonPath("$.items[0].status").value("PENDIENTE"))
                .andExpect(jsonPath("$.items[0].reason")
                        .value("El monto (18.00 USDC) supera el umbral de aprobación (15.00 USDC)."))
                .andExpect(jsonPath("$.items[0].expiresAt").exists())
                .andExpect(jsonPath("$.items[0].decidedAt").doesNotExist())
                .andExpect(jsonPath("$.items[0].proposal.status").value("PENDIENTE_APROBACION"))
                .andExpect(jsonPath("$.items[0].proposal.contactName").value("Ana"))
                .andExpect(jsonPath("$.items[0].proposal.memo").value("la foto"))
                .andExpect(jsonPath("$.items[0].proposal.originalText").value("Págale 18 USDC a Ana por la foto"))
                .andExpect(jsonPath("$.items[1].proposal.id").value(first));

        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(userId)).param("status", "PENDIENTE"))
                .andExpect(jsonPath("$.totalItems").value(2));
        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(userId)).param("status", "APROBADA"))
                .andExpect(jsonPath("$.totalItems").value(0));

        String otherId = createUser("Otra", null);
        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(otherId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(0));
    }
}
