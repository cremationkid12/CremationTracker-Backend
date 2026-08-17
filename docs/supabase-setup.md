# Cremation Tracker — Supabase setup

Use a **new** Supabase project. Do **not** reuse EverRoute’s project or database.

## 1. Create project

1. Open [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → name e.g. `cremation-tracker`
3. Save the database password

## 2. Connection + API keys

In **Project Settings → API**:

| Env var | Where |
|---------|--------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (server only; later invites/admin) |

In **Project Settings → Database**:

| Env var | Where |
|---------|--------|
| `DATABASE_URL` | Connection string (prefer **Session pooler** URI for Railway; include password) |

Example `.env`:

```bash
PORT=8020
JWT_SECRET=keep-for-local-tests-only
DATABASE_URL=postgresql://postgres.xxxx:YOUR_PASSWORD@aws-0-....pooler.supabase.com:5432/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ALLOWED_ORIGINS=http://localhost:8020,http://localhost:8080,http://localhost:5173
```

## 3. Auth settings (staging)

**Authentication → Providers → Email**

Turn **off** “Confirm email” so `signUp` returns a session immediately, **or** leave it on — in non-production the API auto-confirms with `SUPABASE_SERVICE_ROLE_KEY` so Create account still signs you in.

Re-enable confirmation (and set `ALLOW_AUTO_CONFIRM_EMAIL=false`) before public launch if required.

## 4. Migrate schema

```bash
cd CremationTracker-Backend
cp .env.example .env   # fill values
npm ci
npm run db:migrate
npm run dev
```

Health check: `GET http://localhost:8020/v1/health`

## 5. Behavior

| Config | Auth | Orgs / cases |
|--------|------|----------------|
| `JWT_SECRET` only (no Supabase) | Local HS256 (tests / offline) | In-memory unless `DATABASE_URL` set |
| `SUPABASE_*` + `DATABASE_URL` | Supabase Auth | Postgres (required) |

Mobile and family web keep the same API contract; they send `Authorization: Bearer <access_token>`.
