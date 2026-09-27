package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Alert;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AlertRepository extends JpaRepository<Alert, UUID> {
}
