package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.responses.AlertResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.dtos.responses.ReportAlertResponse;
import com.nexora.entities.enums.AlertStatus;
import com.nexora.services.AlertService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/alerts")
@Tag(name = "Alertas", description = "Movimientos on-chain que no hizo el agente.")
public class AlertController {

    private final AlertService alertService;
    private final CurrentUser currentUser;

    public AlertController(AlertService alertService, CurrentUser currentUser) {
        this.alertService = alertService;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(summary = "Listar alertas (filtro opcional por estado), de la más nueva a la más vieja")
    public PageResponse<AlertResponse> list(
            @RequestParam(required = false) AlertStatus status,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return alertService.list(currentUser.id(), status, page, size);
    }

    @PostMapping("/{id}/confirm")
    @Operation(summary = "Fui yo", description = "El usuario hizo ese pago. La alerta queda RECONOCIDA.")
    public AlertResponse confirm(@PathVariable UUID id) {
        return alertService.confirm(currentUser.id(), id);
    }

    @PostMapping("/{id}/report")
    @Operation(summary = "No fui yo",
            description = "Se asume que la llave del agente se filtró: revoca el mandato activo con "
                    + "LLAVE_COMPROMETIDA, rechaza los pendientes y rota la llave.")
    public ReportAlertResponse report(@PathVariable UUID id) {
        return alertService.report(currentUser.id(), id);
    }
}
