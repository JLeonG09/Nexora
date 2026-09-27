package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Approval;
import com.nexora.riendas.entities.enums.ApprovalStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalRepository extends JpaRepository<Approval, UUID> {

    Optional<Approval> findByProposalId(UUID proposalId);

    Optional<Approval> findByProposalIdAndStatus(UUID proposalId, ApprovalStatus status);
}
