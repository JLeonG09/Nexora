package com.nexora.riendas.services;

import com.nexora.riendas.dtos.requests.CreateUserRequest;
import com.nexora.riendas.entities.User;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.UserRepository;
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
