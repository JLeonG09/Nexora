package com.nexora.riendas.dtos.responses;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Respuestas de /api/agent-tools/** (CONTRATOS_EQUIPO.md §4.4). Solo lectura y sin direcciones Stellar. */
public final class AgentToolsResponses {

    public static final String SIN_MANDATO = "SIN_MANDATO";

    private AgentToolsResponses() {
    }

    public record Items<T>(List<T> items) {
    }

    public record ContactItem(UUID id, String name) {
    }

    public record Limits(
            String status,
            String asset,
            String dailyLimit,
            String spentLast24h,
            String availableLast24h,
            String perTxLimit,
            String approvalThreshold,
            Instant expiresAt) {

        public static Limits none() {
            return new Limits(SIN_MANDATO, null, null, null, null, null, null, null);
        }

        public static Limits from(LimitsResponse limits) {
            return new Limits(limits.status().name(), limits.asset(), limits.dailyLimit(), limits.spentLast24h(),
                    limits.availableLast24h(), limits.perTxLimit(), limits.approvalThreshold(), limits.expiresAt());
        }
    }

    public record HistoryItem(
            UUID proposalId,
            String contactName,
            String amount,
            String asset,
            String memo,
            String status,
            Instant createdAt) {
    }
}
