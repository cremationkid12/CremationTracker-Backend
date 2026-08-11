-- ============================================================================
-- Cremation Tracker — initial schema (Phase 1 foundation)
-- Idempotent: IF NOT EXISTS guards so this script is safe to re-run.
-- ============================================================================

-- ─── organizations (funeral_home | crematory) ────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  org_type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_org_type_check
    CHECK (org_type IN ('funeral_home', 'crematory'))
);

CREATE INDEX IF NOT EXISTS organizations_org_type_created_at_idx
  ON organizations(org_type, created_at DESC);

-- ─── org_members (admin | associate) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'associate',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_members_role_check
    CHECK (role IN ('admin', 'associate')),
  CONSTRAINT org_members_org_user_unique UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS org_members_org_id_created_at_idx
  ON org_members(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS org_members_user_id_idx
  ON org_members(user_id);

-- ─── org_invites ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'associate',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_invites_role_check
    CHECK (invited_role IN ('admin', 'associate')),
  CONSTRAINT org_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS org_invites_org_id_status_idx
  ON org_invites(org_id, status);

-- ─── funeral home billing credits (3 free live cases, then per-case fee) ─────
CREATE TABLE IF NOT EXISTS org_case_credits (
  org_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  free_live_cases_remaining INTEGER NOT NULL DEFAULT 3,
  live_cases_created INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_case_credits_free_nonneg
    CHECK (free_live_cases_remaining >= 0),
  CONSTRAINT org_case_credits_created_nonneg
    CHECK (live_cases_created >= 0)
);

-- ─── cases ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  owner_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  custody_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  case_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  decedent_display_name TEXT NOT NULL,
  -- Full intake fields land in later migrations / JSONB expansion (Phase 0 field lock)
  intake JSONB NOT NULL DEFAULT '{}'::jsonb,
  qr_token_hash TEXT UNIQUE,
  pin_hash TEXT,
  pin_hint TEXT,
  billing_status TEXT,
  billing_provider TEXT,
  billing_transaction_id TEXT,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cases_case_mode_check
    CHECK (case_mode IN ('test', 'live')),
  CONSTRAINT cases_status_check
    CHECK (status IN ('active', 'completed', 'archived')),
  CONSTRAINT cases_billing_status_check
    CHECK (
      billing_status IS NULL
      OR billing_status IN ('not_required', 'free_credit', 'pending', 'paid', 'failed', 'refunded')
    ),
  CONSTRAINT cases_live_qr_required CHECK (
    case_mode = 'test'
    OR (qr_token_hash IS NOT NULL AND pin_hash IS NOT NULL)
    OR billing_status IN ('pending', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS cases_owner_org_id_status_created_at_idx
  ON cases(owner_org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS cases_custody_org_id_status_idx
  ON cases(custody_org_id, status);
CREATE INDEX IF NOT EXISTS cases_case_mode_idx
  ON cases(case_mode);

-- ─── case_steps (append-only custody / process log) ──────────────────────────
CREATE TABLE IF NOT EXISTS case_steps (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  step_label TEXT NOT NULL,
  actor_org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS case_steps_case_id_recorded_at_idx
  ON case_steps(case_id, recorded_at ASC);

-- ─── family_access (live cases only; web portal) ─────────────────────────────
CREATE TABLE IF NOT EXISTS family_access (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS family_access_case_id_idx
  ON family_access(case_id);
