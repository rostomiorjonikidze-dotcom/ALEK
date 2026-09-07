# ALEK Arena — Full Stack Deployment

This package contains:
- `public/arena/` — final Telegram Mini App frontend for `https://alek.best/arena/`
- `backend/` — secure Node.js API + SQLite database

## 1. Frontend
Upload `public/arena/` to the GitHub repository exactly as before.

## 2. Backend
Deploy the `backend/` folder to a persistent Node host. A `render.yaml` is included.
The backend requires persistent disk because it uses SQLite.

Set these secrets/environment variables on the backend host:
- `BOT_TOKEN` — your Telegram bot token. Never commit it.
- `FRONTEND_ORIGIN=https://alek.best`
- `PUBLIC_BACKEND_URL=https://YOUR-BACKEND-DOMAIN`
- `DB_PATH=/var/data/alek.sqlite` (or another persistent path)
- `ADMIN_SECRET` — long random secret

## 3. Connect frontend to backend
After deployment, edit only:
`public/arena/config.js`

Set:
`API_BASE: "https://YOUR-BACKEND-DOMAIN"`

Commit/deploy the frontend again.

## 4. Telegram webhook
After the backend is live, POST to:
`/admin/set-webhook`
with request header:
`X-Admin-Secret: <ADMIN_SECRET>`

This registers the bot webhook for Telegram Stars payments.

## Security implemented
- Telegram `initData` HMAC-SHA256 validation on every authenticated API request.
- `auth_date` freshness check.
- Server-side points/energy for synced tap batches.
- Tap batch rate limiting.
- Global server leaderboard.
- Shared World Boss.
- Referral server endpoint.
- Squad creation endpoint.
- TON wallet address storage.
- Telegram Stars invoice creation with `XTR`.
- `pre_checkout_query` validation.
- `successful_payment` processing.
- SQLite unique constraints to reduce duplicate payment processing.
- General API rate limiting.
- CORS locked to `https://alek.best`.

## Important
The frontend still keeps local state as a fallback if the backend URL is empty/offline.
Once backend is configured, server state overrides important synced player values.

Before a public paid launch, do a test-environment Stars payment first and add:
- backups for SQLite,
- monitoring/logging,
- terms/privacy/support pages,
- refund/support workflow,
- stricter anti-cheat telemetry if rewards have real-world value.

Do not place `BOT_TOKEN` in `config.js`, GitHub Pages, or any frontend file.
