package com.nexora.riendas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class ChatIntegrationTest extends IntegrationTestBase {

    @Test
    void chatRequiresAccount() throws Exception {
        String userId = createUser("Josué", null);
        chat(userId, "Hola", null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SIN_CUENTA"));
    }

    @Test
    void invalidMessageIsRejected() throws Exception {
        String userId = userWithAccount();
        chat(userId, "", null).andExpect(status().isBadRequest());
        chat(userId, "x".repeat(501), null).andExpect(status().isBadRequest());
    }

    @Test
    void plainMessageGetsHelpText() throws Exception {
        String userId = userWithAccount();
        chat(userId, "Hola", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conversationId").exists())
                .andExpect(jsonPath("$.reply.role").value("AGENTE"))
                .andExpect(jsonPath("$.reply.type").value("MESSAGE"))
                .andExpect(jsonPath("$.reply.text").value(org.hamcrest.Matchers.startsWith("Puedo pagar a tus contactos")))
                .andExpect(jsonPath("$.proposal").doesNotExist());
    }

    @Test
    void balanceQuestionUsesMandateLimits() throws Exception {
        String userId = userWithAccount();
        chat(userId, "¿Cuánto me queda hoy?", null)
                .andExpect(jsonPath("$.reply.text").value("No tienes un mandato activo."));

        createMandate(userId, 1);
        chat(userId, "¿Cuánto me queda hoy?", null)
                .andExpect(jsonPath("$.reply.text").value("Te quedan 50.00 USDC en las últimas 24 horas."));
    }

    @Test
    void paymentToContactCreatesProposal() throws Exception {
        String userId = userWithAccount();
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 15 USDC a Ana por el logo", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply.type").value("PROPOSAL"))
                .andExpect(jsonPath("$.proposal.status").value("PROPUESTO"))
                .andExpect(jsonPath("$.proposal.contactId").value(anaId))
                .andExpect(jsonPath("$.proposal.contactName").value("Ana"))
                .andExpect(jsonPath("$.proposal.amount").value("15.0000000"))
                .andExpect(jsonPath("$.proposal.asset").value("USDC"))
                .andExpect(jsonPath("$.proposal.memo").value("el logo"))
                .andExpect(jsonPath("$.proposal.rejectionCode").doesNotExist());

        String destination = jdbcTemplate.queryForObject("SELECT destination_address FROM payment_proposals", String.class);
        assertThat(destination).isEqualTo(ANA_ADDRESS);
    }

    @Test
    void extraFieldFromAiIsRejectedAsInvalidSchema() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        chat(userId, "Págale 15 USDC a Ana #ia-extra", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("ESQUEMA_INVALIDO"))
                .andExpect(jsonPath("$.reply.text").value(org.hamcrest.Matchers.startsWith("No entendí bien el pago")));
        Integer rejected = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type = 'VALIDACION_RECHAZADA'", Integer.class);
        assertThat(rejected).isEqualTo(1);
    }

    @Test
    void lowConfidenceIsRejected() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        chat(userId, "Págale 15 USDC a Ana #ia-baja", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("CONFIANZA_BAJA"));
    }

    @Test
    void aiFailureReturns503AndIsAudited() throws Exception {
        String userId = userWithAccount();
        chat(userId, "Hola #ia-error", null)
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("IA_NO_DISPONIBLE"))
                .andExpect(jsonPath("$.message").value(
                        "El asistente no está disponible en este momento. Intenta de nuevo en unos segundos."));
        Integer errors = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type = 'IA_ERROR'", Integer.class);
        assertThat(errors).isEqualTo(1);
        Integer proposals = jdbcTemplate.queryForObject("SELECT count(*) FROM payment_proposals", Integer.class);
        assertThat(proposals).isZero();
    }

    @Test
    void messagesAreListedPerConversationInOrder() throws Exception {
        String userId = userWithAccount();
        String body = chat(userId, "Hola", null).andReturn().getResponse().getContentAsString();
        String conversationId = JsonPath.read(body, "$.conversationId");
        chat(userId, "¿Cuánto me queda?", conversationId).andExpect(jsonPath("$.conversationId").value(conversationId));
        chat(userId, "Otra conversación", null);

        mockMvc.perform(get("/api/chat/messages").header("X-User-Id", userId).param("conversationId", conversationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(4))
                .andExpect(jsonPath("$.items[0].role").value("USUARIO"))
                .andExpect(jsonPath("$.items[0].text").value("Hola"))
                .andExpect(jsonPath("$.items[3].role").value("AGENTE"))
                .andExpect(jsonPath("$.items[3].text").value("No tienes un mandato activo."));
    }

    private ResultActions chat(String userId, String message, String conversationId) throws Exception {
        String conversation = conversationId == null ? "" : ",\"conversationId\":\"" + conversationId + "\"";
        return mockMvc.perform(post("/api/chat").header("X-User-Id", userId).contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"" + message + "\"" + conversation + "}"));
    }
}
