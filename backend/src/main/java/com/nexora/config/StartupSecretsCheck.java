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
 * Impide arrancar con las claves o la contraseña de ejemplo cuando pueden quedar expuestas: servicios reales
 * (modo http) o una base que no está en esta máquina. Los mensajes nombran la variable, nunca su valor.
 */
@Component
public class StartupSecretsCheck {

    static final String DEV_DB_PASSWORD = "nexora_dev";
    private static final Set<String> PLACEHOLDERS = Set.of("cambia-esto", "changeme", DEV_DB_PASSWORD, "riendas_dev");
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

        if (realAi && isWeak(properties.ai().serviceKey())) {
            problems.add("AI_SERVICE_KEY sigue con el valor de ejemplo y AI_MODE=http.");
        }
        if ((realAi || remoteDb) && isWeak(properties.agentToolsKey())) {
            problems.add("AGENT_TOOLS_KEY sigue con el valor de ejemplo: cualquiera podría leer /api/agent-tools.");
        }
        if ("http".equals(properties.signer().mode()) && isWeak(properties.signer().serviceKey())) {
            problems.add("SIGNER_SERVICE_KEY sigue con el valor de ejemplo y SIGNER_MODE=http.");
        }
        if (remoteDb && isWeak(dbPassword)) {
            problems.add("DB_PASSWORD sigue con el valor de desarrollo y la base no es local.");
        }
        return problems;
    }

    static boolean isWeak(String secret) {
        if (secret == null || secret.isBlank()) {
            return true;
        }
        String value = secret.trim();
        return PLACEHOLDERS.contains(value.toLowerCase(Locale.ROOT)) || value.startsWith("<");
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
