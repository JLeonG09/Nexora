package com.nexora.riendas.clients;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.dtos.signer.SignRequest;
import com.nexora.riendas.dtos.signer.SignResponse;
import com.nexora.riendas.dtos.signer.SignerAgentKeyDto;
import com.nexora.riendas.exceptions.SignerRejectedException;
import com.nexora.riendas.exceptions.SignerUnavailableException;
import java.io.IOException;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Cliente real del firmante (CONTRATOS_EQUIPO.md §5). Sin reintentos: timeout, 5xx, 409 EN_PROCESO
 * o cuerpo ilegible → {@link SignerUnavailableException} (la propuesta queda ENVIADO y la consulta la
 * tarea programada). 400/401 en sign-and-submit → {@link SignerRejectedException} (FALLIDO con ese código).
 */
@Component
@ConditionalOnProperty(name = "app.signer.mode", havingValue = "http")
public class HttpSignerClient implements SignerClient {

    static final String SERVICE_KEY_HEADER = "X-Service-Key";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public HttpSignerClient(AppProperties properties, RestClient.Builder builder, ObjectMapper objectMapper) {
        AppProperties.Signer signer = properties.signer();
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(signer.connectTimeoutMs()))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(signer.readTimeoutMs()));
        this.restClient = builder
                .baseUrl(signer.baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(SERVICE_KEY_HEADER, signer.serviceKey())
                .build();
        this.objectMapper = objectMapper;
    }

    @Override
    public SignerAgentKeyDto getAgentKey(String smartAccountAddress, int keyVersion) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/agent-key")
                            .queryParam("smartAccountAddress", smartAccountAddress)
                            .queryParam("keyVersion", keyVersion)
                            .build())
                    .accept(MediaType.APPLICATION_JSON)
                    .exchange((request, response) -> {
                        if (response.getStatusCode().is2xxSuccessful()) {
                            return readBody(response.getBody().readAllBytes(), SignerAgentKeyDto.class);
                        }
                        throw unavailable(response.getStatusCode(), response.getBody().readAllBytes());
                    });
        } catch (RestClientException e) {
            throw new SignerUnavailableException("Fallo al pedir la llave al firmante: " + e.getMessage(), e);
        }
    }

    @Override
    public SignResponse signAndSubmit(SignRequest signRequest) {
        try {
            return restClient.post()
                    .uri("/sign-and-submit")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .body(signRequest)
                    .exchange((request, response) -> {
                        HttpStatusCode status = response.getStatusCode();
                        byte[] body = response.getBody().readAllBytes();
                        if (status.is2xxSuccessful()) {
                            return readBody(body, SignResponse.class);
                        }
                        if (status.value() == HttpStatus.BAD_REQUEST.value()
                                || status.value() == HttpStatus.UNAUTHORIZED.value()) {
                            JsonNode error = readError(body);
                            throw new SignerRejectedException(text(error, "code", "SOLICITUD_INVALIDA"),
                                    text(error, "message", "El firmante rechazó la solicitud."));
                        }
                        throw unavailable(status, body);
                    });
        } catch (RestClientException e) {
            throw new SignerUnavailableException("Fallo al llamar a sign-and-submit: " + e.getMessage(), e);
        }
    }

    @Override
    public Optional<SignResponse> getTransaction(UUID proposalId) {
        try {
            return restClient.get()
                    .uri("/transactions/{proposalId}", proposalId)
                    .accept(MediaType.APPLICATION_JSON)
                    .exchange((request, response) -> {
                        HttpStatusCode status = response.getStatusCode();
                        byte[] body = response.getBody().readAllBytes();
                        if (status.is2xxSuccessful()) {
                            return Optional.of(readBody(body, SignResponse.class));
                        }
                        if (status.value() == HttpStatus.NOT_FOUND.value()) {
                            return Optional.<SignResponse>empty();
                        }
                        throw unavailable(status, body);
                    });
        } catch (RestClientException e) {
            throw new SignerUnavailableException("Fallo al consultar la transacción: " + e.getMessage(), e);
        }
    }

    private <T> T readBody(byte[] body, Class<T> type) {
        try {
            T value = objectMapper.readValue(body, type);
            if (value == null) {
                throw new SignerUnavailableException("El firmante respondió sin cuerpo");
            }
            return value;
        } catch (IOException e) {
            throw new SignerUnavailableException("El firmante respondió un JSON ilegible", e);
        }
    }

    private JsonNode readError(byte[] body) {
        try {
            return objectMapper.readTree(body);
        } catch (IOException e) {
            return null;
        }
    }

    private SignerUnavailableException unavailable(HttpStatusCode status, byte[] body) {
        JsonNode error = readError(body);
        return new SignerUnavailableException("El firmante respondió " + status.value() + " "
                + text(error, "code", "") + " " + text(error, "message", ""));
    }

    private static String text(JsonNode node, String field, String fallback) {
        if (node == null || !node.hasNonNull(field) || node.get(field).asText().isBlank()) {
            return fallback;
        }
        return node.get(field).asText();
    }
}
