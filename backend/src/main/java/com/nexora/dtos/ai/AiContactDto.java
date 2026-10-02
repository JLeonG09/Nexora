package com.nexora.dtos.ai;

import java.util.UUID;

/** Solo id y nombre: la IA nunca ve direcciones. */
public record AiContactDto(UUID id, String name) {
}
