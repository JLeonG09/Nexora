package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Account;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByUserId(UUID userId);

    boolean existsByUserId(UUID userId);

    boolean existsBySmartAccountAddress(String smartAccountAddress);

    /** Bloquea la fila de la cuenta (SELECT ... FOR UPDATE) para validar el tope diario y rotar la llave. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.id = :id")
    Optional<Account> findByIdForUpdate(@Param("id") UUID id);
}
