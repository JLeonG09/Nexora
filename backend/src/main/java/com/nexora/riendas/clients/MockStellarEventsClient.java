package com.nexora.riendas.clients;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Lee las transferencias de {@link MockLedger}. */
@Component
@ConditionalOnProperty(name = "app.stellar-events.mode", havingValue = "mock", matchIfMissing = true)
public class MockStellarEventsClient implements StellarEventsClient {

    private final MockLedger mockLedger;

    public MockStellarEventsClient(MockLedger mockLedger) {
        this.mockLedger = mockLedger;
    }

    @Override
    public long latestLedger() {
        return mockLedger.latestLedger();
    }

    @Override
    public Scan outgoingTransfers(String address, long fromLedger) {
        long latest = mockLedger.latestLedger();
        return new Scan(mockLedger.outgoing(address, fromLedger), Math.max(latest, fromLedger));
    }
}
