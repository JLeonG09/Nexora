package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.responses.AgentToolsResponses.ContactItem;
import com.nexora.dtos.responses.AgentToolsResponses.HistoryItem;
import com.nexora.dtos.responses.AgentToolsResponses.Items;
import com.nexora.dtos.responses.AgentToolsResponses.Limits;
import com.nexora.services.AgentToolsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/agent-tools")
@Tag(name = "Herramientas de la IA", description = "Solo lectura. Requieren X-Service-Key y X-User-Id.")
@SecurityRequirement(name = "X-Service-Key")
@SecurityRequirement(name = "X-User-Id")
public class AgentToolsController {

    private final AgentToolsService agentToolsService;
    private final CurrentUser currentUser;

    public AgentToolsController(AgentToolsService agentToolsService, CurrentUser currentUser) {
        this.agentToolsService = agentToolsService;
        this.currentUser = currentUser;
    }

    @GetMapping("/contacts")
    @Operation(summary = "Contactos activos (id y nombre)")
    public Items<ContactItem> contacts() {
        return agentToolsService.contacts(currentUser.id());
    }

    @GetMapping("/limits")
    @Operation(summary = "Límites del mandato activo; status SIN_MANDATO si no hay")
    public Limits limits() {
        return agentToolsService.limits(currentUser.id());
    }

    @GetMapping("/history")
    @Operation(summary = "Últimas propuestas, de la más nueva a la más vieja")
    public Items<HistoryItem> history(
            @RequestParam(defaultValue = "5") @Min(value = 1, message = "El límite mínimo es 1.")
            @Max(value = 20, message = "El límite máximo es 20.") int limit) {
        return agentToolsService.history(currentUser.id(), limit);
    }
}
