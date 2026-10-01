package com.nexora.riendas.config;

import java.math.BigDecimal;
import java.util.List;
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
        Reconciliation reconciliation) {

    public record RateLimit(int chatPerMinute, int proposalsPer10Min) {
    }

    public record Ai(
            String mode,
            String baseUrl,
            String serviceKey,
            int connectTimeoutMs,
            int readTimeoutMs,
            BigDecimal minConfidence) {
    }

    public record Signer(
            String mode,
            String baseUrl,
            String serviceKey,
            int connectTimeoutMs,
            int readTimeoutMs,
            SignerMock mock) {
    }

    public record SignerMock(BigDecimal onchainDailyLimit) {
    }

    public record StellarEvents(String mode, String rpcUrl) {
    }

    public record Reconciliation(boolean enabled, long intervalMs) {
    }
}
