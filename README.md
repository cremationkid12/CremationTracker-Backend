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

## Current status

| Area | Status |
|------|--------|
| Health + Swagger + OpenAPI contract | Done |
| DB migrations `001` + `002` (share secrets) | Done |
| Local JWT auth (tests / offline) | Done |
| **Supabase Auth** (when `SUPABASE_*` set) | Done |
| Org bootstrap (funeral_home / crematory admin) | Done |
| Create/list/get cases (test + live QR/PIN) | Done |
| Record process steps (custody-gated) | Done |
| Crematory claim via PIN/QR | Done |
| Public family status | Done |
| Associate invites | Done |
| Per-case billing (Stripe + mock) | Done (Apple IAP later) |
| Push notifications | Later |

### Auth note

- **Default without Supabase:** local JWT (`JWT_SECRET`) + in-memory or Postgres if `DATABASE_URL` is set.
- **Staging/production:** set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DATABASE_URL` on a **dedicated** project. See [`docs/supabase-setup.md`](./docs/supabase-setup.md).
- Middleware accepts HS256 test tokens **or** Supabase access tokens.

## Tests

```bash
npm test
```

## Deploy (Railway)

Uses `Dockerfile` and `railway.toml`. Set env vars (especially `DATABASE_URL`). Migrations run via `preDeployCommand`.

Step-by-step: [`docs/deploy.md`](./docs/deploy.md).

**Important:** use a **dedicated** Supabase/Postgres project — do not share EverRoute production data.
