package com.nexora.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiAction;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.entities.Contact;
import com.nexora.entities.Mandate;
import com.nexora.entities.enums.MandateStatus;
import com.nexora.entities.enums.ProposalStatus;
import com.nexora.entities.enums.RejectionCode;
import com.nexora.repositories.ContactRepository;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Reglas 1–8 y la decisión APROBADO / PENDIENTE_APROBACION. */
class PaymentValidatorTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-09-26T12:00:00Z");
    private static final String TEXT = "Págale 15 USDC a Ana por el logo";

    private ContactRepository contactRepository;
    private PaymentValidator validator;
    private Contact ana;
    private Mandate mandate;

    @BeforeEach
    void setUp() {
        contactRepository = mock(ContactRepository.class);
        AppProperties properties = new AppProperties(List.of(), "", "", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, "",
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

        mandate = mandate(MandateStatus.ACTIVO, NOW.plus(Duration.ofDays(7)));
    }

    @Test
    void validPaymentUnderThresholdIsApproved() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "15")), context(TEXT));
        assertThat(result.valid()).isTrue();
        assertThat(result.contact()).isSameAs(ana);
        assertThat(result.arguments().amount()).isEqualByComparingTo("15");
        assertThat(result.checks()).containsExactly("ESQUEMA", "CONFIANZA", "CONTACTO", "MONTO_EN_TEXTO", "INTENCION",
                "MANDATO", "TOPE_TRANSACCION", "TOPE_DIARIO", "FRECUENCIA");
        assertThat(result.decision()).isEqualTo(ProposalStatus.APROBADO);
    }

    @Test
    void paymentAboveThresholdNeedsApproval() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "18")),
                context("Págale 18 USDC a Ana"));
        assertThat(result.valid()).isTrue();
        assertThat(result.decision()).isEqualTo(ProposalStatus.PENDIENTE_APROBACION);
    }

    @Test
    void contactNameAloneIsResolvedIgnoringAccents() {
        PaymentValidator.Result result = validator.validate(action(args(null, "ÁNA", "15")), context(TEXT));
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
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action", null, null, 0.95, null, List.of(), "mock"),
                RejectionCode.ESQUEMA_INVALIDO);
    }

    @Test
    void onlyUsdcIsAllowed() {
        Map<String, Object> xlm = args(ana.getId().toString(), "Ana", "15");
        xlm.put("asset", "XLM");
        assertRejected(action(xlm), RejectionCode.ACTIVO_NO_PERMITIDO);
    }

    @Test
    void lowConfidenceAndUngroundedFieldsAreRejected() {
        Map<String, Object> arguments = args(ana.getId().toString(), "Ana", "15");
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, 0.4, null, List.of(), "mock"), RejectionCode.CONFIANZA_BAJA);
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, 0.69, null, List.of(), "mock"), RejectionCode.CONFIANZA_BAJA);
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, null, null, List.of(), "mock"), RejectionCode.CONFIANZA_BAJA);
        assertRejected(new AiInterpretResponse(UUID.randomUUID(), "action",
                        new AiAction("propose_payment", arguments), null, 0.95, null, List.of("propose_payment.amount"), "mock"),
                RejectionCode.CAMPO_NO_FUNDAMENTADO);

        PaymentValidator.Result exactlyMin = validator.validate(new AiInterpretResponse(UUID.randomUUID(), "action",
                new AiAction("propose_payment", arguments), null, 0.7, null, List.of(), "mock"), context(TEXT));
        assertThat(exactlyMin.valid()).isTrue();
    }

    @Test
    void contactMustBelongToUserAndMatchName() {
        UUID foreignContact = UUID.randomUUID();
        PaymentValidator.Result foreign = validator.validate(action(args(foreignContact.toString(), "Pedro", "15")),
                context(TEXT));
        assertThat(foreign.code()).isEqualTo(RejectionCode.CONTACTO_NO_ENCONTRADO);
        assertThat(foreign.message()).isEqualTo("\"Pedro\" no está en tus contactos. Agrégalo primero en Contactos.");

        assertRejected(action(args(ana.getId().toString(), "Juan", "15")), RejectionCode.CONTACTO_NO_ENCONTRADO);
        assertRejected(action(args(null, "Pedro", "15")), RejectionCode.CONTACTO_NO_ENCONTRADO);
    }

    @Test
    void archivedContactIsNotFound() {
        // El repositorio solo devuelve contactos no archivados.
        when(contactRepository.findByIdAndUserIdAndArchivedFalse(ana.getId(), USER_ID)).thenReturn(Optional.empty());
        assertRejected(action(args(ana.getId().toString(), "Ana", "15")), RejectionCode.CONTACTO_NO_ENCONTRADO);
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

    @Test
    void amountMustAppearLiterallyInText() {
        PaymentValidator.Result invented = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context("Págale 1500 USDC a Ana"));
        assertThat(invented.code()).isEqualTo(RejectionCode.MONTO_NO_EN_TEXTO);
        assertThat(invented.message())
                .isEqualTo("El monto que entendí (15) no aparece en tu mensaje. Escríbelo de nuevo en números.");

        PaymentValidator.Result noNumbers = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context("Págale quince a Ana"));
        assertThat(noNumbers.code()).isEqualTo(RejectionCode.MONTO_NO_EN_TEXTO);
        assertThat(noNumbers.message()).isEqualTo("Escribe el monto en números.");

        PaymentValidator.Result decimal = validator.validate(action(args(ana.getId().toString(), "Ana", "2.5")),
                context("Págale 2,5 USDC a Ana"));
        assertThat(decimal.valid()).isTrue();
    }

    @Test
    void rule4bRejectsNegationForeignCurrencySignAndSeveralNumbers() {
        PaymentValidator.Result negated = validator.validate(action(args(ana.getId().toString(), "Ana", "9")),
                context("no le pagues 9"));
        assertThat(negated.valid()).isFalse();
        assertThat(negated.code()).isEqualTo(RejectionCode.INTENCION_NEGADA);

        PaymentValidator.Result euros = validator.validate(action(args(ana.getId().toString(), "Ana", "6")),
                context("págale 6 EUR"));
        assertThat(euros.code()).isEqualTo(RejectionCode.ACTIVO_NO_PERMITIDO);

        PaymentValidator.Result negative = validator.validate(action(args(ana.getId().toString(), "Ana", "3")),
                context("págale -3"));
        assertThat(negative.code()).isEqualTo(RejectionCode.MONTO_AMBIGUO);
        assertThat(negative.message()).isEqualTo("El monto tiene que ser mayor que cero.");

        PaymentValidator.Result twoNumbers = validator.validate(action(args(ana.getId().toString(), "Ana", "5")),
                context("págale 5 a Ana, no 50"));
        assertThat(twoNumbers.valid()).isFalse();
        assertThat(twoNumbers.code()).isEqualTo(RejectionCode.MONTO_AMBIGUO);
        assertThat(twoNumbers.decision()).isEqualTo(ProposalStatus.RECHAZADO);
    }

    @Test
    void ambiguousAmountIsRejected() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "1")),
                context("Págale 1.000 USDC a Ana"));
        assertThat(result.code()).isEqualTo(RejectionCode.MONTO_AMBIGUO);
        assertThat(result.message()).isEqualTo(RejectionCode.MONTO_AMBIGUO.defaultMessage());
    }

    @Test
    void withoutMandateIsSinMandatoActivo() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, null, null, BigDecimal.ZERO, 1));
        assertThat(result.code()).isEqualTo(RejectionCode.SIN_MANDATO_ACTIVO);

        Mandate revoked = mandate(MandateStatus.REVOCADO, NOW.plus(Duration.ofDays(7)));
        assertThat(validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, null, revoked, BigDecimal.ZERO, 1)).code()).isEqualTo(RejectionCode.SIN_MANDATO_ACTIVO);
    }

    @Test
    void expiredMandateIsMandatoExpirado() {
        Mandate dueButActive = mandate(MandateStatus.ACTIVO, NOW.minus(Duration.ofHours(1)));
        PaymentValidator.Result due = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, dueButActive, dueButActive, BigDecimal.ZERO, 1));
        assertThat(due.code()).isEqualTo(RejectionCode.MANDATO_EXPIRADO);
        assertThat(due.message()).startsWith("Tu mandato venció el ").endsWith(". Crea uno nuevo.");

        Mandate expired = mandate(MandateStatus.EXPIRADO, NOW.minus(Duration.ofDays(1)));
        assertThat(validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, null, expired, BigDecimal.ZERO, 1)).code()).isEqualTo(RejectionCode.MANDATO_EXPIRADO);
    }

    @Test
    void perTransactionLimit() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "25")),
                context("Págale 25 USDC a Ana"));
        assertThat(result.code()).isEqualTo(RejectionCode.SUPERA_TOPE_TRANSACCION);
        assertThat(result.message()).isEqualTo("No hice el pago: supera tu tope por transacción (20.00 USDC).");

        assertThat(validator.validate(action(args(ana.getId().toString(), "Ana", "20")), context("Págale 20 USDC a Ana"))
                .valid()).isTrue();
    }

    @Test
    void dailyLimit() {
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "10")),
                context("Págale 10 USDC a Ana", mandate, mandate, new BigDecimal("45"), 1));
        assertThat(result.code()).isEqualTo(RejectionCode.SUPERA_TOPE_DIARIO);
        assertThat(result.message()).isEqualTo("No hice el pago: solo te quedan 5.00 USDC en las últimas 24 horas.");

        assertThat(validator.validate(action(args(ana.getId().toString(), "Ana", "5")),
                context("Págale 5 USDC a Ana", mandate, mandate, new BigDecimal("45"), 1)).valid()).isTrue();
    }

    @Test
    void frequencyLimit() {
        assertThat(validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, mandate, mandate, BigDecimal.ZERO, 5)).valid()).isTrue();

        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context(TEXT, mandate, mandate, BigDecimal.ZERO, 6));
        assertThat(result.code()).isEqualTo(RejectionCode.LIMITE_FRECUENCIA);
        assertThat(result.message()).isEqualTo(RejectionCode.LIMITE_FRECUENCIA.defaultMessage());
    }

    @Test
    void rulesStopAtFirstFailure() {
        // Monto inventado y sin mandato: gana la regla 4.
        PaymentValidator.Result result = validator.validate(action(args(ana.getId().toString(), "Ana", "15")),
                context("Págale 1500 USDC a Ana", null, null, BigDecimal.ZERO, 1));
        assertThat(result.code()).isEqualTo(RejectionCode.MONTO_NO_EN_TEXTO);
        assertThat(result.checks()).containsExactly("ESQUEMA", "CONFIANZA", "CONTACTO");
        assertThat(result.decision()).isEqualTo(ProposalStatus.RECHAZADO);
    }

    private void assertRejected(AiInterpretResponse response, RejectionCode expected) {
        PaymentValidator.Result result = validator.validate(response, context(TEXT));
        assertThat(result.valid()).isFalse();
        assertThat(result.code()).isEqualTo(expected);
    }

    private PaymentValidator.Context context(String text) {
        return context(text, mandate, mandate, BigDecimal.ZERO, 1);
    }

    private static PaymentValidator.Context context(String text, Mandate active, Mandate last, BigDecimal spent,
                                                    long proposalsLast10Min) {
        return new PaymentValidator.Context(USER_ID, text, active, last, spent, proposalsLast10Min, NOW);
    }

    /** 50 / 20 / 15, como el mandato de los tests de integración. */
    private static Mandate mandate(MandateStatus status, Instant expiresAt) {
        Mandate mandate = new Mandate();
        mandate.setId(UUID.randomUUID());
        mandate.setStatus(status);
        mandate.setExpiresAt(expiresAt);
        mandate.setDailyLimit(new BigDecimal("50"));
        mandate.setPerTxLimit(new BigDecimal("20"));
        mandate.setApprovalThreshold(new BigDecimal("15"));
        return mandate;
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
