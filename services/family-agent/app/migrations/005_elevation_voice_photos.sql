ALTER TABLE familyos_sessions ADD COLUMN IF NOT EXISTS elevated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE familyos_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE familyos_devices ADD COLUMN IF NOT EXISTS elevated_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS familyos_voice_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    member_id TEXT,
    label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS familyos_voice_tokens_owner_idx ON familyos_voice_tokens(owner_sub, revoked_at);

CREATE TABLE IF NOT EXISTS familyos_photo_blobs (
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    photo_id TEXT NOT NULL,
    variant TEXT NOT NULL,
    content BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_sub, photo_id, variant)
)
