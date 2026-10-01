package com.nexora.dtos.signer;

import java.time.Instant;
import java.util.UUID;

/** Respuesta de sign-and-submit y de GET /transactions/{proposalId}: CONFIRMADO, FALLIDO o ENVIADO. */
public record SignResponse(
        UUID proposalId,
        String status,
        String txHash,
        Long ledger,
        Instant submittedAt,
        Instant confirmedAt,
        SignerErrorDto error) {

    public static final String CONFIRMADO = "CONFIRMADO";
    public static final String FALLIDO = "FALLIDO";
    public static final String ENVIADO = "ENVIADO";
}
