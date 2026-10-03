package com.nexora;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

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
                .andExpect(jsonPath("$.reply.text").value(startsWith("Puedo pagar a tus contactos")))
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
    void paymentUnderThresholdIsConfirmed() throws Exception {
        String userId = userWithAccount();
        String anaId = createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 15 USDC a Ana por el logo", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reply.type").value("PROPOSAL"))
                .andExpect(jsonPath("$.reply.text").value(startsWith("Listo: le pagué 15.00 USDC a Ana")))
                .andExpect(jsonPath("$.reply.text").value(containsString("Te quedan 35.00 USDC en las últimas 24 horas.")))
                .andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"))
                .andExpect(jsonPath("$.proposal.contactId").value(anaId))
                .andExpect(jsonPath("$.proposal.contactName").value("Ana"))
                .andExpect(jsonPath("$.proposal.amount").value("15.0000000"))
                .andExpect(jsonPath("$.proposal.asset").value("USDC"))
                .andExpect(jsonPath("$.proposal.memo").value("el logo"))
                .andExpect(jsonPath("$.proposal.txHash").value(matchesPattern("^[0-9a-f]{64}$")))
                .andExpect(jsonPath("$.proposal.explorerUrl").value(containsString("/tx/")))
                .andExpect(jsonPath("$.proposal.approvalId").doesNotExist())
                .andExpect(jsonPath("$.proposal.rejectionCode").doesNotExist());

        String destination = jdbcTemplate.queryForObject("SELECT destination_address FROM payment_proposals", String.class);
        assertThat(destination).isEqualTo(ANA_ADDRESS);
        String approvedBy = jdbcTemplate.queryForObject("SELECT approved_by FROM payment_proposals", String.class);
        assertThat(approvedBy).isEqualTo("AUTOMATICO");
        assertThat(jdbcTemplate.queryForList("SELECT event_type FROM audit_events WHERE proposal_id IS NOT NULL "
                + "ORDER BY occurred_at", String.class))
                .contains("PROPUESTA_CREADA", "VALIDACION_OK", "FIRMA_SOLICITADA", "TX_CONFIRMADA");
    }

    @Test
    void paymentAboveThresholdWaitsForApproval() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        String body = chat(userId, "Págale 18 USDC a Ana por el video", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("PENDIENTE_APROBACION"))
                .andExpect(jsonPath("$.proposal.approvalId").exists())
                .andExpect(jsonPath("$.proposal.txHash").doesNotExist())
                .andExpect(jsonPath("$.reply.text")
                        .value("Ese pago de 18.00 USDC necesita tu aprobación. Revísalo en la bandeja."))
                .andReturn().getResponse().getContentAsString();
        String approvalId = JsonPath.read(body, "$.proposal.approvalId");
        String proposalId = JsonPath.read(body, "$.proposal.id");

        mockMvc.perform(get("/api/approvals").header("Authorization", bearer(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].id").value(approvalId))
                .andExpect(jsonPath("$.items[0].status").value("PENDIENTE"))
                .andExpect(jsonPath("$.items[0].proposal.id").value(proposalId))
                .andExpect(jsonPath("$.items[0].proposal.amount").value("18.0000000"));
    }

    @Test
    void inventedAmountIsRejected() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 1500 USDC a Ana #ia-inventa", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("MONTO_NO_EN_TEXTO"))
                .andExpect(jsonPath("$.reply.text")
                        .value("El monto que entendí (15) no aparece en tu mensaje. Escríbelo de nuevo en números."));
    }

    @Test
    void amountOverPerTransactionLimitIsRejected() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 25 USDC a Ana", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SUPERA_TOPE_TRANSACCION"))
                .andExpect(jsonPath("$.proposal.rejectionMessage")
                        .value("No hice el pago: supera tu tope por transacción (20.00 USDC)."));
    }

    @Test
    void amountOverDailyLimitIsRejected() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        for (int i = 0; i < 3; i++) {
            chat(userId, "Págale 15 USDC a Ana", null).andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));
        }
        chat(userId, "Págale 10 USDC a Ana", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SUPERA_TOPE_DIARIO"))
                .andExpect(jsonPath("$.reply.text")
                        .value("No hice el pago: solo te quedan 5.00 USDC en las últimas 24 horas."));
    }

    @Test
    void sixthProposalInTenMinutesHitsFrequencyLimit() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        for (int i = 0; i < 5; i++) {
            chat(userId, "Págale 1 USDC a Ana", null).andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));
        }
        chat(userId, "Págale 1 USDC a Ana", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("LIMITE_FRECUENCIA"))
                .andExpect(jsonPath("$.reply.text").value("Hiciste muchos pagos seguidos. Espera unos minutos."));
    }

    @Test
    void paymentWithoutMandateIsRejected() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);

        chat(userId, "Págale 15 USDC a Ana", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SIN_MANDATO_ACTIVO"))
                .andExpect(jsonPath("$.reply.text")
                        .value("No tienes un mandato activo. Crea uno para que el agente pueda pagar."));
        Integer withoutMandate = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_proposals WHERE mandate_id IS NULL", Integer.class);
        assertThat(withoutMandate).isEqualTo(1);
    }

    @Test
    void expiredMandateIsRejectedAndMarkedExpired() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        String mandateId = createMandate(userId, 1);
        jdbcTemplate.update("UPDATE mandates SET expires_at = now() - interval '1 hour'");

        chat(userId, "Págale 15 USDC a Ana", null)
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("MANDATO_EXPIRADO"))
                .andExpect(jsonPath("$.reply.text").value(startsWith("Tu mandato venció el ")));
        String status = jdbcTemplate.queryForObject("SELECT status FROM mandates WHERE id = ?::uuid", String.class,
                mandateId);
        assertThat(status).isEqualTo("EXPIRADO");
    }

    @Test
    void slowSignerLeavesProposalSent() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 5 USDC a Ana por el logo #firmante-lento", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("ENVIADO"))
                .andExpect(jsonPath("$.proposal.txHash").doesNotExist())
                .andExpect(jsonPath("$.reply.text")
                        .value("Envié el pago de 5.00 USDC a Ana. Estoy esperando la confirmación de la red."));
    }

    @Test
    void signerDownLeavesProposalSent() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        createMandate(userId, 1);

        chat(userId, "Págale 5 USDC a Ana por el logo #firmante-caido", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("ENVIADO"));
    }

    @Test
    void onchainSpendingLimitMakesPaymentFail() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        // Mandato del backend más amplio que la política on-chain simulada (50 USDC en 24 h).
        postMandate(userId, "100", "40", "40", Instant.now().plus(7, ChronoUnit.DAYS), 1, currentPublicKeyHex(userId))
                .andExpect(status().isCreated());

        chat(userId, "Págale 40 USDC a Ana", null).andExpect(jsonPath("$.proposal.status").value("CONFIRMADO"));
        chat(userId, "Págale 20 USDC a Ana", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("FALLIDO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("SpendingLimitExceeded"))
                .andExpect(jsonPath("$.proposal.txHash").doesNotExist())
                .andExpect(jsonPath("$.reply.text").value("La red rechazó el pago: supera el tope de gasto del mandato."));
        Integer failures = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_events WHERE event_type = 'TX_FALLIDA'", Integer.class);
        assertThat(failures).isEqualTo(1);
    }

    @Test
    void extraFieldFromAiIsRejectedAsInvalidSchema() throws Exception {
        String userId = userWithAccount();
        createContact(userId, "Ana", ANA_ADDRESS);
        chat(userId, "Págale 15 USDC a Ana #ia-extra", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.proposal.status").value("RECHAZADO"))
                .andExpect(jsonPath("$.proposal.rejectionCode").value("ESQUEMA_INVALIDO"))
                .andExpect(jsonPath("$.reply.text").value(startsWith("No entendí bien el pago")));
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

        mockMvc.perform(get("/api/chat/messages").header("Authorization", bearer(userId)).param("conversationId", conversationId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(4))
                .andExpect(jsonPath("$.items[0].role").value("USUARIO"))
                .andExpect(jsonPath("$.items[0].text").value("Hola"))
                .andExpect(jsonPath("$.items[3].role").value("AGENTE"))
                .andExpect(jsonPath("$.items[3].text").value("No tienes un mandato activo."));
    }
}
