package com.nexora.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Clasificador de intención con un modelo pequeño servido con la API de OpenAI (Ollama o {@code cactus serve}).
 * La salida va forzada a un JSON con una sola palabra de una lista cerrada, así que hasta un modelo de 0,5B la
 * cumple: no redacta, no elige contactos ni montos.
 */
public class OpenAiIntentModel implements IntentModel {

    static final String COMPLETIONS_PATH = "/v1/chat/completions";
    private static final Logger log = LoggerFactory.getLogger(OpenAiIntentModel.class);
    private static final Map<String, RuleInterpreter.Intent> LABELS = Map.of(
            "pagar", RuleInterpreter.Intent.PAY,
            "saldo", RuleInterpreter.Intent.BALANCE,
            "saludo", RuleInterpreter.Intent.GREETING,
            "otro", RuleInterpreter.Intent.UNKNOWN);
    static final String SYSTEM_PROMPT = """
            Clasifica el mensaje de una persona que usa una app para pagar a sus contactos.
            - pagar: pide mandar dinero a alguien, aunque no use verbos (un nombre y una cantidad para esa persona).
            - saldo: pregunta cuánto dinero le queda o puede gastar.
            - saludo: saluda, agradece o pregunta qué puede hacer la app.
            - otro: cualquier otra cosa. Un número que es una edad, una hora, un precio o una dirección es otro.
            Responde solo con el JSON pedido.""";
    /** Ejemplos como turnos previos: un modelo de 0,5B imita mejor que lo que obedece instrucciones. */
    private static final List<Map<String, String>> EXAMPLES = examples(
            "Rosa 50 de la renta", "pagar",
            "lo del taxi para Carlos, 8", "pagar",
            "mi hermano cumple 30", "otro",
            "el pan costó 3", "otro",
            "Carlos llega a las 5", "otro",
            "qué tengo disponible", "saldo",
            "buenas noches", "saludo");
    private static final Map<String, Object> RESPONSE_FORMAT = Map.of(
            "type", "json_schema",
            "json_schema", Map.of(
                    "name", "intencion",
                    "strict", true,
                    "schema", Map.of(
                            "type", "object",
                            "properties", Map.of("intencion", Map.of(
                                    "type", "string",
                                    "enum", List.of("pagar", "saldo", "saludo", "otro"))),
                            "required", List.of("intencion"),
                            "additionalProperties", false)));

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String model;

    public OpenAiIntentModel(String baseUrl, String serviceKey, String model, Duration connectTimeout,
                             Duration readTimeout, RestClient.Builder builder, ObjectMapper objectMapper) {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(connectTimeout).build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(readTimeout);
        this.restClient = builder
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + serviceKey)
                .build();
        this.objectMapper = objectMapper;
        this.model = model;
    }

    @Override
    public Optional<RuleInterpreter.Intent> classify(String message) {
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", SYSTEM_PROMPT));
        messages.addAll(EXAMPLES);
        messages.add(Map.of("role", "user", "content", message));
        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", 0,
                "max_tokens", 20,
                "response_format", RESPONSE_FORMAT,
                "messages", messages);
        try {
            JsonNode completion = restClient.post()
                    .uri(COMPLETIONS_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            String content = completion == null ? ""
                    : completion.path("choices").path(0).path("message").path("content").asText("");
            String label = objectMapper.readTree(content).path("intencion").asText("");
            return Optional.ofNullable(LABELS.get(label));
        } catch (Exception e) {
            log.warn("El modelo de intención no respondió: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private static List<Map<String, String>> examples(String... pairs) {
        List<Map<String, String>> messages = new ArrayList<>();
        for (int i = 0; i < pairs.length; i += 2) {
            messages.add(Map.of("role", "user", "content", pairs[i]));
            messages.add(Map.of("role", "assistant", "content", "{\"intencion\":\"" + pairs[i + 1] + "\"}"));
        }
        return List.copyOf(messages);
    }
}
