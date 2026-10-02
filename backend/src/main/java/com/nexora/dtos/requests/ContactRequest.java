package com.nexora.dtos.requests;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ContactRequest(
        @NotBlank(message = "El nombre es obligatorio.")
        @Size(max = 40, message = "El nombre no puede tener más de 40 caracteres.")
        String name,

        @NotBlank(message = "La dirección es obligatoria.")
        @Pattern(regexp = "^[GC][A-Z2-7]{55}$", message = "La dirección debe empezar con G o C y tener 56 caracteres.")
        String stellarAddress,

        @Size(max = 140, message = "La nota no puede tener más de 140 caracteres.")
        String note) {
}
