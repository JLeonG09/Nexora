package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.ChatMessage;
import com.nexora.riendas.entities.enums.ChatMessageType;
import com.nexora.riendas.entities.enums.ChatRole;
import java.time.Instant;
import java.util.UUID;

public record ChatReplyDto(UUID id, ChatRole role, ChatMessageType type, String text, Instant createdAt) {

    public static ChatReplyDto from(ChatMessage message) {
        return new ChatReplyDto(message.getId(), message.getRole(), message.getType(), message.getText(),
                message.getCreatedAt());
    }
}
