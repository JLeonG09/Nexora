package com.nexora.repositories;

import com.nexora.entities.ChatMessage;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

    Page<ChatMessage> findByUserIdAndConversationId(UUID userId, UUID conversationId, Pageable pageable);

    Page<ChatMessage> findByUserId(UUID userId, Pageable pageable);

    Optional<ChatMessage> findFirstByUserIdAndProposalIdOrderByCreatedAtDesc(UUID userId, UUID proposalId);

    interface ConversationRow {
        UUID getConversationId();

        Instant getStartedAt();

        Instant getLastMessageAt();

        long getMessageCount();
    }

    @Query("""
            select m.conversationId as conversationId, min(m.createdAt) as startedAt,
                   max(m.createdAt) as lastMessageAt, count(m) as messageCount
            from ChatMessage m
            where m.userId = :userId
            group by m.conversationId
            order by max(m.createdAt) desc""")
    List<ConversationRow> findConversations(@Param("userId") UUID userId, Pageable pageable);

    @Query("select count(distinct m.conversationId) from ChatMessage m where m.userId = :userId")
    long countConversations(@Param("userId") UUID userId);

    /** El primer mensaje del usuario en cada conversación: es el título en el historial. */
    @Query("""
            select m from ChatMessage m
            where m.userId = :userId and m.conversationId in :conversationIds
              and m.role = com.nexora.entities.enums.ChatRole.USUARIO
              and m.createdAt = (select min(first.createdAt) from ChatMessage first
                                 where first.userId = :userId and first.conversationId = m.conversationId
                                   and first.role = com.nexora.entities.enums.ChatRole.USUARIO)""")
    List<ChatMessage> findFirstUserMessages(@Param("userId") UUID userId,
                                            @Param("conversationIds") Collection<UUID> conversationIds);
}
