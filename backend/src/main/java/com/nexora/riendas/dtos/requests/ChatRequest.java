package com.nexora.riendas.dtos.requests;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record ChatRequest(
        @NotBlank(message = "El mensaje no puede estar vacío.")
        @Size(max = 500, message = "El mensaje no puede tener más de 500 caracteres.")
        String message,

        UUID conversationId) {
}
