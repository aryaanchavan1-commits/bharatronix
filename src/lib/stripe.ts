import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia",
      typescript: true,
    });
  }
  return stripeClient;
}

/** Absolute site origin for Stripe success/cancel URLs (set VERCEL_URL on deploy). */
export function getOrigin(): string {
  const vercel = process.env.VERCEL_URL;
  if (vercel) {
    return `https://${vercel}`;
  }
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "") ||
    "http://localhost:3000";
}// Risk thresholds
export const THREE_DS_THRESHOLD_USD = 100;
export const MANUAL_REVIEW_THRESHOLD_USD = 500;
export const HIGH_RISK_COUNTRIES = [
  "PK",
  "AF",
  "SY",
  "MM",
  "IR",
  "KP",
  "NG",
  "RU",
];

// Checkout attempts allowed from one IP per 24h. It counts attempts, not sales,
// so an office, a hostel or anyone behind carrier NAT hits the wall fast - at 3
// a shop full of legitimate buyers was locked out by their own retries. The
// serious controls are the card network, the fraud score and the amount guard.
export const IP_VELOCITY_LIMIT = 20;

export const RETRY_DELAYS_MS = [1, 4, 12].map((h) => h * 60 * 60 * 1000);

// ---- Order numbers ----

const orderNumberPrefix = "BHAR";
let orderCounter = Date.now() % 1_000_000;

export async function generateOrderNumber(): Promise<string> {
  // Simple monotonic-ish order number; not globally unique across restarts, but
  // fine for local orders until you add a real sequence or DB sequence.
  const chunk = Math.floor(Math.random() * 900_000) + 100_000;
  const stamp = Math.floor(Date.now() / 1000) % 1_000_000;
  return `${orderNumberPrefix}-${stamp}-${chunk}`;
}

// ---- Local rate-limit stubs ----

const attemptByIp = new Map<
  string,
  { count: number; windowStart: number }
>();

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

export async function isRateLimited(
  clientIp: string
): Promise<boolean> {
  const now = Date.now();
  const entry = attemptByIp.get(clientIp);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    attemptByIp.set(clientIp, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return true;
  }
  entry.count += 1;
  return false;
}

export async function recordCheckoutAttempt(
  clientIp: string
): Promise<void> {
  // Handled inside isRateLimited for this stub; no-op here.
  return;
}// ---- Reserved helpers used by checkout / webhook / cron flows ----
export function isHighRiskCountry(countryCode?: string | null): boolean {
  return Boolean(
    countryCode && HIGH_RISK_COUNTRIES.includes(countryCode.toUpperCase())
  );
}

/** Derive a display name from the buyer's email if we didn't receive one. */
export function customerNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return "Customer";
  return local.replace(/[^A-Za-z0-9._\- ]/g, "").slice(0, 48) || "Customer";
}


