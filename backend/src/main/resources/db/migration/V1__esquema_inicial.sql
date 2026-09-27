-- V1: esquema inicial de Riendas (PostgreSQL 13+; gen_random_uuid() viene incluido)

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name  VARCHAR(60)  NOT NULL,
    email         VARCHAR(120) UNIQUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL UNIQUE REFERENCES users (id),
    smart_account_address  VARCHAR(56) NOT NULL UNIQUE
                           CHECK (smart_account_address ~ '^C[A-Z2-7]{55}$'),
    credential_id          VARCHAR(512),
    network                VARCHAR(10) NOT NULL DEFAULT 'TESTNET'
                           CHECK (network IN ('TESTNET')),
    agent_key_version      INTEGER     NOT NULL DEFAULT 1 CHECK (agent_key_version >= 1),
    last_scanned_ledger    BIGINT      CHECK (last_scanned_ledger >= 0),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    version                BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE mandates (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id            UUID NOT NULL REFERENCES accounts (id),
    asset_code            VARCHAR(12)   NOT NULL DEFAULT 'USDC' CHECK (asset_code = 'USDC'),
    asset_contract_id     VARCHAR(56)   NOT NULL,
    daily_limit           NUMERIC(20,7) NOT NULL CHECK (daily_limit > 0),
    per_tx_limit          NUMERIC(20,7) NOT NULL CHECK (per_tx_limit > 0),
    approval_threshold    NUMERIC(20,7) NOT NULL CHECK (approval_threshold > 0),
    expires_at            TIMESTAMPTZ   NOT NULL,
    status                VARCHAR(10)   NOT NULL CHECK (status IN ('ACTIVO', 'REVOCADO', 'EXPIRADO')),
    key_version           INTEGER       NOT NULL CHECK (key_version >= 1),
    agent_public_key_hex  VARCHAR(64)   NOT NULL CHECK (agent_public_key_hex ~ '^[0-9a-fA-F]{64}$'),
    context_rule_id       INTEGER       NOT NULL CHECK (context_rule_id >= 0),
    valid_until_ledger    BIGINT        NOT NULL CHECK (valid_until_ledger > 0),
    create_tx_hash        VARCHAR(64)   NOT NULL CHECK (create_tx_hash ~ '^[0-9a-fA-F]{64}$'),
    revoke_tx_hash        VARCHAR(64)   CHECK (revoke_tx_hash ~ '^[0-9a-fA-F]{64}$'),
    revoke_reason         VARCHAR(20)   CHECK (revoke_reason IN ('USUARIO', 'LLAVE_COMPROMETIDA')),
    revoked_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version               BIGINT        NOT NULL DEFAULT 0,
    CONSTRAINT ck_mandates_limits CHECK (per_tx_limit <= daily_limit AND approval_threshold <= per_tx_limit)
);
-- Solo un mandato ACTIVO por cuenta
CREATE UNIQUE INDEX ux_mandates_one_active ON mandates (account_id) WHERE status = 'ACTIVO';
-- Una versión de llave nunca se reutiliza en otro mandato de la misma cuenta
CREATE UNIQUE INDEX ux_mandates_account_key_version ON mandates (account_id, key_version);

CREATE TABLE contacts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id),
    name             VARCHAR(40)  NOT NULL,
    name_normalized  VARCHAR(40)  NOT NULL,
    stellar_address  VARCHAR(56)  NOT NULL CHECK (stellar_address ~ '^[GC][A-Z2-7]{55}$'),
    note             VARCHAR(140),
    archived         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Nombre único por usuario entre contactos no archivados ("Ana" = "ana" = "Aná")
CREATE UNIQUE INDEX ux_contacts_user_name ON contacts (user_id, name_normalized) WHERE archived = FALSE;

