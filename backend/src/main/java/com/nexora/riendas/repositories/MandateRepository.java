package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.MandateStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MandateRepository extends JpaRepository<Mandate, UUID> {

    Optional<Mandate> findByAccountIdAndStatus(UUID accountId, MandateStatus status);

    Optional<Mandate> findByIdAndAccountId(UUID id, UUID accountId);

    Page<Mandate> findByAccountId(UUID accountId, Pageable pageable);
}
