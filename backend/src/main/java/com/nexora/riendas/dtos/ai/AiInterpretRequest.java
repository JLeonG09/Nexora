package com.nexora.riendas.dtos.ai;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Body de POST {IA}/agent/interpret (CONTRATOS_EQUIPO.md §4.1). */
public record AiInterpretRequest(
        UUID requestId,
        UUID userId,
        UUID conversationId,
        String message,
        String locale,
        Instant now,
        AiMandateDto mandate,
        List<AiContactDto> contacts,
        List<AiHistoryItemDto> history,
        List<String> tools) {
}
