package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.responses.AuditEventResponse;
import com.nexora.dtos.responses.HistoryItemResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.services.HistoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Historial y auditoría")
public class HistoryController {

    private final HistoryService historyService;
    private final CurrentUser currentUser;

    public HistoryController(HistoryService historyService, CurrentUser currentUser) {
        this.historyService = historyService;
        this.currentUser = currentUser;
    }

    @GetMapping("/history")
    @Operation(summary = "Pagos ENVIADO, CONFIRMADO o FALLIDO, del más nuevo al más viejo")
    public PageResponse<HistoryItemResponse> history(
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return historyService.history(currentUser.id(), page, size);
    }

    @GetMapping("/audit")
    @Operation(summary = "Bitácora de auditoría (filtro opcional por propuesta), del evento más nuevo al más viejo")
    public PageResponse<AuditEventResponse> audit(
            @RequestParam(required = false) UUID proposalId,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "50") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return historyService.audit(currentUser.id(), proposalId, page, size);
    }
}
