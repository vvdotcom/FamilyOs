CREATE TABLE IF NOT EXISTS familyos_households (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    parent_name TEXT NOT NULL,
    name TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot JSONB NOT NULL,
    actions JSONB NOT NULL DEFAULT '{}'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS familyos_sessions (
    token_hash TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS familyos_sessions_owner_idx
    ON familyos_sessions(owner_sub, expires_at);

CREATE TABLE IF NOT EXISTS familyos_schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
