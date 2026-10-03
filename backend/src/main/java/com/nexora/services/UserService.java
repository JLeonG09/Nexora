package com.nexora.services;

import com.nexora.entities.User;
import com.nexora.entities.enums.AuditActor;
import com.nexora.entities.enums.AuditEventType;
import com.nexora.exceptions.ApiException;
import com.nexora.exceptions.ErrorCode;
import com.nexora.repositories.UserRepository;
import java.util.Locale;
import java.util.Optional;
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

    /**
     * Crea el usuario con el {@code sub} del token, o devuelve el que ya está vinculado a ese DID.
     * El correo sale del token si viene; el cuerpo no identifica a nadie.
     */
    @Transactional
    public User createOrLink(String privyDid, String emailFromToken, String displayName) {
        if (privyDid == null || privyDid.isBlank() || privyDid.length() > 64) {
            throw new ApiException(ErrorCode.USUARIO_NO_IDENTIFICADO);
        }
        Optional<User> existing = userRepository.findByPrivyDid(privyDid);
        if (existing.isPresent()) {
            return existing.get();
        }
        String email = normalizeEmail(emailFromToken);
        if (email != null && userRepository.existsByEmail(email)) {
            throw ApiException.field(ErrorCode.VALIDACION_FALLIDA, "email", "Ese correo ya está registrado.");
        }
        User user = new User();
        user.setPrivyDid(privyDid);
        user.setDisplayName(displayName.trim());
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
