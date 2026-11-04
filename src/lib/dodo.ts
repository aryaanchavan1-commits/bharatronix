// Dodo Payments hosted checkout integration.
// Docs: https://docs.dodopayments.com/api-reference/checkout-sessions/create
//
// Dodo is a merchant-of-record platform: every sellable item must exist as a
// Product in the Dodo account. Map store slugs -> Dodo product ids via the
// DODO_PRODUCT_IDS env var, e.g. {"erp-basic":"pdt_abc123"}.
//
// app.dodopayments.com is the dashboard, not the API. Live API calls must go to
// live.dodopayments.com and test keys to test.dodopayments.com.

const BASE_URL = (
  process.env.DODO_PAYMENTS_BASE_URL ||
  (process.env.DODO_PAYMENTS_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com")
).replace(/\/+$/, "");

export interface DodoLineItem {
  slug: string;
  name: string;
  price: number; // INR minor units (paise)
  qty: number;
}

export interface CreateCheckoutInput {
  orderNumber: string;
  items: DodoLineItem[];
  customer: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    address?: string;
  };
  /** Page Dodo redirects to after a successful payment. */
  returnUrl: string;
  /** Page Dodo redirects to when the buyer cancels. */
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface DodoCheckout {
  sessionId: string;
  paymentId: string;
  checkoutUrl: string;
}

function apiKey(): string {
  const key = process.env.DODO_PAYMENTS_API_KEY;
  if (!key) throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  return key;
}

function loadProductIdMap(): Record<string, string> {
  const raw = process.env.DODO_PRODUCT_IDS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    throw new Error("DODO_PRODUCT_IDS must be valid JSON like {\"slug\":\"prod_xxx\"}");
  }
}

export async function createDodoCheckout(input: CreateCheckoutInput): Promise<DodoCheckout> {
  const productIdMap = loadProductIdMap();
  const fallbackId = process.env.DODO_DEFAULT_PRODUCT_ID || "";

  const product_cart = input.items.map((item) => {
    const productId = productIdMap[item.slug] || fallbackId;
    if (!productId) {
      throw new Error(
        `No Dodo product id configured for "${item.slug}". Set DODO_PRODUCT_IDS (or DODO_DEFAULT_PRODUCT_ID).`
      );
    }
    // No `amount` override: prices live on the Dodo products (INR paise) and
    // Dodo, as merchant of record, adds GST itself. Overriding the amount
    // would bypass that tax engine.
    return {
      product_id: productId,
      quantity: item.qty,
    };
  });

  // Build the request defensively: only include fields Dodo actually documents
  // plus a small allowlist of optional ones, dropping anything unsupported so a
  // stray key can never fail the whole checkout call with a 400.
  const body: Record<string, unknown> = {
    product_cart,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      order_number: input.orderNumber,
      customer_email: input.customer.email,
      customer_name: input.customer.name,
      ...(input.metadata ?? {}),
    },
  };

  // customer_business_name is rejected unless a tax_id accompanies it, and we
  // do not collect GSTIN at checkout, so the company stays on our order record.
  body.feature_flags = {
    allow_customer_editing_email: true,
    allow_customer_editing_name: true,
    allow_phone_number_collection: Boolean(input.customer.phone),
  };
  body.force_3ds = false;

  const res = await fetch(`${BASE_URL}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Dodo checkout create failed (${res.status}): ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    session_id?: string;
    checkout_url?: string;
    payment_id?: string;
  };

  if (!data.checkout_url || !data.session_id) {
    throw new Error("Dodo response missing session_id/checkout_url");
  }

  return {
    sessionId: data.session_id,
    paymentId: data.payment_id ?? data.session_id,
    checkoutUrl: data.checkout_url,
  };
}

/**
 * Verify a Standard Webhooks signature from Dodo.
 * Headers: webhook-id, webhook-timestamp, webhook-signature.
 * Secret is the `whsec_...` signing secret from the endpoint overview tab:
 * base64-decode it (after the prefix) and HMAC-SHA256 the "{id}.{timestamp}.{body}"
 * string. The signature header holds one or more space-separated `v1,<base64>` values.
 */
export async function verifyDodoWebhook(
  body: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null }
): Promise<boolean> {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  // Reject replayed messages older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const { createHmac, timingSafeEqual } = await import("crypto");

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest();

  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const provided = Buffer.from(sig, "base64");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

/** Look up a checkout session's payment state. Used to confirm a payment on return. */
export async function getDodoCheckout(
  sessionId: string
): Promise<{ paymentId: string | null; paymentStatus: string | null }> {
  const res = await fetch(`${BASE_URL}/checkouts/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Dodo checkout lookup failed (${res.status})`);
  const data = (await res.json()) as { payment_id?: string | null; payment_status?: string | null };
  return { paymentId: data.payment_id ?? null, paymentStatus: data.payment_status ?? null };
}