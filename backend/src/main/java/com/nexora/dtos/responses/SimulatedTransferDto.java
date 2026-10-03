package com.nexora.dtos.responses;

/**
 * Saldos de las dos cuentas ficticias antes y después de un pago, solo con el firmante simulado
 * ({@code SIGNER_MODE=mock}). Nada de esto existe en Stellar: es para que la demo muestre el dinero moverse.
 */
public record SimulatedTransferDto(
        String asset,
        String fromAddress,
        String fromBefore,
        String fromAfter,
        String toName,
        String toAddress,
        String toBefore,
        String toAfter) {
}
