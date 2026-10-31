import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Server-side risk decision for the checkout UI.
// Body: { sessionId } (preferred) or { paymentIntentId }.
// Returns whether the buyer may take the friction-free path (Stripe Radar
// exceptionally-low-risk only) and whether 3DS applies.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    const sessionId = body?.sessionId as string | undefined;
    const paymentIntentId = body?.paymentIntentId as string | undefined;
    if (!sessionId && !paymentIntentId) {
      return NextResponse.json({ error: "missing session or payment intent id" }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: "2025-01-27.acacia",
      typescript: true,
    });

    let piId = paymentIntentId ?? "";
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? piId);
    }
    if (!piId) {
      return NextResponse.json({ error: "payment intent not found" }, { status: 404 });
    }

    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const charge = pi.latest_charge as Stripe.Charge | null;

    const amount = pi.amount;
    const currency = pi.currency;
    const amountUsd = amountUsdFromLocal(amount, currency);

    // Radar's verdict comes from the charge outcome: `risk_level` (low | elevated | highest)
    // and `risk_score` (0..9, higher = riskier).
    const riskLevel = charge?.outcome?.risk_level ?? "unknown";
    const riskScore = charge?.outcome?.risk_score;
    const card = charge?.payment_method_details?.card;
    const cvcCheck = card?.checks?.cvc_check ?? null;

    // Friction-free path: ONLY exceptionally low risk.
    // - Stripe must not have flagged the payment (not elevated, not highest)
    // - Card CVV check must have passed (or been unavailable — never "failed")
    // - Amount below the configured fast-path threshold
    const fastThreshold = parseFloat(process.env.STRIPE_FAST_RISK_THRESHOLD_USD ?? "50");
    const threeDsThreshold = parseFloat(process.env.STRIPE_3DS_THRESHOLD_USD ?? "100");

    const frictionFree =
      riskLevel !== "highest" &&
      riskLevel !== "elevated" &&
      (riskScore === undefined || riskScore <= 2) &&
      cvcCheck !== "fail" &&
      amountUsd < fastThreshold;

    // 3DS: required for amounts at/above the threshold, and always when Radar
    // elevated or highest. The low-risk sub-threshold class skips extra friction.
    // charge.payment_method_details.card.three_d_secure is missing from this SDK's Card type
    const requested3ds =
      (card as { three_d_secure?: { version?: string } | null } | undefined)?.three_d_secure
        ? "any"
        : null;
    const requires3ds =
      requested3ds === "any" ||
      requested3ds === "automatic" ||
      riskLevel === "elevated" ||
      riskLevel === "highest" ||
      amountUsd >= threeDsThreshold;

    const reason =
      riskLevel === "highest"
        ? "Stripe Radar flagged this payment as highest-risk; manual review required."
        : riskLevel === "elevated"
          ? "Stripe Radar elevated this payment; 3DS step-up required."
          : frictionFree
            ? `Exceptionally low risk (Radar score ${riskScore ?? "?"}/9) and under the fast-path threshold — friction-free checkout.`
            : `Standard path — 3DS applies at/above the ${threeDsThreshold} USD threshold.`;

    const frictionFreeMessage = frictionFree
      ? "Low-risk payment: proceed friction-free on the Stripe-hosted checkout. 3DS remains required if your account is configured to enforce it."
      : "Standard friction applied; the Stripe-hosted checkout will show required steps.";

    return NextResponse.json({
      allowed: true,
      frictionFree,
      requires3ds,
      reason,
      decision: {
        riskLevel,
        riskScore,
        cvcCheck,
        brand: card?.brand ?? undefined,
        last4: card?.last4 ?? undefined,
        amountUsd,
        amountLocal: amount,
        currency,
        frictionFreeMessage,
      },
    });
  } catch (err) {
    console.error("[stripe/radar] decision error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// Stripe amounts are in the smallest currency unit (paise for INR).
// 0.013 ≈ USD per INR, so amounts are converted for threshold comparisons.
function amountUsdFromLocal(amount: number, currency: string): number {
  const multiplier = currency === "inr" ? 100 : 100;
  return (amount / multiplier) * 0.013;
}