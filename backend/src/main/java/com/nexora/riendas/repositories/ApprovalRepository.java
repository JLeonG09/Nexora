package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Approval;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalRepository extends JpaRepository<Approval, UUID> {
}
