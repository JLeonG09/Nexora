package com.nexora.entities;

import com.nexora.entities.enums.MandateStatus;
import com.nexora.entities.enums.RevokeReason;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "mandates")
@Getter
@Setter
@NoArgsConstructor
public class Mandate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "account_id", nullable = false)
    private UUID accountId;

    @Column(name = "asset_code", nullable = false, length = 12)
    private String assetCode;

    @Column(name = "asset_contract_id", nullable = false, length = 56)
    private String assetContractId;

    @Column(name = "daily_limit", nullable = false, precision = 20, scale = 7)
    private BigDecimal dailyLimit;

    @Column(name = "per_tx_limit", nullable = false, precision = 20, scale = 7)
    private BigDecimal perTxLimit;

    @Column(name = "approval_threshold", nullable = false, precision = 20, scale = 7)
    private BigDecimal approvalThreshold;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 10)
    private MandateStatus status;

    @Column(name = "key_version", nullable = false)
    private Integer keyVersion;

    @Column(name = "agent_public_key_hex", nullable = false, length = 64)
    private String agentPublicKeyHex;

    @Column(name = "context_rule_id", nullable = false)
    private Integer contextRuleId;

    @Column(name = "valid_until_ledger", nullable = false)
    private Long validUntilLedger;

    @Column(name = "create_tx_hash", nullable = false, length = 64)
    private String createTxHash;

    @Column(name = "revoke_tx_hash", length = 64)
    private String revokeTxHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "revoke_reason", length = 20)
    private RevokeReason revokeReason;

    @Column(name = "revoked_at")
    private Instant revokedAt;

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
