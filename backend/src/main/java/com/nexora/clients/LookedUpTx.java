package com.nexora.clients;

/** Resultado de {@code getTransaction}: estado del RPC y el sobre, si vino. */
public record LookedUpTx(String status, String envelopeXdr) {
}
