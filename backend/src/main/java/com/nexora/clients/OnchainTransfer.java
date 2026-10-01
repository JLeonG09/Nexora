package com.nexora.clients;

import java.math.BigInteger;
import java.time.Instant;

/** Transferencia de USDC leída de la red (evento {@code transfer}). {@code amountUnits} = monto × 10^7. */
public record OnchainTransfer(
        String txHash,
        long ledger,
        Instant occurredAt,
        String from,
        String to,
        BigInteger amountUnits) {
}
