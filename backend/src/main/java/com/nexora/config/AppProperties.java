package com.nexora.config;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app")
public record AppProperties(
        List<String> corsAllowedOrigins,
        String explorerBaseUrl,
        String usdcContractId,
        String network,
        int approvalTtlHours,
        RateLimit rateLimit,
        boolean demoAttackEnabled,
        String agentToolsKey,
        Ai ai,
        Signer signer,
        StellarEvents stellarEvents,
        Reconciliation reconciliation,
        String privyAppId) {

    /** {@code HTTP} y {@code http} quedan iguales: los chequeos y los {@code @ConditionalOnProperty} coinciden. */
    static String normalizeMode(String mode) {
        return mode == null ? "" : mode.trim().toLowerCase(Locale.ROOT);
    }

    public record RateLimit(int chatPerMinute, int proposalsPer10Min) {
    }

    public record Ai(
            String mode,
            String baseUrl,
            String serviceKey,
            int connectTimeoutMs,
            int readTimeoutMs,
            BigDecimal minConfidence) {

        public Ai {
            mode = normalizeMode(mode);
        }
    }

    public record Signer(
            String mode,
            String baseUrl,
            String serviceKey,
            int connectTimeoutMs,
            int readTimeoutMs,
            SignerMock mock) {

        public Signer {
            mode = normalizeMode(mode);
        }
    }

    public record SignerMock(BigDecimal onchainDailyLimit) {
    }

    public record StellarEvents(String mode, String rpcUrl) {

        public StellarEvents {
            mode = normalizeMode(mode);
        }
    }

    public record Reconciliation(boolean enabled, long intervalMs) {
    }
}
