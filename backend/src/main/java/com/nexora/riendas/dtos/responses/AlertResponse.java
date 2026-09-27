package com.nexora.riendas.dtos.responses;

import com.nexora.riendas.entities.Alert;
import com.nexora.riendas.entities.enums.AlertStatus;
import com.nexora.riendas.services.Money;
import java.time.Instant;
import java.util.UUID;

/** Alerta de movimiento no reconocido (CONTRATOS_EQUIPO.md §3.10). */
public record AlertResponse(
        UUID id,
        AlertStatus status,
        String txHash,
        Long ledger,
        String destinationAddress,
        String amount,
        String asset,
        Instant occurredAt,
        Instant detectedAt,
        String explorerUrl,
        UUID mandateId,
        String message,
        Instant decidedAt) {

    public static AlertResponse from(Alert alert, String explorerBaseUrl) {
        return new AlertResponse(alert.getId(), alert.getStatus(), alert.getTxHash(), alert.getLedger(),
                alert.getDestinationAddress(), Money.format(alert.getAmount()), alert.getAssetCode(),
                alert.getOccurredAt(), alert.getDetectedAt(),
                ProposalResponse.explorerTxUrl(explorerBaseUrl, alert.getTxHash()), alert.getMandateId(),
                "Detectamos un pago de " + Money.display(alert.getAmount()) + " USDC a "
                        + shortAddress(alert.getDestinationAddress()) + " que no hizo el agente. ¿Fuiste tú?",
                alert.getDecidedAt());
    }

    static String shortAddress(String address) {
        return address == null || address.length() <= 12
                ? address : address.substring(0, 5) + "…" + address.substring(address.length() - 5);
    }
}
