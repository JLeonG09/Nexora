package com.nexora.dtos.responses;

import com.nexora.entities.ChatMessage;
import com.nexora.entities.enums.ChatMessageType;
import com.nexora.entities.enums.ChatRole;
import java.time.Instant;
import java.util.UUID;

/** Elemento de GET /api/chat/messages. */
public record ChatMessageResponse(UUID id, ChatRole role, ChatMessageType type, String text, UUID proposalId,
                                  Instant createdAt) {

    public static ChatMessageResponse from(ChatMessage message) {
        return new ChatMessageResponse(message.getId(), message.getRole(), message.getType(), message.getText(),
                message.getProposalId(), message.getCreatedAt());
    }
}
