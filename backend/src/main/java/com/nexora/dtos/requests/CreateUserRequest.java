package com.nexora.dtos.requests;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank(message = "El nombre es obligatorio.")
        @Size(max = 60, message = "El nombre no puede tener más de 60 caracteres.")
        String displayName,

        @Email(message = "El correo no es válido.")
        @Size(max = 120, message = "El correo no puede tener más de 120 caracteres.")
        String email) {
}
