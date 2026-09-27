-- V2: al expirar un mandato la versión de la llave no sube (CONTRATOS_EQUIPO.md §3.3),
-- así que el siguiente mandato puede usar la misma versión. Solo la revocación rota la llave.
-- ux_mandates_one_active sigue impidiendo dos mandatos activos a la vez.
DROP INDEX ux_mandates_account_key_version;
CREATE INDEX ix_mandates_account_key_version ON mandates (account_id, key_version);