CREATE TABLE payment_proposals (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users (id),
    account_id           UUID NOT NULL REFERENCES accounts (id),
    mandate_id           UUID REFERENCES mandates (id),
    contact_id           UUID REFERENCES contacts (id),
    conversation_id      UUID,
    origin               VARCHAR(12)   NOT NULL DEFAULT 'CHAT' CHECK (origin IN ('CHAT', 'ATAQUE_DEMO')),
    original_text        VARCHAR(500)  NOT NULL,
    destination_address  VARCHAR(56),
    amount               NUMERIC(20,7),
    asset_code           VARCHAR(12),
    memo                 VARCHAR(100),
    ai_confidence        NUMERIC(4,3),
    ai_model             VARCHAR(60),
    ai_raw               JSONB,
    status               VARCHAR(25)   NOT NULL CHECK (status IN (
                             'PROPUESTO', 'RECHAZADO', 'PENDIENTE_APROBACION',
                             'APROBADO', 'ENVIADO', 'CONFIRMADO', 'FALLIDO')),
    rejection_code       VARCHAR(60),
    rejection_message    VARCHAR(300),
    approved_by          VARCHAR(12)   CHECK (approved_by IN ('AUTOMATICO', 'USUARIO')),
    tx_hash              VARCHAR(64)   CHECK (tx_hash ~ '^[0-9a-fA-F]{64}$'),
    ledger               BIGINT,
    signer_error         JSONB,
    sent_at              TIMESTAMPTZ,
    confirmed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    version              BIGINT        NOT NULL DEFAULT 0
);
CREATE INDEX ix_proposals_user_created    ON payment_proposals (user_id, created_at DESC);
CREATE INDEX ix_proposals_account_status  ON payment_proposals (account_id, status, created_at);
CREATE INDEX ix_proposals_enviado         ON payment_proposals (status) WHERE status = 'ENVIADO';
CREATE INDEX ix_proposals_tx_hash         ON payment_proposals (tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE chat_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users (id),
    conversation_id  UUID NOT NULL,
    role             VARCHAR(10)   NOT NULL CHECK (role IN ('USUARIO', 'AGENTE')),
    type             VARCHAR(10)   NOT NULL CHECK (type IN ('MESSAGE', 'PROPOSAL')),
    text             VARCHAR(1000) NOT NULL,
    proposal_id      UUID REFERENCES payment_proposals (id),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX ix_chat_user_conversation ON chat_messages (user_id, conversation_id, created_at);

CREATE TABLE approvals (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id    UUID NOT NULL UNIQUE REFERENCES payment_proposals (id),
    user_id        UUID NOT NULL REFERENCES users (id),
    status         VARCHAR(10)  NOT NULL CHECK (status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA')),
    reason         VARCHAR(300) NOT NULL,
    decision_note  VARCHAR(200),
    expires_at     TIMESTAMPTZ  NOT NULL,
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    version        BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX ix_approvals_user_status ON approvals (user_id, status, created_at DESC);

CREATE TABLE alerts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users (id),
    account_id           UUID NOT NULL REFERENCES accounts (id),
    mandate_id           UUID REFERENCES mandates (id),
    status               VARCHAR(10)   NOT NULL CHECK (status IN ('PENDIENTE', 'RECONOCIDA', 'REPORTADA')),
    tx_hash              VARCHAR(64)   NOT NULL CHECK (tx_hash ~ '^[0-9a-fA-F]{64}$'),
    ledger               BIGINT        NOT NULL,
    destination_address  VARCHAR(56)   NOT NULL,
    amount               NUMERIC(20,7) NOT NULL,
    asset_code           VARCHAR(12)   NOT NULL DEFAULT 'USDC',
    occurred_at          TIMESTAMPTZ   NOT NULL,
    detected_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    decided_at           TIMESTAMPTZ,
    version              BIGINT        NOT NULL DEFAULT 0
);
-- Idempotencia de la conciliación: una alerta por transacción y cuenta
CREATE UNIQUE INDEX ux_alerts_account_tx ON alerts (account_id, tx_hash);
CREATE INDEX ix_alerts_user_status ON alerts (user_id, status, detected_at DESC);

CREATE TABLE audit_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users (id),
    proposal_id  UUID REFERENCES payment_proposals (id),
    mandate_id   UUID REFERENCES mandates (id),
    event_type   VARCHAR(40)  NOT NULL,
    actor        VARCHAR(10)  NOT NULL CHECK (actor IN ('USUARIO', 'IA', 'BACKEND', 'FIRMANTE', 'RED')),
    summary      VARCHAR(500) NOT NULL,
    data         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    occurred_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_user_time     ON audit_events (user_id, occurred_at DESC);
CREATE INDEX ix_audit_proposal_time ON audit_events (proposal_id, occurred_at);

-- La auditoría es solo de inserción: se bloquean UPDATE y DELETE
CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events es solo de inserción';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_append_only
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
