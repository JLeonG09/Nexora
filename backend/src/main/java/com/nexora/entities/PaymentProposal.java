package com.nexora.entities;

import com.nexora.entities.enums.ApprovedBy;
import com.nexora.entities.enums.ProposalOrigin;
import com.nexora.entities.enums.ProposalStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "payment_proposals", uniqueConstraints = @UniqueConstraint(
        name = "ux_proposals_user_client_message", columnNames = {"user_id", "client_message_id"}))
@Getter
@Setter
@NoArgsConstructor
public class PaymentProposal {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @Column(name = "mandate_id")
    private UUID mandateId;

    @Column(name = "contact_id")
    private UUID contactId;

    @Column(name = "conversation_id")
    private UUID conversationId;

    /** Id que manda el cliente. Junto con user_id impide un segundo pago por el mismo envío. */
    @Column(name = "client_message_id")
    private UUID clientMessageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false, length = 12)
    private ProposalOrigin origin = ProposalOrigin.CHAT;

    @Column(name = "original_text", nullable = false, length = 500)
    private String originalText;

    @Column(name = "destination_address", length = 56)
    private String destinationAddress;

    @Column(name = "amount", precision = 20, scale = 7)
    private BigDecimal amount;

    @Column(name = "asset_code", length = 12)
    private String assetCode;

    @Column(name = "memo", length = 100)
    private String memo;

    @Column(name = "ai_confidence", precision = 4, scale = 3)
    private BigDecimal aiConfidence;

    @Column(name = "ai_model", length = 60)
    private String aiModel;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ai_raw")
    private Map<String, Object> aiRaw;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 25)
    private ProposalStatus status;

    @Column(name = "rejection_code", length = 60)
    private String rejectionCode;

    @Column(name = "rejection_message", length = 300)
    private String rejectionMessage;

    @Enumerated(EnumType.STRING)
    @Column(name = "approved_by", length = 12)
    private ApprovedBy approvedBy;

    @Column(name = "tx_hash", length = 64)
    private String txHash;

    @Column(name = "ledger")
    private Long ledger;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "signer_error")
    private Map<String, Object> signerError;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;
}
