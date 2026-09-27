package com.nexora.riendas.repositories;

import com.nexora.riendas.entities.ChatMessage;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    Page<ChatMessage> findByUserIdAndConversationId(UUID userId, UUID conversationId, Pageable pageable);

    Page<ChatMessage> findByUserId(UUID userId, Pageable pageable);
}
