package com.nexora.repositories;

import com.nexora.entities.Approval;
import com.nexora.entities.enums.ApprovalStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalRepository extends JpaRepository<Approval, UUID> {

    Optional<Approval> findByProposalId(UUID proposalId);

    Optional<Approval> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByIdAndUserId(UUID id, UUID userId);

    List<Approval> findByStatusAndExpiresAtBefore(ApprovalStatus status, Instant now);

    Optional<Approval> findByProposalIdAndStatus(UUID proposalId, ApprovalStatus status);

    List<Approval> findByProposalIdIn(Collection<UUID> proposalIds);

    Page<Approval> findByUserId(UUID userId, Pageable pageable);

    Page<Approval> findByUserIdAndStatus(UUID userId, ApprovalStatus status, Pageable pageable);
}
