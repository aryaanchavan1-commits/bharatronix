# Stripe fraud & checkout-ops setup (Bharatrontech)

Application code implements the delayed-capture lifecycle, the IP velocity rule,
the 3 purchase attempts / 24h cap, the retry ladder (1h / 4h / 12h), dispute
auto-refunds, the daily decline-rate circuit breaker, and the 20/min/IP rate
limit. The items below are one-time **Stripe Dashboard / API** settings that no
code can enforce on its own.

## 1. Delayed capture (code)

Sessions are created with `payment_intent_data.capture_method: "manual"`
(`src/app/api/orders/route.ts`). Stripe only holds an authorization for
**7 days max** — if no capture happens the authorization is released
(`payment_intent.canceled` → `charge.expired`). Set your review window ≤ 7 days.
Webhook ids: `checkout.session.completed`, `payment_intent.amount_capturable_updated`,
`charge.succeeded` (only when `captured: true` ⇒ order moves to `paid` and
license keys unlock).

## 2. Radar rule list (Dashboard → Radar → Rule settings)

Block (early) rules:

- Block if `:risk_level: = 'highest'`
- Block if `:is_cvc_pass: = 'false'` *(CVV/CVC check — required for first-time customers as well)*
- Block if `:is_3ds_authenticated: = 'false' AND amount_usd > 100` *(3DS step-up over $100)*
- Block if `:card_country: != :ip_country: AND :risk_score: > 50`
- Block if ` tribes:payments_retry_24hz > 3` *(multiple retry attempts)*
- Block if ` tribes:card_usercount_1d > 3` *(same card reused too often)*
- Block if ` countries_in("PK","AF","SY","MM","IR","KP","NG","RU")` *(high-risk country list — keep in sync with HIGH_RISK_COUNTRIES in src/lib/stripe.ts)*

Review (manual queue) rules:

- Review if ` amount_usd > 500` *(manual review queue over $500)*
- Review if ` countries_in("PK","AF","SY","MM","IR","KP","NG","RU")`
- Review if ` :risk_level: = 'elevated'`

> Manual review queue requires Radar for Fraud Teams (paid tier). Without it,
> only Block rules are available. Over-limit orders in review stay
> `authorized` — the reviewer must Capture or Cancel manually from Payments.

## 3. Velocity rule (Radar velocity)

Create velocity list `payments_retry_24hz` keyed on `:ip_address:` if it
doesn't exist, then:

```
Block if tribes:payments_retry_24hz > 3
```

The app additionally blocks ≥ 3 *completed* sessions per IP / 24h in
`src/app/api/orders/route.ts` (defense in depth, works without Radar).

## 4. Payment method types / card verification (code + rule)

- `payment_method_types: ["card"]` — cards only; Stripe always performs the CVC
  check for card payments (the dashboard rule above makes failing CVC a hard block).
- First-time-customer hardening lives in Radar (CVC + 3DS rules) since Checkout
  sessions have no "may_store_profile" flag.

## 5. Webhook endpoint (Dashboard → Developers → Webhook events)

Endpoint: `https://<your-domain>/api/stripe/webhook`
Store signing secret in `STRIPE_WEBHOOK_SECRET`.

Events to subscribe:

- `checkout.session.completed`
- `payment_intent.amount_capturable_updated`
- `payment_intent.payment_failed` (drives the 1h/4h/12h retry ladder)
- `charge.succeeded`
- `charge.refunded`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`,
  `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`

## 6. Daily decline-rate circuit breaker (code)

`POST|GET /api/cron/payments` (Vercel Cron, hourly — schedule in `vercel.json`)
counts today's payments from the DB; if > 5% are `failed` it writes
`payments_paused=true` to `site_flags`, which `/api/orders` rejects new
sessions with 503. It auto-recovers the next healthy day. Protect the route
with env `CRON_SECRET` (Authorization: Bearer).

## 7. Vercel rate limit (code)

`src/middleware.ts` limits non-GET traffic on `/api/orders` and
`/api/stripe/checkout` to 20 attempts / minute / IP (sliding window). On serverless
it's per-instance — if you outgrow it, plug Upstash Redis / Vercel KV into `hit()`.

## 8. Metadata wiring (code)

`payment_intent_data.metadata = { order_id: <order_number>, customer_email: <email>, ip }`
is already set — Stripe dashboard → Payments → search metadata `order_id:` gives
find-refund flows in 2 clicks.

## 9. Capturing or releasing an authorize-order (dashboard)

Payments → select the `authorized` payment → **Capture** (after review window) or
**Cancel**. Until capture completes the money moves but isn't charged; the buyer
sees "payment authorized – pending".
