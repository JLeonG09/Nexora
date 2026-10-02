package com.nexora.dtos.responses;

import com.nexora.entities.ChatMessage;
import com.nexora.entities.enums.ChatMessageType;
import com.nexora.entities.enums.ChatRole;
import java.time.Instant;
import java.util.UUID;

public record ChatReplyDto(UUID id, ChatRole role, ChatMessageType type, String text, Instant createdAt) {

    public static ChatReplyDto from(ChatMessage message) {
        return new ChatReplyDto(message.getId(), message.getRole(), message.getType(), message.getText(),
                message.getCreatedAt());
    }
}
