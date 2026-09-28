CREATE TABLE IF NOT EXISTS familyos_parent_access_codes (
    owner_sub TEXT PRIMARY KEY REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    salt BYTEA NOT NULL,
    code_hash BYTEA NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ
);

