-- Vincula cada usuario al subject (DID) del access token de Privy.
-- NULL en filas viejas: el unique de Postgres admite varios NULL.

ALTER TABLE users
    ADD COLUMN privy_did VARCHAR(64);

ALTER TABLE users
    ADD CONSTRAINT ux_users_privy_did UNIQUE (privy_did);
