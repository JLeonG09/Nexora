package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Contact;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContactRepository extends JpaRepository<Contact, UUID> {

    Optional<Contact> findByIdAndUserIdAndArchivedFalse(UUID id, UUID userId);

    Page<Contact> findByUserIdAndArchivedFalse(UUID userId, Pageable pageable);

    List<Contact> findByUserIdAndArchivedFalseOrderByNameAsc(UUID userId);

    List<Contact> findByUserIdAndNameNormalizedAndArchivedFalse(UUID userId, String nameNormalized);

    boolean existsByUserIdAndNameNormalizedAndArchivedFalse(UUID userId, String nameNormalized);

    boolean existsByUserIdAndNameNormalizedAndArchivedFalseAndIdNot(UUID userId, String nameNormalized, UUID id);
}
