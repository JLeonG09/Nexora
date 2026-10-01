package com.nexora.clients;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * "Cadena" en memoria que comparten {@link MockSignerClient} y {@link MockStellarEventsClient}
 * (MVP_BACKEND.md §6.3). Así, en modo mock, la conciliación ve los pagos del firmante simulado.
 */
@Component
public class MockLedger {

    static final long FIRST_LEDGER = 1_234_600L;

    private final List<OnchainTransfer> transfers = new ArrayList<>();
    private long ledger = FIRST_LEDGER;

    public synchronized long latestLedger() {
        return ledger;
    }

    /** Registra una transferencia en un ledger nuevo y lo devuelve. */
    public synchronized long record(String txHash, String from, String to, BigInteger amountUnits) {
        ledger++;
        transfers.add(new OnchainTransfer(txHash, ledger, Instant.now(), from, to, amountUnits));
        return ledger;
    }

    /** Solo para tests: un pago hecho fuera del sistema (p. ej. con la passkey del dueño). */
    public OnchainTransfer addExternalTransfer(String from, String to, BigInteger amountUnits) {
        String txHash = sha256Hex("externa:" + UUID.randomUUID());
        long recordedLedger = record(txHash, from, to, amountUnits);
        return transfersSnapshot().stream().filter(t -> t.ledger() == recordedLedger).findFirst().orElseThrow();
    }

    public synchronized List<OnchainTransfer> outgoing(String address, long fromLedger) {
        return transfers.stream()
                .filter(transfer -> transfer.from().equals(address) && transfer.ledger() > fromLedger)
                .toList();
    }

    public synchronized List<OnchainTransfer> transfersSnapshot() {
        return List.copyOf(transfers);
    }

    /** Solo para tests. */
    public synchronized void clear() {
        transfers.clear();
        ledger = FIRST_LEDGER;
    }

    static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
