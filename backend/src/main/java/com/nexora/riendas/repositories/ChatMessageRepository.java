package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.ChatMessage;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {
}
