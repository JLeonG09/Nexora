package com.nexora.clients;

import com.nexora.config.AppProperties;
import com.nexora.dtos.signer.SignRequest;
import com.nexora.dtos.signer.SignResponse;
import com.nexora.dtos.signer.SignerAgentKeyDto;
import com.nexora.dtos.signer.SignerErrorDto;
import com.nexora.exceptions.SignerRejectedException;
import com.nexora.exceptions.SignerUnavailableException;
import com.nexora.services.Money;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Firmante simulado (MVP_BACKEND.md §6.2). La llave es SHA-256(address + ":" + version):
 * distinta por cuenta y versión, determinista y <b>sin valor on-chain</b>.
 * Simula la política de spending-limit on-chain (app.signer.mock.onchain-daily-limit en 24 h)
 * y los marcadores #firmante-caido y #firmante-lento en el memo.
 */
@Component
@ConditionalOnProperty(name = "app.signer.mode", havingValue = "mock", matchIfMissing = true)
public class MockSignerClient implements SignerClient {

    static final String MOCK_AGENT_ADDRESS = "GMOCK...NO-USAR-ON-CHAIN";
    static final String ED25519_VERIFIER = "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4";
    private static final Duration SPENDING_WINDOW = Duration.ofHours(24);
    private record Spend(Instant at, BigDecimal amount) {
    }

    private final BigDecimal onchainDailyLimit;
    private final MockLedger mockLedger;
    private final Map<UUID, SignResponse> results = new ConcurrentHashMap<>();
    private final Map<UUID, SignRequest> pendingTransfers = new ConcurrentHashMap<>();
    private final Map<String, List<Spend>> spentByAccount = new ConcurrentHashMap<>();
    private final AtomicInteger submissions = new AtomicInteger();

    public MockSignerClient(AppProperties properties, MockLedger mockLedger) {
        this.onchainDailyLimit = properties.signer().mock().onchainDailyLimit();
        this.mockLedger = mockLedger;
    }

    @Override
    public SignerAgentKeyDto getAgentKey(String smartAccountAddress, int keyVersion) {
        return new SignerAgentKeyDto(smartAccountAddress, keyVersion, mockPublicKeyHex(smartAccountAddress, keyVersion),
                MOCK_AGENT_ADDRESS, ED25519_VERIFIER);
    }

    @Override
    public synchronized SignResponse signAndSubmit(SignRequest request) {
        submissions.incrementAndGet();
        SignResponse previous = results.get(request.proposalId());
        if (previous != null) {
            return previous;
        }
        BigDecimal amount = Money.parse(request.amount());
        if (!Money.toUnits(amount).equals(request.amountUnits())) {
            throw new SignerRejectedException("SOLICITUD_INVALIDA", "amountUnits no corresponde a amount × 10^7.");
        }
        if (!mockPublicKeyHex(request.smartAccountAddress(), request.keyVersion())
                .equalsIgnoreCase(request.agentPublicKeyHex())) {
            throw new SignerRejectedException("LLAVE_NO_COINCIDE",
                    "La llave derivada no coincide con la llave registrada en el mandato.");
        }
        String memo = request.memo() == null ? "" : request.memo();
        if (memo.contains("#firmante-caido")) {
            throw new SignerUnavailableException("Falla simulada del firmante (#firmante-caido)");
        }

        Instant now = Instant.now();
        if (spentLast24h(request.smartAccountAddress(), now).add(amount).compareTo(onchainDailyLimit) > 0) {
            SignResponse failed = new SignResponse(request.proposalId(), SignResponse.FALLIDO, null, null, null, null,
                    new SignerErrorDto("SpendingLimitExceeded", 3221, "SIMULACION",
                            "La red rechazó el pago: supera el tope de gasto del mandato.",
                            "HostError: Error(Contract, #3221)"));
            results.put(request.proposalId(), failed);
            return failed;
        }

        spentByAccount.computeIfAbsent(request.smartAccountAddress(), key -> new ArrayList<>()).add(new Spend(now, amount));
        SignResponse response;
        if (memo.contains("#firmante-lento")) {
            String txHash = sha256Hex(request.proposalId().toString());
            response = new SignResponse(request.proposalId(), SignResponse.ENVIADO, txHash, null, now, null, null);
            pendingTransfers.put(request.proposalId(), request);
        } else {
            response = confirmed(request, now);
        }
        results.put(request.proposalId(), response);
        return response;
    }

    /** Si quedó ENVIADO (#firmante-lento), la consulta siguiente ya lo devuelve CONFIRMADO. */
    @Override
    public synchronized Optional<SignResponse> getTransaction(UUID proposalId) {
        SignResponse stored = results.get(proposalId);
        if (stored == null) {
            return Optional.empty();
        }
        if (SignResponse.ENVIADO.equals(stored.status())) {
            SignRequest request = pendingTransfers.remove(proposalId);
            if (request != null) {
                results.put(proposalId, confirmed(request, stored.submittedAt()));
            }
            return Optional.of(stored);
        }
        return Optional.of(stored);
    }

    /** Solo para tests: olvida pagos y gasto simulado. */
    public synchronized void clear() {
        results.clear();
        pendingTransfers.clear();
        spentByAccount.clear();
        submissions.set(0);
    }

    /** Cuántas veces se pidió firmar. Lo usan los tests de reintento. */
    public int submissions() {
        return submissions.get();
    }

    public static String mockPublicKeyHex(String smartAccountAddress, int keyVersion) {
        return sha256Hex(smartAccountAddress + ":" + keyVersion);
    }

    /** Confirma el pago y lo registra en {@link MockLedger} para que la conciliación lo vea. */
    private SignResponse confirmed(SignRequest request, Instant submittedAt) {
        String txHash = sha256Hex(request.proposalId().toString());
        long confirmedLedger = mockLedger.record(txHash, request.smartAccountAddress(), request.destinationAddress(),
                new BigInteger(request.amountUnits()));
        return new SignResponse(request.proposalId(), SignResponse.CONFIRMADO, txHash, confirmedLedger, submittedAt,
                Instant.now(), null);
    }

    private BigDecimal spentLast24h(String address, Instant now) {
        Instant since = now.minus(SPENDING_WINDOW);
        return spentByAccount.getOrDefault(address, List.of()).stream()
                .filter(spend -> spend.at().isAfter(since))
                .map(Spend::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
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
