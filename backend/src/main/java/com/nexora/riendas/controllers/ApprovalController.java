package com.nexora.riendas.controllers;

import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.responses.ApprovalResponse;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.entities.enums.ApprovalStatus;
import com.nexora.riendas.services.ApprovalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/approvals")
@Tag(name = "Aprobaciones")
public class ApprovalController {

    private final ApprovalService approvalService;
    private final CurrentUser currentUser;

    public ApprovalController(ApprovalService approvalService, CurrentUser currentUser) {
        this.approvalService = approvalService;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(summary = "Bandeja de aprobaciones (filtro opcional por estado)")
    public PageResponse<ApprovalResponse> list(
            @RequestParam(required = false) ApprovalStatus status,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return approvalService.list(currentUser.id(), status, page, size);
    }
}
