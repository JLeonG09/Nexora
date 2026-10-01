package com.nexora.riendas.controllers;

import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.responses.AgentKeyResponse;
import com.nexora.riendas.services.AgentKeyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/agent")
@Tag(name = "Llave del agente")
public class AgentKeyController {

    private final AgentKeyService agentKeyService;
    private final CurrentUser currentUser;

    public AgentKeyController(AgentKeyService agentKeyService, CurrentUser currentUser) {
        this.agentKeyService = agentKeyService;
        this.currentUser = currentUser;
    }

    @GetMapping("/public-key")
    @Operation(summary = "Llave pública del agente en la versión actual de la cuenta (para la regla on-chain)",
            description = "La versión sube en 1 cada vez que se revoca un mandato. Guarda keyVersion y publicKeyHex "
                    + "para enviarlos en POST /api/mandates.")
    public AgentKeyResponse publicKey() {
        return AgentKeyResponse.from(agentKeyService.currentKey(currentUser.id()));
    }
}
