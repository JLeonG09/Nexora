package com.nexora.repositories;

import com.nexora.entities.Alert;
import com.nexora.entities.enums.AlertStatus;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AlertRepository extends JpaRepository<Alert, UUID> {

    boolean existsByAccountIdAndTxHash(UUID accountId, String txHash);

    boolean existsByIdAndUserId(UUID id, UUID userId);

    Page<Alert> findByUserId(UUID userId, Pageable pageable);

    Page<Alert> findByUserIdAndStatus(UUID userId, AlertStatus status, Pageable pageable);
}
