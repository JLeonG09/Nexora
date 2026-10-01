package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.Contact;
import java.time.Instant;
import java.util.UUID;

public record ContactResponse(
        UUID id,
        String name,
        String stellarAddress,
        String note,
        Instant createdAt,
        Instant updatedAt) {

    public static ContactResponse from(Contact contact) {
        return new ContactResponse(contact.getId(), contact.getName(), contact.getStellarAddress(), contact.getNote(),
                contact.getCreatedAt(), contact.getUpdatedAt());
    }
}
