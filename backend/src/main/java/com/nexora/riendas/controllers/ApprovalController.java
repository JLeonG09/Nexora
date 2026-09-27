package com.nexora.riendas.controllers;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.requests.RejectApprovalRequest;
import com.nexora.riendas.dtos.responses.ApprovalDecisionResponse;
import com.nexora.riendas.dtos.responses.ApprovalResponse;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.entities.PaymentProposal;
import com.nexora.riendas.entities.enums.ApprovalStatus;
import com.nexora.riendas.services.ApprovalService;
import com.nexora.riendas.services.PaymentProposalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/approvals")
@Tag(name = "Aprobaciones")
public class ApprovalController {

    private final ApprovalService approvalService;
    private final PaymentProposalService proposalService;
    private final CurrentUser currentUser;
    private final AppProperties properties;

    public ApprovalController(ApprovalService approvalService, PaymentProposalService proposalService,
                              CurrentUser currentUser, AppProperties properties) {
        this.approvalService = approvalService;
        this.proposalService = proposalService;
        this.currentUser = currentUser;
        this.properties = properties;
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

    @PostMapping("/{id}/approve")
    @Operation(summary = "Aprobar",
            description = "Revalida mandato vigente, tope por transacción y tope diario. Si ya no pasan, la "
                    + "aprobación queda RECHAZADA y la propuesta RECHAZADO con el motivo.")
    public ApprovalDecisionResponse approve(@PathVariable UUID id) {
        PaymentProposalService.Decision decision = proposalService.approve(currentUser.id(), id);
        PaymentProposal proposal = decision.signRequest() == null
                ? decision.proposal()
                : proposalService.submitOrThrow(decision.signRequest());
        return ApprovalDecisionResponse.from(decision.approval(), proposal, properties.explorerBaseUrl());
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Rechazar")
    public ApprovalDecisionResponse reject(@PathVariable UUID id,
                                           @Valid @RequestBody(required = false) RejectApprovalRequest request) {
        PaymentProposalService.Decision decision = proposalService.rejectByUser(currentUser.id(), id,
                request == null ? null : request.reason());
        return ApprovalDecisionResponse.from(decision.approval(), decision.proposal(), properties.explorerBaseUrl());
    }
}
