# ALEK Signal VIP

Experimental BTCUSDT/ETHUSDT Futures signals, 5m and 15m. GitHub Actions checks every ~5 minutes (best effort, runs may be delayed).

**Required before sending:** Add repository Actions secrets `BOT_TOKEN` and `CHAT_ID` under Settings → Secrets and variables → Actions. The Vercel environment variables are separate and do not automatically carry over to GitHub. Do not commit the bot token.

Open Actions → ALEK Signals → Run workflow for an initial test. A signal is only sent when a new EMA cross meets conditions, so a successful workflow may send nothing.

Limitations: no validated profitability, no chart image, no persistent deduplication; manual reruns may repeat a signal. Reference close is not guaranteed execution price. Do not advertise as proven profitable.
