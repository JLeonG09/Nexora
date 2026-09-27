package com.nexora.riendas.controllers;

import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.dtos.responses.ProposalResponse;
import com.nexora.riendas.entities.enums.ProposalStatus;
import com.nexora.riendas.services.PaymentProposalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/proposals")
@Tag(name = "Propuestas")
public class ProposalController {

    private final PaymentProposalService proposalService;
    private final CurrentUser currentUser;

    public ProposalController(PaymentProposalService proposalService, CurrentUser currentUser) {
        this.proposalService = proposalService;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(summary = "Listar propuestas (filtro opcional por estado), de la más nueva a la más vieja")
    public PageResponse<ProposalResponse> list(
            @RequestParam(required = false) ProposalStatus status,
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return proposalService.list(currentUser.id(), status, page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Ver propuesta")
    public ProposalResponse get(@PathVariable UUID id) {
        return proposalService.get(currentUser.id(), id);
    }
}
