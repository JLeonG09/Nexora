package com.nexora.services;

import com.nexora.clients.ContractInvocation;
import com.nexora.clients.CreateTxLookup;
import com.nexora.clients.LookedUpTx;
import com.nexora.config.AppProperties;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.exceptions.StellarEventsUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Al crear un mandato, {@code getTransaction(createTxHash)} tiene que estar en SUCCESS
 * y el sobre tiene que invocar la smart account del usuario.
 * Con el firmante en mock se omite y queda en el log. Con {@code SIGNER_MODE=http} es obligatoria.
 * {@code app.mandate.verify-create-tx} la fuerza o la apaga.
 */
@Component
public class MandateCreateTxGuard {

    private static final Logger log = LoggerFactory.getLogger(MandateCreateTxGuard.class);

    private final boolean required;
    private final String signerMode;
    private final String eventsMode;
    private final CreateTxLookup lookup;

    public MandateCreateTxGuard(AppProperties properties, Environment environment, CreateTxLookup lookup) {
        this.signerMode = properties.signer().mode();
        this.eventsMode = properties.stellarEvents().mode();
        this.lookup = lookup;
        String override = environment.getProperty("app.mandate.verify-create-tx");
        if (override != null && !override.isBlank()) {
            this.required = Boolean.parseBoolean(override);
        } else {
            this.required = "http".equals(this.signerMode);
        }
    }

    public void verify(String createTxHash, String smartAccountAddress) {
        if (!required) {
            log.info("Verificación on-chain del createTxHash omitida (SIGNER_MODE={}, STELLAR_EVENTS_MODE={}).",
                    signerMode, eventsMode);
            return;
        }
        LookedUpTx tx;
        try {
            tx = lookup.fetch(createTxHash.toLowerCase(java.util.Locale.ROOT));
        } catch (StellarEventsUnavailableException e) {
            throw new ApiException(ErrorCode.FIRMANTE_NO_DISPONIBLE,
                    "No se pudo consultar la transacción del mandato en la red.");
        }
        assertVerified(tx, smartAccountAddress);
    }

    static void assertVerified(LookedUpTx tx, String smartAccountAddress) {
        if (tx == null || tx.status() == null || !"SUCCESS".equals(tx.status())) {
            throw ApiException.field(ErrorCode.TX_NO_VERIFICADA, "createTxHash",
                    "Esa transacción no está en la red o no se confirmó.");
        }
        if (!ContractInvocation.targets(tx.envelopeXdr(), smartAccountAddress)) {
            throw ApiException.field(ErrorCode.TX_NO_VERIFICADA, "createTxHash",
                    "La transacción no llama a tu smart account.");
        }
    }
}
