package com.nexora.riendas.services;

import com.nexora.riendas.dtos.requests.ContactRequest;
import com.nexora.riendas.entities.Contact;
import com.nexora.riendas.entities.enums.AuditActor;
import com.nexora.riendas.entities.enums.AuditEventType;
import com.nexora.riendas.exceptions.ApiException;
import com.nexora.riendas.exceptions.ErrorCode;
import com.nexora.riendas.repositories.ContactRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lista blanca de destinatarios. El borrado es lógico (archivado) para no romper el historial. */
@Service
public class ContactService {

    private final ContactRepository contactRepository;
    private final AuditService auditService;

    public ContactService(ContactRepository contactRepository, AuditService auditService) {
        this.contactRepository = contactRepository;
        this.auditService = auditService;
    }

    @Transactional
    public Contact create(UUID userId, ContactRequest request) {
        String name = request.name().trim();
        String normalized = normalizedName(name);
        if (contactRepository.existsByUserIdAndNameNormalizedAndArchivedFalse(userId, normalized)) {
            throw duplicate();
        }
        Contact contact = new Contact();
        contact.setUserId(userId);
        apply(contact, name, normalized, request);
        Contact saved = saveUnique(contact);
        auditService.record(AuditEventType.CONTACTO_CREADO, AuditActor.USUARIO, userId, null, null,
                "Contacto creado: " + name + ".", Map.of("contactId", saved.getId().toString()));
        return saved;
    }

    @Transactional
    public Contact update(UUID userId, UUID contactId, ContactRequest request) {
        Contact contact = get(userId, contactId);
        String name = request.name().trim();
        String normalized = normalizedName(name);
        if (contactRepository.existsByUserIdAndNameNormalizedAndArchivedFalseAndIdNot(userId, normalized, contactId)) {
            throw duplicate();
        }
        apply(contact, name, normalized, request);
        Contact saved = saveUnique(contact);
        auditService.record(AuditEventType.CONTACTO_EDITADO, AuditActor.USUARIO, userId, null, null,
                "Contacto editado: " + name + ".", Map.of("contactId", contactId.toString()));
        return saved;
    }

    @Transactional
    public void archive(UUID userId, UUID contactId) {
        Contact contact = get(userId, contactId);
        contact.setArchived(true);
        auditService.record(AuditEventType.CONTACTO_ARCHIVADO, AuditActor.USUARIO, userId, null, null,
                "Contacto archivado: " + contact.getName() + ".", Map.of("contactId", contactId.toString()));
    }

    @Transactional(readOnly = true)
    public Contact get(UUID userId, UUID contactId) {
        return contactRepository.findByIdAndUserIdAndArchivedFalse(contactId, userId)
                .orElseThrow(() -> new ApiException(ErrorCode.RECURSO_NO_ENCONTRADO, "No encontramos ese contacto."));
    }

    @Transactional(readOnly = true)
    public Page<Contact> list(UUID userId, int page, int size) {
        return contactRepository.findByUserIdAndArchivedFalse(userId,
                PageRequest.of(page, size, Sort.by("name").ascending()));
    }

    @Transactional(readOnly = true)
    public List<Contact> listAll(UUID userId) {
        return contactRepository.findByUserIdAndArchivedFalseOrderByNameAsc(userId);
    }

    private static void apply(Contact contact, String name, String normalized, ContactRequest request) {
        contact.setName(name);
        contact.setNameNormalized(normalized);
        contact.setStellarAddress(request.stellarAddress().trim());
        contact.setNote(request.note() == null || request.note().isBlank() ? null : request.note().trim());
    }

    private static String normalizedName(String name) {
        String normalized = TextNormalizer.normalize(name);
        if (normalized.isEmpty()) {
            throw ApiException.field(ErrorCode.VALIDACION_FALLIDA, "name", "El nombre es obligatorio.");
        }
        return normalized;
    }

    /** El índice único parcial cubre la carrera entre dos altas simultáneas con el mismo nombre. */
    private Contact saveUnique(Contact contact) {
        try {
            return contactRepository.saveAndFlush(contact);
        } catch (DataIntegrityViolationException e) {
            throw duplicate();
        }
    }

    private static ApiException duplicate() {
        return ApiException.field(ErrorCode.CONTACTO_DUPLICADO, "name", ErrorCode.CONTACTO_DUPLICADO.defaultMessage());
    }
}
