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

## Current status (scaffold)

| Area | Status |
|------|--------|
| Health + Swagger + OpenAPI contract | Done |
| DB migration `001_init` (orgs, members, cases, steps, family_access, credits) | Done |
| Auth / case / claim route handlers | Contract only — Phase 1 |
| Billing / family public / push | Later phases |

## Tests

```bash
npm test
```

## Deploy (Railway)

Uses `Dockerfile` and `railway.toml`. Set env vars (especially `DATABASE_URL`). Migrations run via `preDeployCommand`.

**Important:** use a **dedicated** Supabase/Postgres project — do not share EverRoute production data.
