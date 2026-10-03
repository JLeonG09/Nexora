package com.nexora.dtos.responses;

import java.time.Instant;
import java.util.UUID;

/** Elemento de GET /api/chat/conversations. {@code title} es el primer mensaje del usuario, recortado. */
public record ConversationSummaryResponse(UUID conversationId, String title, Instant startedAt,
                                          Instant lastMessageAt, long messageCount) {
}
