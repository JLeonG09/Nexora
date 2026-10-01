package com.nexora.riendas.dtos.requests;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterAccountRequest(
        @NotBlank(message = "La dirección del smart account es obligatoria.")
        @Pattern(regexp = "^C[A-Z2-7]{55}$", message = "La dirección debe empezar con C y tener 56 caracteres.")
        String smartAccountAddress,

        @Size(max = 512, message = "El credentialId no puede tener más de 512 caracteres.")
        String credentialId,

        @Pattern(regexp = "^TESTNET$", message = "Por ahora solo se admite la red TESTNET.")
        String network) {
}
