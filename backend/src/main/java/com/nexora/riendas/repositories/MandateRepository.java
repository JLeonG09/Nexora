package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Mandate;
import com.nexora.riendas.entities.enums.MandateStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MandateRepository extends JpaRepository<Mandate, UUID> {

    Optional<Mandate> findByAccountIdAndStatus(UUID accountId, MandateStatus status);
}
