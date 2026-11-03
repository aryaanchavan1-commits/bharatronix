# Dodo Payments setup (replaces Stripe)

The store now checks out through [Dodo Payments](https://app.dodopayments.com/) hosted checkout
instead of Stripe. Buyers never need an account — the checkout page only asks for name, email,
phone and (optionally) GSTIN, then redirects to Dodo's hosted payment page.

## 1. Create your products in Dodo

1. Sign in at https://app.dodopayments.com/ (or https://test.dodopayments.com/ for test mode).
2. Create a Product for every store SKU (ERP suites). Prices on the Dodo side are ignored —
   the store sends its own `amount` per line item so the database stays the source of truth.
3. Copy each product id (`prod_…`) and the webhook signing secret from **Settings → Webhooks**.

## 2. Environment variables

```bash
# required
DODO_PAYMENTS_API_KEY=live_...            # Settings → API keys (Bearer token)
DODO_PAYMENTS_ENV=live_mode               # or test_mode (uses test.dodopayments.com)
DODO_PRODUCT_IDS={"erp-basic":"prod_xxx"} # store slug -> Dodo product id (JSON)
DODO_WEBHOOK_SECRET=whsec_...             # webhook signing secret (base64 public key)

# optional
DODO_DEFAULT_PRODUCT_ID=prod_yyy          # fallback product for slugs missing in the map
DODO_PAYMENTS_BASE_URL=https://app.dodopayments.com  # override API host
NEXT_PUBLIC_SITE_URL=https://your-domain.in          # return/cancel URL origin
```

## 3. Webhook

Point a Dodo webhook at `POST /api/dodo/webhook` (Standard Webhooks signature:
`webhook-id`, `webhook-timestamp`, `webhook-signature` headers). The handler verifies the
signature, then:

- `payment.succeeded` → payment `paid`, order `paid`
- `payment.failed` / `payment.cancelled` → payment `failed`, order `cancelled`
- `payment.refunded` / `refund.succeeded` → payment `refunded`, order `refunded`

`payload.metadata.order_number` is how Dodo events are matched back to store orders.

## 4. Flow

1. `/checkout` → `POST /api/orders` (guest checkout, no sign-in required).
2. API creates the local `orders` + `payments` rows (fraud score still logged), then
   `POST /checkouts` on Dodo and returns `checkoutUrl`.
3. Buyer pays on Dodo; Dodo redirects to `/order/{orderNumber}?paid=1`.
4. Webhook finalises payment/order status.