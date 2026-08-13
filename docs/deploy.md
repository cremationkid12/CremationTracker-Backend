# Deploy — Cremation Tracker API (Railway)

Use a **dedicated** Supabase project. Do not reuse EverRoute production DB or keys.

## Railway

1. Create a new Railway project from this repo (`CremationTracker-Backend`).
2. Build uses `Dockerfile` (`railway.toml` / `railway.json`).
3. Set variables (see `.env.example`):

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Supabase **session pooler** URI (`aws-0-<region>.pooler.supabase.com`) |
| `SUPABASE_URL` | Yes (prod) | Dedicated CT project |
| `SUPABASE_ANON_KEY` | Yes (prod) | |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (prod) | Server only |
| `JWT_SECRET` | Optional | Local/HS256 tokens; keep for tests |
| `ALLOWED_ORIGINS` | Yes | Include family Vercel origin + Flutter web if any |
| `FAMILY_PORTAL_BASE_URL` | Yes | Public family site origin (no trailing slash) |
| `CASE_PRICE_CENTS` | No | Default `799` |
| `FREE_LIVE_CASES_PER_ORG` | No | Default `3` |
| `STRIPE_SECRET_KEY` | No | Required for real checkout |
| `STRIPE_WEBHOOK_SECRET` | No | Webhook endpoint `/v1/billing/webhook` |
| `SENDGRID_API_KEY` / `INVITE_FROM_EMAIL` | No | Invites + family link email |
| `ENABLE_SWAGGER_UI` | No | Set `false` in production if desired |

4. Deploy. `preDeployCommand` runs `npm run db:migrate:prod` before start.
5. Health: `GET /v1/health` → `{"status":"ok",...}`

## Stripe webhook

Point Stripe to `https://<railway-host>/v1/billing/webhook` and set `STRIPE_WEBHOOK_SECRET`.

## After API is live

1. Deploy family portal on Vercel with `VITE_API_BASE_URL=https://<railway-host>`.
2. Point staff app at the same API (`--dart-define=API_BASE_URL=...`).
3. Set `FAMILY_PORTAL_BASE_URL` to the Vercel URL so share links resolve correctly.
