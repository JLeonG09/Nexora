package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.PaymentProposal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentProposalRepository extends JpaRepository<PaymentProposal, UUID> {
}
