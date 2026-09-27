package com.nexora.riendas.exceptions;

import java.time.Instant;
import java.util.List;

public record ErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        List<FieldErrorDetail> details,
        String traceId) {

    public record FieldErrorDetail(String field, String message) {
    }
}
