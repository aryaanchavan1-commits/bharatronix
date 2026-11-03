// Dodo Payments (https://app.dodopayments.com/) hosted checkout integration.
// Docs: https://docs.dodopayments.com/api-reference/checkout-sessions/create
//
// Dodo is a merchant-of-record platform: every sellable item must exist as a
// Product in the Dodo dashboard. Map store slugs -> Dodo product ids via the
// DODO_PRODUCT_IDS env var, e.g. {"erp-basic":"prod_abc123"}.

const BASE_URL = (
  process.env.DODO_PAYMENTS_BASE_URL ||
  (process.env.DODO_PAYMENTS_ENV === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://app.dodopayments.com")
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
    return {
      product_id: productId,
      quantity: item.qty,
      amount: item.price, // override price so store DB stays the source of truth
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

  if (input.customer.company) body.customer_business_name = input.customer.company;
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
 * Verify a Standard Webhooks (svix-compatible) signature from Dodo.
 * Headers: webhook-id, webhook-timestamp, webhook-signature.
 * Secret is the base64 raw 32-byte Ed25519 public key from the Dodo dashboard.
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

  const { createPublicKey, verify } = await import("crypto");

  const rawKey = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (rawKey.length !== 32) return false;

  // SPKI DER prefix for Ed25519 public keys.
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
  const publicKey = createPublicKey({ key: spki, format: "der", type: "spki" });
  const signedContent = Buffer.from(`${headers.id}.${headers.timestamp}.${body}`, "utf8");
  const sig = Buffer.from(headers.signature, "base64");
  try {
    return verify(null, signedContent, publicKey, sig);
  } catch {
    return false;
  }
}