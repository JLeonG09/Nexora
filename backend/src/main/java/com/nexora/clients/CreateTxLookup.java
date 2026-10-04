package com.nexora.clients;

/** Lectura de {@code getTransaction} del Soroban RPC. */
public interface CreateTxLookup {

    LookedUpTx fetch(String txHash);
}
