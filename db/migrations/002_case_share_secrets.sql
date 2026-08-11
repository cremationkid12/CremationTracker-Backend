-- Owner-only share secrets for live cases (PIN / QR / family link).
-- Never expose via crematory or public family responses except through dedicated family lookup.

CREATE TABLE IF NOT EXISTS case_share_secrets (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  pin TEXT NOT NULL,
  qr_token TEXT NOT NULL,
  family_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS case_share_secrets_pin_idx
  ON case_share_secrets(pin);

CREATE UNIQUE INDEX IF NOT EXISTS case_share_secrets_family_token_idx
  ON case_share_secrets(family_token);
