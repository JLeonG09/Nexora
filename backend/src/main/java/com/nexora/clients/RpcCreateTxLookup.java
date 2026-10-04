package com.nexora.clients;

import com.nexora.config.AppProperties;
import com.nexora.exceptions.StellarEventsUnavailableException;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.stellar.sdk.SorobanServer;
import org.stellar.sdk.responses.sorobanrpc.GetTransactionResponse;

/**
 * {@code SorobanServer.getTransaction}: SUCCESS, NOT_FOUND o FAILED.
 * Documentado en https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getTransaction
 */
@Component
public class RpcCreateTxLookup implements CreateTxLookup {

    private final SorobanServer server;

    public RpcCreateTxLookup(AppProperties properties) {
        this.server = new SorobanServer(properties.stellarEvents().rpcUrl());
    }

    @PreDestroy
    void close() throws IOException {
        server.close();
    }

    @Override
    public LookedUpTx fetch(String txHash) {
        try {
            GetTransactionResponse got = server.getTransaction(txHash);
            String status = got.getStatus() == null ? "" : got.getStatus().name();
            return new LookedUpTx(status, got.getEnvelopeXdr());
        } catch (RuntimeException e) {
            throw new StellarEventsUnavailableException("getTransaction falló: " + e.getMessage(), e);
        }
    }
}
