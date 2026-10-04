-- Un reintento del chat con el mismo id no crea otra propuesta.
-- NULL queda libre: Postgres admite varios NULL en un UNIQUE.

ALTER TABLE payment_proposals
    ADD COLUMN client_message_id UUID;

ALTER TABLE payment_proposals
    ADD CONSTRAINT ux_proposals_user_client_message UNIQUE (user_id, client_message_id);
