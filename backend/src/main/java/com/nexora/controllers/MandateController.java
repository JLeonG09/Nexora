package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.requests.CreateMandateRequest;
import com.nexora.dtos.requests.RevokeMandateRequest;
import com.nexora.dtos.responses.LimitsResponse;
import com.nexora.dtos.responses.MandateResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.services.MandateService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mandates")
@Tag(name = "Mandato")
public class MandateController {

    private final MandateService mandateService;
    private final CurrentUser currentUser;

    public MandateController(MandateService mandateService, CurrentUser currentUser) {
        this.mandateService = mandateService;
        this.currentUser = currentUser;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Registrar mandato (después de crear la regla on-chain)",
            description = "keyVersion y agentPublicKeyHex deben ser los de GET /api/agent/public-key; "
                    + "si no, 409 LLAVE_DESACTUALIZADA.")
    public MandateResponse create(@Valid @RequestBody CreateMandateRequest request) {
        return MandateResponse.from(mandateService.create(currentUser.id(), request));
    }

    @GetMapping("/active")
    @Operation(summary = "Ver mandato activo")
    public MandateResponse active() {
        return MandateResponse.from(mandateService.getActive(currentUser.id()));
    }

    @GetMapping("/active/limits")
    @Operation(summary = "Límites disponibles (gastado y restante en las últimas 24 horas)")
    public LimitsResponse limits() {
        return mandateService.limits(currentUser.id());
    }

    @GetMapping
    @Operation(summary = "Lista de mandatos (incluye revocados y expirados)")
    public PageResponse<MandateResponse> list(
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "20") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return PageResponse.from(mandateService.list(currentUser.id(), page, size), MandateResponse::from);
    }

    @PostMapping("/{id}/revoke")
    @Operation(summary = "Revocar mandato",
            description = "Primera llamada sin hash: bloquea al agente y rota la llave. Segunda llamada con el "
                    + "revokeTxHash de kit.rules.remove: solo lo guarda (idempotente).")
    public MandateResponse revoke(@PathVariable UUID id,
                                  @Valid @RequestBody(required = false) RevokeMandateRequest request) {
        String revokeTxHash = request == null ? null : request.revokeTxHash();
        return MandateResponse.from(mandateService.revoke(currentUser.id(), id, revokeTxHash));
    }
}
