CREATE TABLE IF NOT EXISTS familyos_pairing_challenges (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    polling_hash TEXT NOT NULL,
    device_name TEXT NOT NULL,
    requester_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    owner_sub TEXT REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    device_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS familyos_pairing_challenges_expiry_idx
    ON familyos_pairing_challenges(expires_at);
CREATE INDEX IF NOT EXISTS familyos_pairing_challenges_requester_idx
    ON familyos_pairing_challenges(requester_hash, created_at);

CREATE TABLE IF NOT EXISTS familyos_devices (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    token_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS familyos_devices_owner_idx
    ON familyos_devices(owner_sub, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS familyos_pairing_approval_attempts (
    id BIGSERIAL PRIMARY KEY,
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS familyos_pairing_approval_attempts_owner_idx
    ON familyos_pairing_approval_attempts(owner_sub, attempted_at);

ALTER TABLE familyos_pairing_challenges
    ADD CONSTRAINT familyos_pairing_challenges_device_fk
    FOREIGN KEY (device_id) REFERENCES familyos_devices(id) ON DELETE SET NULL;
