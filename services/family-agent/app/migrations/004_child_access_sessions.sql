CREATE TABLE IF NOT EXISTS familyos_child_sessions (
    token_hash TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS familyos_child_sessions_owner_idx
    ON familyos_child_sessions(owner_sub, expires_at);
