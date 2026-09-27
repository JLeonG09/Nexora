package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.Contact;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContactRepository extends JpaRepository<Contact, UUID> {
}
