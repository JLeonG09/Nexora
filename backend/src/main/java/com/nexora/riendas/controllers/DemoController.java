package com.nexora.riendas.controllers;

import com.nexora.riendas.config.AppProperties;
import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.requests.AttackDemoRequest;
import com.nexora.riendas.dtos.responses.AttackDemoResponse;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.services.Money;
import com.nexora.riendas.services.PaymentProposalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/demo")
@Tag(name = "Demo")
public class DemoController {

    private final PaymentProposalService proposalService;
    private final CurrentUser currentUser;
    private final AppProperties properties;

    public DemoController(PaymentProposalService proposalService, CurrentUser currentUser, AppProperties properties) {
        this.proposalService = proposalService;
        this.currentUser = currentUser;
        this.properties = properties;
    }

    @PostMapping("/attack")
    @Operation(summary = "Modo atacante",
            description = "Se salta a propósito las validaciones del backend y llama directo al firmante, para "
                    + "mostrar que la red frena el pago. Solo si DEMO_ATTACK_ENABLED=true; si no, 404.")
    public AttackDemoResponse attack(@Valid @RequestBody AttackDemoRequest request) {
        if (!properties.demoAttackEnabled()) {
            throw new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO);
        }
        BigDecimal amount = Money.parse(request.amount());
        if (amount.signum() <= 0) {
            throw new ApiException(ErrorCode.VALIDACION_FALLIDA, "El monto debe ser mayor que cero.");
        }
        var signRequest = proposalService.prepareAttack(currentUser.id(), request.destinationAddress(), amount);
        return AttackDemoResponse.from(proposalService.submitOrThrow(signRequest));
    }
}
