package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.requests.CreateUserRequest;
import com.nexora.dtos.responses.UserResponse;
import com.nexora.repositories.UserRepository;
import com.nexora.services.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@Tag(name = "Usuarios")
public class UserController {

    private final UserService userService;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;

    public UserController(UserService userService, UserRepository userRepository, CurrentUser currentUser) {
        this.userService = userService;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
    }

    @PostMapping
    @Operation(summary = "Crear o vincular el usuario del access token de Privy")
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request,
                                               @AuthenticationPrincipal Jwt jwt) {
        boolean existed = userRepository.existsByPrivyDid(jwt.getSubject());
        var user = userService.createOrLink(jwt.getSubject(), jwt.getClaimAsString("email"), request.displayName());
        HttpStatus status = existed ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(UserResponse.from(user));
    }

    @GetMapping("/me")
    @Operation(summary = "Ver usuario actual")
    public UserResponse me() {
        return UserResponse.from(userService.get(currentUser.id()));
    }
}
