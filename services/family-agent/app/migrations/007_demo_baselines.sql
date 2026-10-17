-- The shared demo (judge) account's reset point: the household as the owner saved it (see app/demo_reset.py).
CREATE TABLE IF NOT EXISTS familyos_demo_baselines (
    owner_sub TEXT PRIMARY KEY REFERENCES familyos_households(owner_sub) ON DELETE CASCADE,
    snapshot JSONB NOT NULL,
    actions JSONB NOT NULL DEFAULT '{}'::jsonb,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
