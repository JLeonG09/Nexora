package com.nexora.riendas.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.ai.AiAction;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.enums.RejectionCode;
import com.nexora.riendas.repositories.ContactRepository;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Reglas 1–3 (esquema, confianza, contacto). */
class PaymentValidatorTest {

    private static final UUID USER_ID = UUID.randomUUID();

    private ContactRepository contactRepository;
    private PaymentValidator validator;
    private Contact ana;

    @BeforeEach
    void setUp() {
        contactRepository = mock(ContactRepository.class);
        AppProperties properties = new AppProperties(List.of(), "", "", "TESTNET", 24, null, true, "",
                new AppProperties.Ai("mock", "", "", 2000, 15000, new BigDecimal("0.7")), null, null, null);
        validator = new PaymentValidator(contactRepository, properties);

        ana = new Contact();
        ana.setId(UUID.randomUUID());
        ana.setUserId(USER_ID);
        ana.setName("Ana");
        ana.setNameNormalized("ana");
        ana.setStellarAddress("G" + "A".repeat(55));
        when(contactRepository.findByIdAndUserIdAndArchivedFalse(any(), any())).thenReturn(Optional.empty());
        when(contactRepository.findByIdAndUserIdAndArchivedFalse(ana.getId(), USER_ID)).thenReturn(Optional.of(ana));
        when(contactRepository.findByUserIdAndNameNormalizedAndArchivedFalse(any(), any())).thenReturn(List.of());
        when(contactRepository.findByUserIdAndNameNormalizedAndArchivedFalse(eq(USER_ID), eq("ana")))
                .thenReturn(List.of(ana));
    }

    @Test
    void validPaymentPassesFirstThreeRules() {
        PaymentValidator.Result result = validator.validate(USER_ID, action(args(ana.getId().toString(), "Ana", "15")));
        assertThat(result.valid()).isTrue();
        assertThat(result.contact()).isSameAs(ana);
        assertThat(result.arguments().amount()).isEqualByComparingTo("15");
        assertThat(result.checks()).containsExactly("ESQUEMA", "CONFIANZA", "CONTACTO");
    }

    @Test
    void contactNameAloneIsResolvedIgnoringAccents() {
        PaymentValidator.Result result = validator.validate(USER_ID, action(args(null, "ÁNA", "15")));
        assertThat(result.valid()).isTrue();
        assertThat(result.contact()).isSameAs(ana);
    }

    @Test
    void schemaErrors() {
        Map<String, Object> extra = args(ana.getId().toString(), "Ana", "15");
        extra.put("destinationAddress", "G" + "X".repeat(55));
        assertRejected(action(extra), RejectionCode.ESQUEMA_INVALIDO);

        Map<String, Object> jsonNumber = args(ana.getId().toString(), "Ana", null);
        jsonNumber.put("amount", 15);
        assertRejected(action(jsonNumber), RejectionCode.ESQUEMA_INVALIDO);

        assertRejected(action(args(ana.getId().toString(), "Ana", "15.12345678")), RejectionCode.ESQUEMA_INVALIDO);
        assertRejected(action(args(ana.getId().toString(), "Ana", "0")), RejectionCode.ESQUEMA_INVALIDO);
        assertRejected(action(args(ana.getId().toString(), "Ana", "-5")), RejectionCode.ESQUEMA_INVALIDO);
        assertRejected(action(args(ana.getId().toString(), "Ana", "1e3")), RejectionCode.ESQUEMA_INVALIDO);
        assertRejected(action(args(null, null, "15")), RejectionCode.ESQUEMA_INVALIDO);
        assertRejected(action(args("no-es-uuid", "Ana", "15")), RejectionCode.ESQUEMA_INVALIDO);

        AiInterpretResponse otherTool = new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("transfer_all", args(ana.getId().toString(), "Ana", "15")), null, 0.95, null, List.of(), "mock");
        assertRejected(otherTool, RejectionCode.ESQUEMA_INVALIDO);
    }

    @Test
    void onlyUsdcIsAllowed() {
        Map<String, Object> xlm = args(ana.getId().toString(), "Ana", "15");
        xlm.put("asset", "XLM");
        assertRejected(action(xlm), RejectionCode.ACTIVO_NO_PERMITIDO);
    }

    @Test
    void lowConfidenceAndUngroundedFieldsAreRejected() {
        Map<String, Object> arguments = args(ana.getId().toString(), "Ana", "10000");
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, 0.4, null, List.of(), "mock"), RejectionCode.CONFIANZA_BAJA);
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, null, null, List.of(), "mock"), RejectionCode.CONFIANZA_BAJA);
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                        new AiAction("propose_payment", arguments), null, 0.95, null, List.of("propose_payment.amount"), "mock"),
                RejectionCode.CAMPO_NO_FUNDAMENTADO);
    }

    @Test
    void contactMustBelongToUserAndMatchName() {
        UUID foreignContact = UUID.randomUUID();
        PaymentValidator.Result foreign = validator.validate(USER_ID, action(args(foreignContact.toString(), "Pedro", "15")));
        assertThat(foreign.code()).isEqualTo(RejectionCode.CONTACTO_NO_ENCONTRADO);
        assertThat(foreign.message()).isEqualTo("\"Pedro\" no está en tus contactos. Agrégalo primero en Contactos.");

        assertRejected(action(args(ana.getId().toString(), "Juan", "15")), RejectionCode.CONTACTO_NO_ENCONTRADO);
        assertRejected(action(args(null, "Pedro", "15")), RejectionCode.CONTACTO_NO_ENCONTRADO);
    }

    @Test
    void ambiguousContactNameIsRejected() {
        Contact otherAna = new Contact();
        otherAna.setId(UUID.randomUUID());
        otherAna.setNameNormalized("ana");
        when(contactRepository.findByUserIdAndNameNormalizedAndArchivedFalse(USER_ID, "ana"))
                .thenReturn(List.of(ana, otherAna));
        assertRejected(action(args(null, "Ana", "15")), RejectionCode.CONTACTO_AMBIGUO);
    }

    private void assertRejected(AiInterpretResponse response, RejectionCode expected) {
        PaymentValidator.Result result = validator.validate(USER_ID, response);
        assertThat(result.valid()).isFalse();
        assertThat(result.code()).isEqualTo(expected);
    }

    private static AiInterpretResponse action(Map<String, Object> arguments) {
        return new AiInterpretResponse(UUID.randomUUID(), "action", new AiAction("propose_payment", arguments), null,
                0.95, null, List.of(), "mock");
    }

    private static Map<String, Object> args(String contactId, String contactName, String amount) {
        Map<String, Object> arguments = new HashMap<>();
        if (contactId != null) {
            arguments.put("contactId", contactId);
        }
        if (contactName != null) {
            arguments.put("contactName", contactName);
        }
        if (amount != null) {
            arguments.put("amount", amount);
        }
        arguments.put("asset", "USDC");
        return arguments;
    }
}
