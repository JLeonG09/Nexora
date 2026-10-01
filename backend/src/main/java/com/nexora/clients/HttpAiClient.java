package com.nexora.clients;

import com.nexora.config.AppProperties;
import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.exceptions.AiUnavailableException;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Cliente real de POST {IA}/agent/interpret (CONTRATOS_EQUIPO.md §4). Sin reintentos: timeout,
 * 4xx/5xx o JSON ilegible → {@link AiUnavailableException} (503 IA_NO_DISPONIBLE).
 */
@Component
@ConditionalOnProperty(name = "app.ai.mode", havingValue = "http")
public class HttpAiClient implements AiClient {

    static final String SERVICE_KEY_HEADER = "X-Service-Key";

    private final RestClient restClient;

    public HttpAiClient(AppProperties properties, RestClient.Builder builder) {
        AppProperties.Ai ai = properties.ai();
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(ai.connectTimeoutMs()))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(ai.readTimeoutMs()));
        this.restClient = builder
                .baseUrl(ai.baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(SERVICE_KEY_HEADER, ai.serviceKey())
                .build();
    }

    @Override
    public AiInterpretResponse interpret(AiInterpretRequest request) {
        try {
            AiInterpretResponse response = restClient.post()
                    .uri("/agent/interpret")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(AiInterpretResponse.class);
            if (response == null) {
                throw new AiUnavailableException("La IA respondió sin cuerpo");
            }
            return response;
        } catch (RestClientException e) {
            throw new AiUnavailableException("Fallo al llamar a la IA: " + e.getMessage(), e);
        }
    }
}
