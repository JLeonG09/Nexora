package com.nexora.riendas.dtos.requests;

import jakarta.validation.constraints.Size;

public record RejectApprovalRequest(
        @Size(max = 200, message = "El motivo no puede pasar de 200 caracteres.")
        String reason) {
}
