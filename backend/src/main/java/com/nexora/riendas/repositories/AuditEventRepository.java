package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.AuditEvent;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditEventRepository extends JpaRepository<AuditEvent, UUID> {

    Page<AuditEvent> findByUserId(UUID userId, Pageable pageable);

    Page<AuditEvent> findByUserIdAndProposalId(UUID userId, UUID proposalId, Pageable pageable);
}
