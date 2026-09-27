package com.nexora.riendas.clients;

import com.nexora.riendas.dtos.ai.AiInterpretRequest;
import com.nexora.riendas.dtos.ai.AiInterpretResponse;
import com.nexora.riendas.exceptions.AiUnavailableException;

public interface AiClient {

    /** Llama a POST {IA}/agent/interpret. Sin reintentos. */
    AiInterpretResponse interpret(AiInterpretRequest request) throws AiUnavailableException;
}
