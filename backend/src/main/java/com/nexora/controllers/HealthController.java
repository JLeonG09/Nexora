package com.nexora.controllers;

import com.nexora.config.AppProperties;
import com.nexora.dtos.responses.HealthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
@Tag(name = "Salud")
public class HealthController {

    private final AppProperties properties;

    public HealthController(AppProperties properties) {
        this.properties = properties;
    }

    @GetMapping
    @SecurityRequirements
    @Operation(summary = "Salud del backend y modo de los clientes")
    public HealthResponse health() {
        return new HealthResponse("OK", properties.ai().mode(), properties.signer().mode(), properties.network());
    }
}
