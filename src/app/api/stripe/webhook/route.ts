import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, type OrderLineItem } from "@/db/schema";
import { getStripe, RETRY_DELAYS_MS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Payment lifecycle:
 *  - checkout.session.completed                 → license keys issued, order "authorized"
 *  - payment_intent.amount_capturable_updated   → radar risk snapshot stored
 *  - charge.succeeded (captured)                → order "paid"
 *  - charge.payment_failed                      → retry scheduled 1h / 4h / 12h
 *  - charge.disputed.*                          → immediate full refund (see onDispute)
 *  - charge.refunded                            → order "refunded"
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing webhook signature configuration" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type.startsWith("charge.dispute.")) {
      await onDispute(event.data.object as Stripe.Dispute);
    } else {
      switch (event.type) {
        case "checkout.session.completed":
          await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case "payment_intent.amount_capturable_updated":
          await onCapturableUpdated(event.data.object as Stripe.PaymentIntent);
          break;
        case "charge.succeeded": {
          const charge = event.data.object as Stripe.Charge;
          if (charge.captured) {
            await db
              .update(orders)
              .set({ status: "paid" })
              .where(eq(orders.stripePaymentIntentId, String(charge.payment_intent)));
            await db
              .update(payments)
              .set({ status: "captured" })
              .where(eq(payments.providerPaymentRef, String(charge.payment_intent)));
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data.object as Stripe.PaymentIntent;
          const piId = pi.id;
          // Schedule our retry ladder: 1 attempt after 1h, then 4h, then 12h.
          const [order] = await db
            .select({ id: orders.id, retryCount: orders.retryCount })
            .from(orders)
            .where(eq(orders.orderNumber, pi.metadata?.order_id ?? ""))
            .limit(1);
          if (order) {
            const attempt = order.retryCount + 1;
            const hasNext = attempt < RETRY_DELAYS_MS.length;
            await db
              .update(orders)
              .set({
                status: hasNext ? "pending" : "failed",
                retryCount: attempt,
                stripePaymentIntentId: piId,
                nextRetryAt: hasNext ? new Date(Date.now() + RETRY_DELAYS_MS[attempt]) : null,
              })
              .where(eq(orders.id, order.id));
            await db
              .insert(payments)
              .values({
                orderId: String(order.id),
                amount: pi.amount,
                currency: pi.currency,
                status: "failed",
                captureMethod: "manual",
                attempt,
                providerPaymentRef: piId,
                clientIp: req.headers.get("x-forwarded-for") ?? null,
              });
          }
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          await db
            .update(orders)
            .set({ status: "refunded" })
            .where(eq(orders.stripePaymentIntentId, String(charge.payment_intent)));
          await db
            .update(payments)
            .set({ status: "refunded" })
            .where(eq(payments.providerPaymentRef, String(charge.payment_intent)));
          break;
        }
        default:
          break;
      }
    }
  } catch (err) {
    console.error(`webhook ${event.type} handler failed`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/* ------------------------------------------------------------------ */

/** Dispute opened → refund in full (Stripe closes the dispute once the full amount is refunded). */
async function onDispute(dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  if (!chargeId) return;
  const stripe = getStripe();

  const already = await stripe.refunds.list({ charge: chargeId, limit: 1 });
  if (already.data.length === 0) {
    await stripe.refunds.create({
      charge: chargeId,
      reason: "requested_by_customer",
      metadata: { auto_refunded_on_dispute: "true" },
    });
  }

  const charge = await stripe.charges.retrieve(chargeId);
  const piId = String(charge.payment_intent);
  await db.update(orders).set({ status: "refunded" }).where(eq(orders.stripePaymentIntentId, piId));
  await db
    .update(payments)
    .set({ status: "refunded", isFraudulent: true })
    .where(eq(payments.providerPaymentRef, piId));
}

/** Radar risk snapshot + license keys + order status — same event keys both the "authorized" state. */
async function onCheckoutCompleted(session: Stripe.Checkout.Session) {
  const piId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!piId || !session.metadata?.items) return;

  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
  const charge = pi.latest_charge as Stripe.Charge | null;

  const [order] = await db.select().from(orders).where(eq(orders.stripeSessionId, session.id)).limit(1);
  if (!order || order.status === "authorized" || order.status === "paid") return;

  // License keys are issued once; reversible while capture is pending.
  const items: OrderLineItem[] = (order.items ?? []).map((it) => ({
    ...it,
    licenseKey: it.licenseKey ?? generateLicenseKey(it.slug),
  }));

  await db
    .update(orders)
    .set({
      status: "authorized",
      stripePaymentIntentId: piId,
      retryCount: 0,
      nextRetryAt: null,
      items,
      invoiceNumber: `INV-${new Date().getFullYear()}-${order.orderNumber.slice(-6)}`,
    })
    .where(eq(orders.id, order.id));

  await db
    .update(payments)
    .set({
      status: "authorized",
      providerPaymentRef: piId,
      captureMethod: "manual",
      stripeRiskLevel: charge?.outcome?.risk_level ?? null,
      stripeRiskScore: charge?.outcome?.risk_score ?? null,
      isFraudulent: charge?.outcome?.risk_level === "highest",
      brand: charge?.payment_method_details?.card?.brand ?? null,
      last4: charge?.payment_method_details?.card?.last4 ?? null,
      country: charge?.payment_method_details?.card?.country ?? null,
    })
    .where(eq(payments.providerCheckoutRef, session.id));
}

async function onCapturableUpdated(pi: Stripe.PaymentIntent) {
  await db
    .update(orders)
    .set({ status: "authorized" })
    .where(eq(orders.stripePaymentIntentId, pi.id));
}

function generateLicenseKey(seed: string): string {
  const base = seed.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CRNA";
  const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${rand()}-${rand()}-${rand()}`;
}
