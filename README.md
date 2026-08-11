# Cremation Tracker — Backend

TypeScript Express API for Cremation Tracker. Contract: [`openapi.yaml`](./openapi.yaml).

Repos: [github.com/cremationkid12/CremationTracker-Backend](https://github.com/cremationkid12/CremationTracker-Backend)

## Product context

Two organizations work a shared custody chain:

1. **Funeral home** — creates cases (test vs live), full PII, pays per live case after 3 free.
2. **Crematory** — always free; claims via QR/PIN; limited fields; owns tracking after handoff.

Families use a **website** (separate), not this mobile API surface for status.

See the development approach doc in the Vinko workspace: `docs/cremation-tracker-development-approach.md`.

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install: `npm ci`
3. Build: `npm run build`
4. Run migrations: `npm run db:migrate` (requires `DATABASE_URL`)
5. Dev server: `npm run dev` (default port **8020**)

```bash
curl http://localhost:8020/v1/health
# → {"status":"ok","service":"cremation-tracker-api","version":"0.1.0"}
```

API docs: [http://localhost:8020/docs](http://localhost:8020/docs)

## Current status (Phase 1 in progress)

| Area | Status |
|------|--------|
| Health + Swagger + OpenAPI contract | Done |
| DB migration `001_init` | Done |
| Local JWT auth register/login/me | Done |
| Org bootstrap (funeral_home / crematory admin) | Done |
| Create/list/get cases (test + live QR/PIN) | Done |
| Record process steps (custody-gated) | Done |
| Crematory claim via PIN/QR | Done |
| Family public / billing / push | Later phases |
| Supabase Auth swap | When CT Supabase project is ready |

### Auth note

Phase 1 uses **local JWT auth** (`JWT_SECRET`) so development can proceed before Supabase is provisioned. Set `DATABASE_URL` to persist orgs/cases in Postgres; without it, the API uses in-memory stores (fine for local smoke tests).

## Tests

```bash
npm test
```

## Deploy (Railway)

Uses `Dockerfile` and `railway.toml`. Set env vars (especially `DATABASE_URL`). Migrations run via `preDeployCommand`.

**Important:** use a **dedicated** Supabase/Postgres project — do not share EverRoute production data.
