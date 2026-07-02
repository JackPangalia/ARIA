# Kivo V1 Launch Checklist

The code-side launch hardening is done (rate limiting, analytics, error
reporting, retention purge, Stripe fixes, reconnect, legal pages, SEO, CI).
Everything below is an **operator step** — things only you can do, roughly in
order. Check them off before turning on ads.

## 1. Domain & URLs

- [ ] Buy the domain and add it to the Vercel project (Settings → Domains).
- [ ] Set Vercel env vars (Production):
  - `NEXT_PUBLIC_SITE_URL=https://yourdomain.com` (SEO metadata, sitemap, OG)
  - `APP_URL=https://yourdomain.com` (Stripe redirect URLs — same value)
- [ ] Drop a 1200×630 `public/og.png` (wordmark on brand background) — the
  OpenGraph/Twitter tags already reference it.

## 2. Firebase

- [ ] Add the new domain to Firebase Auth → Settings → Authorized domains
  (sign-in popups fail without this).
- [ ] Deploy the new Firestore index for analytics:
  `npx firebase-tools deploy --only firestore:indexes`
- [ ] Set Firestore TTL policies (Console → Firestore → TTL, or gcloud) so
  server-side counters self-clean:
  - collection `ratelimits`, field `expiresAt`
  - collection `stripe_events`, field `receivedAt` (add a TTL of ~30 days)

## 3. Stripe (live mode)

- [ ] Switch to live API keys; create the three live Prices and set
  `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PLUS/PRO/MAX` in Vercel.
- [ ] Create the live webhook endpoint → `https://yourdomain.com/api/stripe/webhook`
  with events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.payment_failed`. Set `STRIPE_WEBHOOK_SECRET`.
- [ ] Enable Stripe's dunning emails (Settings → Billing → Subscriptions and
  emails → Manage failed payments) — the app intentionally has no dunning UI.
- [ ] Full live-mode test with a real card: checkout → tier shows in Settings →
  cancel via portal → tier reverts at period end. Then a second test account:
  subscribe → **delete the account in Settings** → verify in the Stripe
  dashboard the subscription is canceled AND the customer is deleted.

## 4. Cron / retention

- [ ] Set `CRON_SECRET` (any long random string) in Vercel env.
- [ ] After deploy, dry-run once and eyeball the output:
  `curl -H "Authorization: Bearer $CRON_SECRET" "https://yourdomain.com/api/cron/retention?dryRun=1"`
- [ ] The schedule (04:00 UTC daily) is in `vercel.json`; confirm it appears
  under Vercel → Settings → Cron Jobs after deploy.

## 5. Vendors — quota headroom

- [ ] Speechmatics: paid tier with enough realtime hours for launch traffic
  (~$0.56/hr is the dominant COGS; Free tier gives each user up to 3 hrs/mo).
- [ ] Cartesia: paid tier — free tier allows only ~2 concurrent syntheses,
  which two simultaneous users can exhaust.
- [ ] Gemini: paid quota for `gemini-2.5-flash` with headroom; quota errors are
  handled gracefully but read as "Kivo is down" to users.
- [ ] Latency note: Speechmatics region is currently `eu` (hard-coded in the
  token route). If most users are US-based, revisit region co-location.

## 6. Observability

- [ ] Toggle Vercel Analytics on (project → Analytics) for page views.
- [ ] Verify logs arrive: trigger a client error on the prod site and find the
  `[client-error]` line in Vercel logs; ask Kivo something and find the `[ask]`
  timing line. Consider a log drain if you want retention beyond Vercel's.
- [ ] Funnel: `npm run funnel -- 7` (needs Firebase Admin env in `.env.local`)
  prints landing → signup → session → ask → checkout → activation counts.

## 7. Legal

- [ ] Have a lawyer review `/privacy` and `/terms` — especially the
  recording-consent language (two-party-consent jurisdictions) — before
  scaling paid acquisition.
- [ ] Confirm `hello@kivo.ai` (used across the site) actually receives mail.

## 8. Pre-ad smoke test (production, real device)

- [ ] Sign up fresh → consent dialog appears once → start listening →
  transcript flows → "Hey Kivo, …" → spoken answer plays.
- [ ] Kill Wi-Fi for 10 s mid-session → "Reconnecting…" appears → recovers.
- [ ] iPhone Safari: same flow (playback path differs on iOS).
- [ ] `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` load; a bogus URL
  shows the branded 404.
