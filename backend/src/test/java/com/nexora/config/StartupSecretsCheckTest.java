package com.nexora.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class StartupSecretsCheckTest {

    private static final String LOCAL_DB = "jdbc:postgresql://localhost:5432/nexora";
    private static final String REMOTE_DB = "jdbc:postgresql://db.nexora.app:5432/nexora";
    private static final String STRONG = "0123456789abcdef0123456789abcdef";
    private static final String STRONG_AI = "abcdef0123456789abcdef0123456789";
    private static final String STRONG_SIGNER = "fedcba9876543210fedcba9876543210";

    @Test
    void localMockWithStrongToolsKeyStarts() {
        assertThat(StartupSecretsCheck.problems(props("mock", "cambia-esto", "mock", "cambia-esto", STRONG),
                LOCAL_DB, "nexora_dev")).isEmpty();
    }

    @Test
    void shortOrDenylistedToolsKeyBlocksStartup() {
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "mock", "x", "1234"), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("AGENT_TOOLS_KEY");
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "mock", "x", "cambia-esto"), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("AGENT_TOOLS_KEY");
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "mock", "x", "changeme"), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("AGENT_TOOLS_KEY");
        String padded = "cambia-esto-" + "a".repeat(20);
        assertThat(padded).hasSize(StartupSecretsCheck.MIN_SERVICE_KEY_LENGTH);
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "mock", "x", padded), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("AGENT_TOOLS_KEY");
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "mock", "x", "a".repeat(31)), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("AGENT_TOOLS_KEY");
    }

    @Test
    void realAiWithExampleKeysIsBlocked() {
        List<String> problems = StartupSecretsCheck.problems(
                props("http", "<clave-backend-a-ia>", "mock", "cambia-esto", "cambia-esto"), LOCAL_DB, "nexora_dev");

        assertThat(problems).hasSize(2);
        assertThat(problems.get(0)).contains("AI_SERVICE_KEY");
        assertThat(problems.get(1)).contains("AGENT_TOOLS_KEY");
    }

    @Test
    void realSignerWithExampleKeyIsBlocked() {
        assertThat(StartupSecretsCheck.problems(props("mock", "x", "http", "  ", STRONG), LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("SIGNER_SERVICE_KEY");
    }

    @Test
    void remoteDatabaseNeedsRealPasswordAndToolsKey() {
        List<String> problems = StartupSecretsCheck.problems(
                props("mock", "cambia-esto", "mock", "cambia-esto", "cambia-esto"), REMOTE_DB, "nexora_dev");

        assertThat(problems).hasSize(2);
        assertThat(String.join(" ", problems)).contains("AGENT_TOOLS_KEY").contains("DB_PASSWORD");
    }

    @Test
    void realSecretsEverywherePass() {
        assertThat(StartupSecretsCheck.problems(props("http", STRONG_AI, "http", STRONG_SIGNER, STRONG),
                REMOTE_DB, "S3gura!2026")).isEmpty();
    }

    @Test
    void messagesNeverIncludeTheSecretValue() {
        List<String> problems = StartupSecretsCheck.problems(
                props("http", "<clave-backend-a-ia>", "http", "cambia-esto", "changeme"), REMOTE_DB, "nexora_dev");

        assertThat(problems).hasSize(4)
                .noneMatch(p -> p.contains("<clave") || p.contains("cambia-esto") || p.contains("nexora_dev"));
    }

    @Test
    void demoAttackWithRealSignerIsBlocked() {
        AppProperties enabled = new AppProperties(List.of("http://localhost:5173"),
                "https://stellar.expert/explorer/testnet",
                "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), true, STRONG,
                new AppProperties.Ai("mock", "http://localhost:8000", STRONG_AI, 2000, 15000, new BigDecimal("0.7")),
                new AppProperties.Signer("http", "http://localhost:3001", STRONG_SIGNER, 2000, 45000,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                new AppProperties.StellarEvents("mock", "https://soroban-testnet.stellar.org"),
                new AppProperties.Reconciliation(true, 60000), "privy-app-de-prueba");

        assertThat(StartupSecretsCheck.problems(enabled, LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("DEMO_ATTACK_ENABLED").contains("SIGNER_MODE=http");
    }

    @Test
    void realSignerWithoutPrivyAppIdIsBlocked() {
        AppProperties sinPrivy = new AppProperties(List.of("http://localhost:5173"),
                "https://stellar.expert/explorer/testnet",
                "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), false, STRONG,
                new AppProperties.Ai("mock", "http://localhost:8000", STRONG_AI, 2000, 15000, new BigDecimal("0.7")),
                new AppProperties.Signer("http", "http://localhost:3001", STRONG_SIGNER, 2000, 45000,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                new AppProperties.StellarEvents("mock", "https://soroban-testnet.stellar.org"),
                new AppProperties.Reconciliation(true, 60000), "  ");

        assertThat(StartupSecretsCheck.problems(sinPrivy, LOCAL_DB, "nexora_dev"))
                .singleElement().asString().contains("PRIVY_APP_ID");
    }

    @Test
    void unreadableOrMissingUrlCountsAsRemote() {
        assertThat(StartupSecretsCheck.isLocal(null)).isFalse();
        assertThat(StartupSecretsCheck.isLocal("postgres://localhost/x")).isFalse();
        assertThat(StartupSecretsCheck.isLocal("jdbc:postgresql://127.0.0.1:5432/nexora_test")).isTrue();
    }

    private static AppProperties props(String aiMode, String aiKey, String signerMode, String signerKey,
                                       String toolsKey) {
        return new AppProperties(List.of("http://localhost:5173"), "https://stellar.expert/explorer/testnet",
                "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", "TESTNET", 24,
                new AppProperties.RateLimit(20, 5), false, toolsKey,
                new AppProperties.Ai(aiMode, "http://localhost:8000", aiKey, 2000, 15000, new BigDecimal("0.7")),
                new AppProperties.Signer(signerMode, "http://localhost:3001", signerKey, 2000, 45000,
                        new AppProperties.SignerMock(new BigDecimal("50"))),
                new AppProperties.StellarEvents("mock", "https://soroban-testnet.stellar.org"),
                new AppProperties.Reconciliation(true, 60000), "privy-app-de-prueba");
    }
}
