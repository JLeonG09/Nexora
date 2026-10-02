package com.nexora.controllers;

import com.nexora.config.AppProperties;
import com.nexora.config.CurrentUser;
import com.nexora.dtos.requests.RegisterAccountRequest;
import com.nexora.dtos.responses.AccountResponse;
import com.nexora.services.AccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts")
@Tag(name = "Cuentas")
public class AccountController {

    private final AccountService accountService;
    private final CurrentUser currentUser;
    private final AppProperties properties;

    public AccountController(AccountService accountService, CurrentUser currentUser, AppProperties properties) {
        this.accountService = accountService;
        this.currentUser = currentUser;
        this.properties = properties;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Registrar el smart account C... (después de kit.createWallet)")
    public AccountResponse register(@Valid @RequestBody RegisterAccountRequest request) {
        return AccountResponse.from(accountService.register(currentUser.id(), request), properties.explorerBaseUrl());
    }

    @GetMapping("/me")
    @Operation(summary = "Ver la cuenta del usuario")
    public AccountResponse me() {
        return AccountResponse.from(accountService.getByUser(currentUser.id()), properties.explorerBaseUrl());
    }
}
