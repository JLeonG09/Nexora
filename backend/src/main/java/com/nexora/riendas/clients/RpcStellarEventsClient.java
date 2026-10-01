package com.nexora.riendas.clients;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.exceptions.StellarEventsUnavailableException;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.math.BigInteger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.stellar.sdk.Address;
import org.stellar.sdk.SorobanServer;
import org.stellar.sdk.requests.sorobanrpc.EventFilterType;
import org.stellar.sdk.requests.sorobanrpc.GetEventsRequest;
import org.stellar.sdk.responses.sorobanrpc.GetEventsResponse;
import org.stellar.sdk.scval.Scv;
import org.stellar.sdk.xdr.SCMapEntry;
import org.stellar.sdk.xdr.SCVal;
import org.stellar.sdk.xdr.SCValType;

/**
 * Lee eventos {@code transfer} del contrato USDC con getEvents del RPC (MVP_BACKEND.md §6.4).
 * Topics: ["transfer", from, to] y, en el Stellar Asset Contract, un cuarto con el activo.
 */
@Component
@ConditionalOnProperty(name = "app.stellar-events.mode", havingValue = "rpc")
public class RpcStellarEventsClient implements StellarEventsClient {

    private static final Logger log = LoggerFactory.getLogger(RpcStellarEventsClient.class);
    private static final long PAGE_SIZE = 100;

    private final SorobanServer server;
    private final String usdcContractId;

    public RpcStellarEventsClient(AppProperties properties) {
        this.server = new SorobanServer(properties.stellarEvents().rpcUrl());
        this.usdcContractId = properties.usdcContractId();
    }

    @PreDestroy
    void close() throws IOException {
        server.close();
    }

    @Override
    public long latestLedger() {
        try {
            return server.getLatestLedger().getSequence();
        } catch (RuntimeException e) {
            throw new StellarEventsUnavailableException("No se pudo leer el último ledger: " + e.getMessage(), e);
        }
    }

    @Override
    public Scan outgoingTransfers(String address, long fromLedger) {
        try {
            long latest = latestLedger();
            if (fromLedger >= latest) {
                return new Scan(List.of(), fromLedger);
            }
            long startLedger = fromLedger + 1;
            long oldest = server.getHealth().getOldestLedger();
            if (startLedger < oldest) {
                log.warn("La cuenta {} tiene un hueco: el RPC solo guarda desde el ledger {} y el cursor iba en {}.",
                        address, oldest, fromLedger);
                startLedger = oldest;
            }
            GetEventsRequest.EventFilter filter = GetEventsRequest.EventFilter.builder()
                    .type(EventFilterType.CONTRACT)
                    .contractIds(List.of(usdcContractId))
                    .topic(List.of(symbol("transfer"), address(address), "*"))
                    .topic(List.of(symbol("transfer"), address(address), "*", "*"))
                    .build();

            List<OnchainTransfer> transfers = new ArrayList<>();
            String cursor = null;
            long scannedUpTo = fromLedger;
            while (true) {
                GetEventsRequest.GetEventsRequestBuilder request = GetEventsRequest.builder().filter(filter);
                GetEventsRequest.PaginationOptions.PaginationOptionsBuilder pagination =
                        GetEventsRequest.PaginationOptions.builder().limit(PAGE_SIZE);
                if (cursor == null) {
                    request.startLedger(startLedger);
                } else {
                    pagination.cursor(cursor);
                }
                GetEventsResponse response = server.getEvents(request.pagination(pagination.build()).build());
                scannedUpTo = Math.max(scannedUpTo, response.getLatestLedger() == null ? latest : response.getLatestLedger());
                List<GetEventsResponse.EventInfo> events = response.getEvents() == null ? List.of() : response.getEvents();
                for (GetEventsResponse.EventInfo event : events) {
                    if (Boolean.FALSE.equals(event.getInSuccessfulContractCall())) {
                        continue;
                    }
                    OnchainTransfer transfer = decode(event.getTransactionHash(), event.getLedger(),
                            event.getLedgerClosedAt(), event.getTopic(), event.getValue());
                    if (transfer != null && transfer.from().equals(address)) {
                        transfers.add(transfer);
                    }
                }
                if (events.size() < PAGE_SIZE || response.getCursor() == null) {
                    break;
                }
                cursor = response.getCursor();
            }
            return new Scan(transfers, scannedUpTo);
        } catch (StellarEventsUnavailableException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new StellarEventsUnavailableException("No se pudieron leer los eventos: " + e.getMessage(), e);
        }
    }

    /** Arma la transferencia desde el evento; null si no tiene la forma esperada. */
    static OnchainTransfer decode(String txHash, Long ledger, String ledgerClosedAt, List<String> topics, String value) {
        try {
            if (topics == null || topics.size() < 3 || txHash == null || ledger == null) {
                return null;
            }
            String from = Address.fromSCVal(SCVal.fromXdrBase64(topics.get(1))).toString();
            String to = Address.fromSCVal(SCVal.fromXdrBase64(topics.get(2))).toString();
            BigInteger amount = amount(SCVal.fromXdrBase64(value));
            if (amount == null) {
                return null;
            }
            Instant occurredAt = ledgerClosedAt == null ? Instant.now() : Instant.parse(ledgerClosedAt);
            return new OnchainTransfer(txHash, ledger, occurredAt, from, to, amount);
        } catch (IOException | RuntimeException e) {
            log.warn("Evento transfer ilegible en {}: {}", txHash, e.getMessage());
            return null;
        }
    }

    /** {@code value} es un i128, o un mapa con "amount" cuando el destino es muxed. */
    private static BigInteger amount(SCVal value) {
        if (value.getDiscriminant() == SCValType.SCV_I128) {
            return Scv.fromInt128(value);
        }
        if (value.getDiscriminant() == SCValType.SCV_MAP && value.getMap() != null) {
            for (SCMapEntry entry : value.getMap().getSCMap()) {
                if (entry.getKey().getDiscriminant() == SCValType.SCV_SYMBOL
                        && "amount".equals(Scv.fromSymbol(entry.getKey()))
                        && entry.getVal().getDiscriminant() == SCValType.SCV_I128) {
                    return Scv.fromInt128(entry.getVal());
                }
            }
        }
        return null;
    }

    private static String symbol(String value) {
        return base64(Scv.toSymbol(value));
    }

    private static String address(String value) {
        return base64(Scv.toAddress(value));
    }

    private static String base64(SCVal value) {
        try {
            return value.toXdrBase64();
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo codificar el topic", e);
        }
    }
}
