package com.nexora.controllers;

import com.nexora.config.CurrentUser;
import com.nexora.dtos.requests.ContactRequest;
import com.nexora.dtos.responses.ContactResponse;
import com.nexora.dtos.responses.PageResponse;
import com.nexora.services.ContactService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/contacts")
@Tag(name = "Contactos")
public class ContactController {

    private final ContactService contactService;
    private final CurrentUser currentUser;

    public ContactController(ContactService contactService, CurrentUser currentUser) {
        this.contactService = contactService;
        this.currentUser = currentUser;
    }

    @GetMapping
    @Operation(summary = "Listar contactos (sin archivados)")
    public PageResponse<ContactResponse> list(
            @RequestParam(defaultValue = "0") @Min(value = 0, message = "La página no puede ser negativa.") int page,
            @RequestParam(defaultValue = "50") @Min(value = 1, message = "El tamaño mínimo es 1.")
            @Max(value = 100, message = "El tamaño máximo es 100.") int size) {
        return PageResponse.from(contactService.list(currentUser.id(), page, size), ContactResponse::from);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Crear contacto (nombre único sin distinguir mayúsculas ni tildes)")
    public ContactResponse create(@Valid @RequestBody ContactRequest request) {
        return ContactResponse.from(contactService.create(currentUser.id(), request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Ver contacto")
    public ContactResponse get(@PathVariable UUID id) {
        return ContactResponse.from(contactService.get(currentUser.id(), id));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Editar contacto")
    public ContactResponse update(@PathVariable UUID id, @Valid @RequestBody ContactRequest request) {
        return ContactResponse.from(contactService.update(currentUser.id(), id, request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Archivar contacto (borrado lógico; ya no puede recibir pagos)")
    public void delete(@PathVariable UUID id) {
        contactService.archive(currentUser.id(), id);
    }
}
