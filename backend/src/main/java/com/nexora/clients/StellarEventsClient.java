package com.nexora.clients;

import com.nexora.exceptions.StellarEventsUnavailableException;
import java.util.List;

public interface StellarEventsClient {

    /** Resultado de revisar una cuenta: transferencias salientes y hasta qué ledger quedó revisada. */
    record Scan(List<OnchainTransfer> transfers, long scannedUpToLedger) {
    }

    /** Último ledger de la red. */
    long latestLedger() throws StellarEventsUnavailableException;

    /** Transferencias de USDC con {@code from = address} y {@code ledger > fromLedger}. */
    Scan outgoingTransfers(String address, long fromLedger) throws StellarEventsUnavailableException;
}
