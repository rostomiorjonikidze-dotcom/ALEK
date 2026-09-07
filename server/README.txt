ALEK Arena backend

This backend is OPTIONAL but required for real multi-user accounts, synced progress, referrals and a real leaderboard.

Run locally:
1. cd server
2. npm install
3. copy .env.example to .env
4. put BOT_TOKEN in .env
5. npm start

Important:
- NEVER commit .env or your BOT_TOKEN to GitHub.
- The frontend calls /api/*, so production hosting must reverse-proxy /api to this server OR you must change API_BASE in public/arena/app.js to your backend URL.
- SQLite is fine for MVP. For scale, move to Postgres/Supabase/Neon later.
