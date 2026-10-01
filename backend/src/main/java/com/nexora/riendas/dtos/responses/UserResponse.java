package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.User;
import java.time.Instant;
import java.util.UUID;

public record UserResponse(UUID id, String displayName, String email, Instant createdAt) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getDisplayName(), user.getEmail(), user.getCreatedAt());
    }
}
