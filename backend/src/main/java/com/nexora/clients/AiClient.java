package com.nexora.clients;

import com.nexora.dtos.ai.AiInterpretRequest;
import com.nexora.dtos.ai.AiInterpretResponse;
import com.nexora.exceptions.AiUnavailableException;

public interface AiClient {

    /** Llama a POST {IA}/agent/interpret. Sin reintentos. */
    AiInterpretResponse interpret(AiInterpretRequest request) throws AiUnavailableException;
}
