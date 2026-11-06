// Kelviq hosted checkout integration.
// Docs: https://docs.kelviq.com
//
// Kelviq is a merchant of record like Dodo: it holds the money, files the tax
// and pays out. It is NOT a gateway router - "any payment gateway" means the
// card/UPI/wallet methods Kelviq itself offers on its hosted page, so this file
// mirrors lib/dodo.ts rather than replacing it.
//
// Checkout is plan-based: every sellable item must exist as a published plan,
// which scripts/kelviq-sync.mjs creates from the store catalogue using the
// product slug as the plan identifier. Multi-item carts are charged with
// `customAmount` against the first item's plan.

const BASE_URL = (
  process.env.KELVIQ_API_BASE_URL || "https://api.kelviq.com/api/v1"
).replace(/\/+$/, "");

/**
 * Marks a session id in orders.stripe_session_id as Kelviq's. The column is
 * shared with Dodo (and predates Kelviq); rows without this prefix are Dodo's.
 */
export const KELVIQ_SESSION_PREFIX = "kq:";

export interface KelviqLineItem {
  slug: string;
  name: string;
  price: number; // rupees, pre-GST
  qty: number;
}

export interface CreateKelviqCheckoutInput {
  orderNumber: string;
  items: KelviqLineItem[];
  /** Order total in RUPEES, GST already included - exactly what the buyer was shown. */
  total: number;
  customer: { name: string; email: string; phone?: string };
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface KelviqCheckout {
  sessionId: string;
  checkoutUrl: string;
}

function apiKey(): string {
  const key = process.env.KELVIQ_SERVER_API_KEY;
  if (!key) throw new Error("KELVIQ_SERVER_API_KEY is not configured");
  return key;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey()}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Kelviq ${init.method ?? "GET"} ${path} failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

export async function createKelviqCheckout(
  input: CreateKelviqCheckoutInput
): Promise<KelviqCheckout> {
  const first = input.items[0];
  if (!first) throw new Error("Cannot start a Kelviq checkout with an empty cart");

  const body: Record<string, unknown> = {
    planIdentifier: first.slug,
    chargePeriod: "ONE_TIME",
    successUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    // The store's total already includes 18% GST and is the number the buyer
    // saw on the order summary. INCLUSIVE makes Kelviq treat the tax as part of
    // that amount instead of adding its own on top, so the amount charged is
    // exactly the amount displayed - no surprise line at payment.
    customAmount: input.total,
    currencyCode: "INR",
    taxBehavior: "INCLUSIVE",
    // Prefill from our own form; the page still lets the buyer correct a typo.
    email: input.customer.email,
    metadata: {
      order_number: input.orderNumber,
      customer_name: input.customer.name,
      cart_items: JSON.stringify(input.items.map(({ slug, qty }) => ({ slug, qty }))),
      ...(input.metadata ?? {}),
    },
  };

  let data: { checkoutUrl?: string; checkoutSessionId?: string };
  try {
    data = await call<{ checkoutUrl?: string; checkoutSessionId?: string }>("/checkout/", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A plan that was never synced is the most likely 4xx here, and the fix is
    // an operator action, so say so instead of "retry in a moment".
    if (/plan|4[0-9][0-9]/.test(message)) {
      throw new Error(
        `${message} - run "node scripts/kelviq-sync.mjs" to publish the catalogue in Kelviq.`
      );
    }
    throw err;
  }

  if (!data.checkoutUrl || !data.checkoutSessionId) {
    throw new Error("Kelviq response missing checkoutUrl/checkoutSessionId");
  }
  return { sessionId: data.checkoutSessionId, checkoutUrl: data.checkoutUrl };
}

/**
 * Verify a Kelviq webhook signature.
 *
 * Same Standard Webhooks scheme as Dodo (`{id}.{timestamp}.{body}` HMAC-SHA256,
 * `v1,<base64>` in the signature header, 5-minute replay window). Two details
 * differ and are handled defensively because both are unverifiable without a
 * delivery: the header may be named `kelviq-signature` or `webhook-signature`,
 * and the `kq_whsec_` secret may be base64 or raw - both key forms are tried.
 */
export async function verifyKelviqWebhook(
  body: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null }
): Promise<boolean> {
  const secret = process.env.KELVIQ_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const { createHmac, timingSafeEqual } = await import("crypto");
  const raw = secret.replace(/^kq_whsec_/, "").replace(/^whsec_/, "");
  const keys = [Buffer.from(raw, "base64"), Buffer.from(raw, "utf8")].filter((k) => k.length);
  if (!keys.length) return false;

  const signed = `${headers.id}.${headers.timestamp}.${body}`;
  const provided = headers.signature
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version, sig]) => version === "v1" && sig)
    .map(([, sig]) => Buffer.from(sig, "base64"));
  if (!provided.length) return false;

  return keys.some((key) => {
    const expected = createHmac("sha256", key).update(signed).digest();
    return provided.some(
      (sig) => sig.length === expected.length && timingSafeEqual(sig, expected)
    );
  });
}

/**
 * Look up a checkout session after the buyer returns. Normalizes Kelviq's two
 * status vocabularies (session: open/processing/success/expired, order:
 * COMPLETE/FAILED/CANCELLED/...) into paid/failed/pending, and reports the
 * amount in PAISE so it can go straight into markOrderPaid, which converts that
 * to the rupees this database stores.
 */
export async function getKelviqCheckout(sessionId: string): Promise<{
  status: "paid" | "failed" | "pending";
  amountUnits: number | null;
  currency: string | null;
  paymentId: string | null;
}> {
  const data = await call<{
    status?: string | null;
    amount?: string | null;
    currency?: string | null;
    order?: { id?: string; status?: string; amountTotal?: string | null } | null;
  }>(`/checkout/sessions/${encodeURIComponent(sessionId)}/`);

  const orderStatus = (data.order?.status ?? "").toUpperCase();
  const sessionStatus = (data.status ?? "").toLowerCase();

  let status: "paid" | "failed" | "pending" = "pending";
  if (orderStatus === "COMPLETE" || sessionStatus === "success") status = "paid";
  else if (
    ["FAILED", "CANCELLED", "EXPIRED", "FRAUDULENT"].includes(orderStatus) ||
    sessionStatus === "expired"
  )
    status = "failed";

  // Both are decimal strings in major units (e.g. "236000.00"), even though the
  // webhook's amount_units is minor units. Normalize to paise here.
  const rupees = Number(data.order?.amountTotal ?? data.amount);
  const amountUnits = Number.isFinite(rupees) ? Math.round(rupees * 100) : null;

  return {
    status,
    amountUnits,
    currency: data.currency ?? null,
    paymentId: data.order?.id ?? null,
  };
}
