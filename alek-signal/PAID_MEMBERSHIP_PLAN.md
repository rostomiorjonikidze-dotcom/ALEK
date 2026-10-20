# ALEK SIGNAL VIP — paid membership deployment checklist

Price: **EUR 19.99 / month**, recurring. Payment provider planned: PayPal Business (not connected or activated yet).

## Telegram access design
- Public announcement channel: ALEK SIGNAL (marketing and market commentary only).
- Private subscriber channel: ALEK SIGNAL VIP (trade alerts).
- Keep the existing VIP channel private. Never publish a reusable VIP invite link.
- Membership bot must be an administrator of the private channel with invite/ban permissions.
- Grant access only after a **server-verified** completed subscription, using a short-lived one-user invite link.
- Revoke access when the subscription is cancelled, expired, suspended, or payment fails, subject to a clearly stated grace period.

## Payments and security
- Create a PayPal monthly subscription plan for EUR 19.99.
- Use server-side PayPal API authentication; never put client secrets in GitHub or frontend JavaScript.
- Verify webhook authenticity and re-check subscription status via PayPal API before granting membership.
- Use a persistent database for PayPal subscription ID, Telegram user ID, status, period end, and processed webhook IDs.
- Deduplicate webhooks, apply idempotent membership updates, and implement reconciliation for missed webhooks.
- Show clear price, automatic renewal, cancellation procedure, refund terms and risk disclaimer.
- Do not claim profitable or guaranteed trade results without audited evidence.

## Deployment gates (NOT YET LIVE)
- [ ] Public channel created and linked
- [ ] VIP bot granted required Telegram administrator permissions
- [ ] PayPal Business credentials and plan ID configured securely
- [ ] HTTPS webhook receiver deployed on a continuously available host
- [ ] Persistent database and scheduled reconciliation configured
- [ ] Sandbox purchase, renewal, cancellation and refund tests passed
- [ ] Production purchase test and Telegram join/expiry tests passed
- [ ] Existing signal generator verified stable and deduplicated

GitHub Actions scheduled jobs alone are not a reliable 24/7 HTTPS webhook receiver. Do not sell subscriptions until membership automation is deployed and verified.
