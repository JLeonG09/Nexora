package com.nexora.services;

import com.nexora.dtos.requests.CreateUserRequest;
import com.nexora.entities.User;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.repositories.UserRepository;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final AuditService auditService;

    public UserService(UserRepository userRepository, AuditService auditService) {
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional
    public User create(CreateUserRequest request) {
        String email = normalizeEmail(request.email());
        if (email != null && userRepository.existsByEmail(email)) {
            throw ApiException.field(ErrorCode.VALIDACION_FALLIDA, "email", "Ese correo ya está registrado.");
        }
        User user = new User();
        user.setDisplayName(request.displayName().trim());
        user.setEmail(email);
        User saved = userRepository.save(user);
        auditService.record(AuditEventType.USUARIO_CREADO, AuditActor.USUARIO, saved.getId(),
                "Usuario creado: " + saved.getDisplayName() + ".");
        return saved;
    }

    // TODO(auth real): login simulado del MVP; cualquiera que conozca el correo entra.
    @Transactional(readOnly = true)
    public User login(String rawEmail) {
        return userRepository.findByEmail(normalizeEmail(rawEmail))
                .orElseThrow(() -> ApiException.field(ErrorCode.RECURSO_NO_ENCONTRADO, "email",
                        "No hay ninguna cuenta con ese correo."));
    }

    @Transactional(readOnly = true)
    public User get(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO));
    }

    private static String normalizeEmail(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
