package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.User;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    boolean existsByEmail(String email);
}
