-- Private iCal links for connected calendars, encrypted by the service (AES-GCM) and never returned to clients.
CREATE TABLE IF NOT EXISTS familyos_calendar_links (
    owner_sub TEXT NOT NULL REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    sealed_url BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_sub, calendar_id)
)
