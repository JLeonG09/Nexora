package com.nexora.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "accounts")
@Getter
@Setter
@NoArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "smart_account_address", nullable = false, unique = true, length = 56)
    private String smartAccountAddress;

    @Column(name = "credential_id", length = 512)
    private String credentialId;

    @Column(name = "network", nullable = false, length = 10)
    private String network;

    @Column(name = "agent_key_version", nullable = false)
    private Integer agentKeyVersion = 1;

    @Column(name = "last_scanned_ledger")
    private Long lastScannedLedger;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;
}
