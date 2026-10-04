package com.nexora.repositories;

import com.nexora.entities.User;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    boolean existsByEmail(String email);

    Optional<User> findByEmail(String email);

    Optional<User> findByPrivyDid(String privyDid);

    boolean existsByPrivyDid(String privyDid);
}
