package com.nexora.repositories;

import com.nexora.entities.PaymentProposal;
import com.nexora.entities.enums.ProposalOrigin;
import com.nexora.entities.enums.ProposalStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentProposalRepository extends JpaRepository<PaymentProposal, UUID> {

    /** Lo gastado off-chain por la cuenta desde {@code since} en los estados indicados. */
    @Query("select coalesce(sum(p.amount), 0) from PaymentProposal p "
            + "where p.accountId = :accountId and p.status in :statuses and p.createdAt > :since")
    BigDecimal sumSpentSince(@Param("accountId") UUID accountId,
                             @Param("statuses") Collection<ProposalStatus> statuses,
                             @Param("since") Instant since);

    @Query("select coalesce(sum(p.amount), 0) from PaymentProposal p where p.accountId = :accountId "
            + "and p.status = com.nexora.entities.enums.ProposalStatus.CONFIRMADO and p.confirmedAt < :before")
    BigDecimal sumConfirmedFromAccountBefore(@Param("accountId") UUID accountId, @Param("before") Instant before);

    @Query("select coalesce(sum(p.amount), 0) from PaymentProposal p where p.contactId = :contactId "
            + "and p.status = com.nexora.entities.enums.ProposalStatus.CONFIRMADO and p.confirmedAt < :before")
    BigDecimal sumConfirmedToContactBefore(@Param("contactId") UUID contactId, @Param("before") Instant before);

    List<PaymentProposal> findByMandateIdAndStatus(UUID mandateId, ProposalStatus status);

    Optional<PaymentProposal> findByIdAndUserId(UUID id, UUID userId);

    Page<PaymentProposal> findByUserId(UUID userId, Pageable pageable);

    Page<PaymentProposal> findByUserIdAndStatus(UUID userId, ProposalStatus status, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentProposal p where p.id = :id")
    Optional<PaymentProposal> findByIdForUpdate(@Param("id") UUID id);

    List<PaymentProposal> findByStatusAndSentAtAfter(ProposalStatus status, Instant since);

    Page<PaymentProposal> findByUserIdAndStatusIn(UUID userId, Collection<ProposalStatus> statuses, Pageable pageable);

    boolean existsByAccountIdAndOriginAndTxHash(UUID accountId, ProposalOrigin origin, String txHash);

    long countByUserIdAndOriginAndCreatedAtAfter(UUID userId, ProposalOrigin origin, Instant since);
}
