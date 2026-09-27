package com.nexora.riendas.controllers;

import com.nexora.riendas.config.CurrentUser;
import com.nexora.riendas.dtos.requests.ChatRequest;
import com.nexora.riendas.dtos.responses.ChatMessageResponse;
import com.nexora.riendas.dtos.responses.ChatResponse;
import com.nexora.riendas.dtos.responses.PageResponse;
import com.nexora.riendas.services.ChatService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/chat")
@Tag(name = "Chat")
public class ChatController {

    private final ChatService chatService;
    private final CurrentUser currentUser;

    public ChatController(ChatService chatService, CurrentUser currentUser) {
        this.chatService = chatService;
        this.currentUser = currentUser;
    }

    @PostMapping
    @Operation(summary = "Enviar mensaje al agente",
            description = "Un rechazo por validación no es un error HTTP: responde 200 con la propuesta en RECHAZADO.")
    public ChatResponse send(@Valid @RequestBody ChatRequest request) {
        return chatService.chat(currentUser.id(), request);
    }

    @GetMapping("/messages")
    @Operation(summary = "Historial del chat (del más viejo al más nuevo)")
    public PageResponse<ChatMessageResponse> messages(
            @RequestParam(required = false) UUID conversationId,
            @RequestParam(defaultValue = "50") @Min(value = 1, message = "El límite mínimo es 1.")
            @Max(value = 100, message = "El límite máximo es 100.") int limit) {
        return chatService.messages(currentUser.id(), conversationId, limit);
    }
}
