package com.nexora.clients;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.math.BigInteger;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.stellar.sdk.KeyPair;
import org.stellar.sdk.scval.Scv;
import org.stellar.sdk.xdr.SCVal;

/** Decodificación de eventos transfer tal como los devuelve getEvents (topics y value en XDR base64). */
class RpcStellarEventsClientTest {

    private static final String FROM = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";
    private static final String TO = KeyPair.random().getAccountId();
    private static final String TX = "8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b";

    @Test
    void decodesSacTransferWithI128Amount() throws IOException {
        OnchainTransfer transfer = RpcStellarEventsClient.decode(TX, 1234650L, "2026-09-28T16:40:05Z",
                List.of(b64(Scv.toSymbol("transfer")), b64(Scv.toAddress(FROM)), b64(Scv.toAddress(TO)),
                        b64(Scv.toString("USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"))),
                b64(Scv.toInt128(BigInteger.valueOf(100_000_000L))));

        assertThat(transfer).isNotNull();
        assertThat(transfer.txHash()).isEqualTo(TX);
        assertThat(transfer.ledger()).isEqualTo(1234650L);
        assertThat(transfer.occurredAt()).isEqualTo(Instant.parse("2026-09-28T16:40:05Z"));
        assertThat(transfer.from()).isEqualTo(FROM);
        assertThat(transfer.to()).isEqualTo(TO);
        assertThat(transfer.amountUnits()).isEqualTo(BigInteger.valueOf(100_000_000L));
    }

    @Test
    void decodesMuxedStyleMapAmount() throws IOException {
        SCVal map = Scv.toMap(new java.util.LinkedHashMap<>(java.util.Map.of(
                Scv.toSymbol("amount"), Scv.toInt128(BigInteger.valueOf(25_000_000L)))));
        OnchainTransfer transfer = RpcStellarEventsClient.decode(TX, 1L, null,
                List.of(b64(Scv.toSymbol("transfer")), b64(Scv.toAddress(FROM)), b64(Scv.toAddress(TO))), b64(map));

        assertThat(transfer).isNotNull();
        assertThat(transfer.amountUnits()).isEqualTo(BigInteger.valueOf(25_000_000L));
    }

    @Test
    void unexpectedShapesAreSkipped() throws IOException {
        assertThat(RpcStellarEventsClient.decode(TX, 1L, null, List.of(b64(Scv.toSymbol("transfer"))),
                b64(Scv.toInt128(BigInteger.ONE)))).isNull();
        assertThat(RpcStellarEventsClient.decode(TX, 1L, null,
                List.of(b64(Scv.toSymbol("transfer")), b64(Scv.toAddress(FROM)), b64(Scv.toAddress(TO))),
                b64(Scv.toSymbol("raro")))).isNull();
        assertThat(RpcStellarEventsClient.decode(TX, 1L, null, List.of("no-es-xdr", "x", "y"), "z")).isNull();
    }

    private static String b64(SCVal value) throws IOException {
        return value.toXdrBase64();
    }
}
