# ALEK VIDEO — Creator Studio V4

A French-first, colourful video creator studio for ALEK. Source, not a claim of production-quality AI inference.

## What works immediately

- Independent responsive landing and creative studio (`index.html`, `style.css`, `app.js`).
- Fashion/UGC/beauty/product/travel/launch brief templates.
- Local photo video export in compatible modern browsers via canvas + MediaRecorder.
- Public factual info, privacy/terms draft and owner console UI.
- Stateless **preview** MCP tools for describing capabilities and preparing ad briefs (`/mcp`). This is not a submitted or approved ChatGPT Plugin.

## Full-service backend, disabled until connections verified

- Supabase Auth email login and account sessions.
- Private per-user image uploads to Supabase Storage.
- Server-side verified identity, transactional credit wallet and ledger, user-owned job list, owner dashboard.
- Fixed server-side credit prices; Stripe Checkout Session and HMAC-verified idempotent webhook. Payments are **gated off** without verified GPU, Stripe secrets and explicit launch flag.
- Server-side GPU proxy: job creation/polling/download, credit reservation and automatic refund on confirmed failure, reconciliation endpoint.
- License-aware private Ubuntu GPU installer and local LTX-2.3 / FASHN VTON / Piper integrations carried from V3; no external video-API credits.

## What's NOT done

- No NVIDIA GPU is connected, so genuine AI walk/talk/lipsync videos **have not been generated**.
- No Stripe merchant / KYC, no customer payments, no complete GDPR or legal/business disclosures.
- No dedicated Supabase project credentials have been connected; SQL is packaged for review.
- No OAuth, public submission or approval for a ChatGPT video-render plugin; `/mcp` currently supports **read-only planning only**.
- No guarantee of lipsync, clothing identity or full realism: must validate with real hardware and model weights.

## Run locally

Node >=20, no npm dependencies. `npm start` runs a local test server; open http://localhost:4173 . `npm test` runs unit tests.

## Deploy

- Vercel Project `alek-video-engine`, domain `video.alek.best`.
- `index.html`, `style.css`, `app.js`, `privacy.html`, `terms.html`, `owner.html`, `owner.js`, `favicon.svg`, `vercel.json`, `package.json` at root; `api/*.js` and `lib/core.js` included.
- Set env vars as shown in `.env.example`; production toggle defaults false until prerequisites and quality are verified.
- Run the SQL in `supabase/001_video_studio.sql` **on the chosen dedicated video project** after review.
- Read `docs/CONNECTIONS_KA.md` for owner connection steps.