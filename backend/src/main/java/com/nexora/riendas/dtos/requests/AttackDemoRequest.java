package com.nexora.riendas.dtos.requests;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AttackDemoRequest(
        @NotBlank(message = "La dirección de destino es obligatoria.")
        @Pattern(regexp = "^G[A-Z2-7]{55}$", message = "La dirección debe ser una cuenta Stellar G de 56 caracteres.")
        String destinationAddress,

        @NotBlank(message = "El monto es obligatorio.")
        @Pattern(regexp = "^[0-9]+(\\.[0-9]{1,7})?$", message = "El monto debe ser un número con hasta 7 decimales.")
        String amount) {
}
