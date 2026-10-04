package com.nexora.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Impide arrancar con claves débiles o de ejemplo. {@code AGENT_TOOLS_KEY} se exige siempre
 * (al menos 32 caracteres y fuera de la denylist). Las otras claves de servicio, cuando el modo
 * es http. La contraseña de la base, si no es local. Los mensajes nombran la variable, nunca su valor.
 */
@Component
public class StartupSecretsCheck {

    static final String DEV_DB_PASSWORD = "nexora_dev";
    static final int MIN_SERVICE_KEY_LENGTH = 32;
    private static final Set<String> DB_PLACEHOLDERS = Set.of("cambia-esto", "changeme", DEV_DB_PASSWORD, "riendas_dev");
    private static final Set<String> SERVICE_KEY_DENYLIST = Set.of(
            "cambia-esto", "changeme", "change-me", "change_me", "password", "secret", DEV_DB_PASSWORD, "riendas_dev");
    /** Alargar un placeholder no lo vuelve válido. */
    private static final List<String> SERVICE_KEY_PREFIXES = List.of("cambia-esto", "changeme", "change-me", "change_me");
    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "::1", "[::1]");

    private final AppProperties properties;
    private final Environment environment;

    public StartupSecretsCheck(AppProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @PostConstruct
    void verify() {
        List<String> problems = problems(properties, environment.getProperty("spring.datasource.url"),
                environment.getProperty("spring.datasource.password"));
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Configuración insegura, el backend no arranca:\n - "
                    + String.join("\n - ", problems));
        }
    }

    static List<String> problems(AppProperties properties, String dbUrl, String dbPassword) {
        List<String> problems = new ArrayList<>();
        boolean realAi = "http".equals(properties.ai().mode());
        boolean remoteDb = !isLocal(dbUrl);

        if (realAi && isWeakServiceKey(properties.ai().serviceKey())) {
            problems.add("AI_SERVICE_KEY debe tener al menos 32 caracteres y no ser un valor de ejemplo, con AI_MODE=http.");
        }
        if (isWeakServiceKey(properties.agentToolsKey())) {
            problems.add("AGENT_TOOLS_KEY debe tener al menos 32 caracteres y no ser un valor de ejemplo.");
        }
        if ("http".equals(properties.signer().mode()) && isWeakServiceKey(properties.signer().serviceKey())) {
            problems.add("SIGNER_SERVICE_KEY debe tener al menos 32 caracteres y no ser un valor de ejemplo, con SIGNER_MODE=http.");
        }
        if (properties.demoAttackEnabled() && "http".equals(properties.signer().mode())) {
            problems.add("DEMO_ATTACK_ENABLED=true con SIGNER_MODE=http: el modo atacante no puede usar el firmante real.");
        }
        if (remoteDb && isWeak(dbPassword)) {
            problems.add("DB_PASSWORD sigue con el valor de desarrollo y la base no es local.");
        }
        boolean mockStack = "mock".equals(properties.signer().mode()) && !"http".equals(properties.ai().mode());
        if (!mockStack && (properties.privyAppId() == null || properties.privyAppId().isBlank())) {
            problems.add("PRIVY_APP_ID es obligatorio cuando el firmante o la IA no están en modo mock.");
        }
        return problems;
    }

    /** Contraseña de la base: vacío, placeholder o un valor que empieza por {@code <}. */
    static boolean isWeak(String secret) {
        if (secret == null || secret.isBlank()) {
            return true;
        }
        String value = secret.trim();
        return DB_PLACEHOLDERS.contains(value.toLowerCase(Locale.ROOT)) || value.startsWith("<");
    }

    /**
     * Clave de servicio ({@code X-Service-Key}): vacío, menos de 32 caracteres, placeholder
     * ({@code <…} o la denylist) o un placeholder alargado.
     */
    static boolean isWeakServiceKey(String secret) {
        if (secret == null || secret.isBlank()) {
            return true;
        }
        String value = secret.trim();
        if (value.length() < MIN_SERVICE_KEY_LENGTH || value.startsWith("<")) {
            return true;
        }
        String normalized = value.toLowerCase(Locale.ROOT);
        if (SERVICE_KEY_DENYLIST.contains(normalized)) {
            return true;
        }
        for (String prefix : SERVICE_KEY_PREFIXES) {
            if (normalized.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    /** jdbc:postgresql://host:puerto/base; si no se puede leer el host se trata como remoto. */
    static boolean isLocal(String jdbcUrl) {
        if (jdbcUrl == null || !jdbcUrl.startsWith("jdbc:")) {
            return false;
        }
        try {
            String host = URI.create(jdbcUrl.substring("jdbc:".length())).getHost();
            return host != null && LOCAL_HOSTS.contains(host.toLowerCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
