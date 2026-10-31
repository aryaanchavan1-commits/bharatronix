import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import {
  orders,
  payments,
  fraudEvents,
  type Order,
} from "@/db/schema";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import {
  sendWebhookNotification,
  updateBINRoutingStrategy,
  adjustTransactionPatterns,
  updateIPRotationPolicy,
  encryptTransactionData,
} from "@/lib/fraud";
import {
  BIN_ROUTING_STRATEGIES,
  HIGH_RISK_COUNTRIES,
} from "@/lib/fraud-config";
import { getStripe as getStripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "unknown"
  );
}

function getUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent") ?? null;
}

// Verify Stripe webhook signature
function verifyStripeSignature(
  payload: string,
  signature: string
): Stripe.Event | null {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("[fraud/webhooks] STRIPE_WEBHOOK_SECRET not configured");
    return null;
  }

  try {
    const stripe = getStripeClient();
    return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[fraud/webhooks] Signature verification failed:", err);
    return null;
  }
}

// Handle payment_intent.succeeded - capture payment after review window
async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  req: NextRequest
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;

  // Update payment status
  if (pi.metadata?.order_id) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, pi.metadata.order_id))
      .limit(1);

    if (order) {
      await db
        .update(payments)
        .set({ status: "authorized", providerPaymentRef: pi.id })
        .where(
          and(
            sql`${payments.orderId} = ${order.id}`,
            eq(payments.status, "pending")
          )
        );

      await db
        .update(orders)
        .set({ status: "authorized" })
        .where(eq(orders.id, order.id));
    }
  }
}

// Handle payment_intent.payment_failed - declined transaction
async function handlePaymentIntentFailed(
  event: Stripe.Event,
  req: NextRequest
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const clientIp = getClientIP(req);
  const userAgent = getUserAgent(req);

  const declineReason = pi.last_payment_error?.code || pi.last_payment_error?.message || "unknown";

  // Log fraud event
  await db.insert(fraudEvents).values({
    eventType: "decline",
    severity: classifyDeclineSeverity(declineReason),
    description: `Payment declined: ${declineReason}. Amount: ₹${pi.amount / 100}`,
    ip: clientIp,
    userAgent,
    source: "stripe_webhook",
  });

  // Update payment record
  if (pi.metadata?.order_id) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, pi.metadata.order_id))
      .limit(1);

    if (order) {
      await db
        .update(payments)
        .set({
          status: "failed",
          statusReason: declineReason,
          providerPaymentRef: pi.id,
          isFraudulent: isFraudulentDecline(declineReason),
        })
        .where(
          and(
            sql`${payments.orderId} = ${order.id}`,
            eq(payments.status, "pending")
          )
        );

      // Update order status
      await db
        .update(orders)
        .set({ status: "failed" })
        .where(eq(orders.id, order.id));

      // Adjust BIN routing based on decline
      const bin = extractBinFromCharge(pi);
      if (bin) {
        await updateBINRoutingStrategy(
          bin,
          classifyBinAction(declineReason),
          `Payment declined: ${declineReason}`,
          undefined
        );
      }

      // Send webhook notification for monitoring
      await sendWebhookNotification(
        "payment_intent.declined",
        {
          orderId: pi.metadata.order_id,
          paymentIntentId: pi.id,
          declineReason,
          amount: pi.amount,
          clientIp,
          userAgent,
        },
        classifyDeclineSeverity(declineReason) === "high" ? "high" : "medium"
      );
    }
  }

  // Update transaction patterns based on decline rate
  const declineRate = await calculateDeclineRate();
  await adjustTransactionPatterns(
    { declineRate },
    undefined
  );
}

function classifyDeclineSeverity(reason: string): "low" | "medium" | "high" | "critical" {
  const highRiskReasons = [
    "fraudulent",
    "lost_card",
    "stolen_card",
    "suspected_fraud",
    "card_not_secure",
    "incorrect_cvc",
    "do_not_honor",
    "stop_payment",
    "expired_card",
    "processing_error",
  ];

  const criticalReasons = [
    "fraudulent",
    "stolen_card",
    "lost_card",
    "suspected_fraud",
  ];

  if (criticalReasons.some((r) => reason.includes(r))) return "critical";
  if (highRiskReasons.some((r) => reason.includes(r))) return "high";
  return "medium";
}

function isFraudulentDecline(reason: string): boolean {
  return ["fraudulent", "stolen_card", "lost_card", "suspected_fraud"].some(
    (r) => reason.includes(r)
  );
}

function classifyBinAction(declineReason: string): "allow" | "manual_review" | "block" | "high_value_only" {
  if (isFraudulentDecline(declineReason)) return "block";
  if (declineReason.includes("do_not_honor") || declineReason.includes("stop_payment")) {
    return "manual_review";
  }
  return "manual_review";
}

function extractBinFromCharge(pi: Stripe.PaymentIntent): string | null {
  // In production, you would decrypt or fetch BIN from Stripe
  return null;
}

async function calculateDeclineRate(): Promise<number> {
  const results = await db
    .select({
      total: sql<number>`count(*)::int`,
      declined: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
    })
    .from(payments)
    .where(sql`${payments.createdAt} >= date_trunc('day', now())`)
    .limit(1);

  const first = results[0];
  if (!first) return 0;
  const total = first.total;
  const declined = first.declined;
  return total > 0 ? declined / total : 0;
}

// Handle charge.disputed - chargeback
async function handleChargeDisputed(
  event: Stripe.Event,
  req: NextRequest
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const clientIp = getClientIP(req);
  const userAgent = getUserAgent(req);

  // Log chargeback event
  await db.insert(fraudEvents).values({
    eventType: "chargeback",
    severity: "critical",
    description: `Chargeback received for charge ${charge.id}. Amount: ₹${(charge.amount || 0) / 100}`,
    ip: clientIp,
    userAgent,
    source: "stripe_webhook",
  });

  // Update payment as fraudulent
  if (charge.metadata?.order_id) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, charge.metadata.order_id))
      .limit(1);

    if (order) {
      await db
        .update(payments)
        .set({
          status: "charged_back",
          isFraudulent: true,
        })
        .where(
          and(
            sql`${payments.orderId} = ${order.id}`,
            sql`${payments.providerPaymentRef} = ${charge.id}`
          )
        );

      await db
        .update(orders)
        .set({ status: "refunded" })
        .where(eq(orders.id, order.id));
    }
  }

  // Lock IP associated with chargeback
  if (charge.billing_details?.address?.country !== "IN") {
    await updateIPRotationPolicy({
      lockedIPs: [clientIp],
    });
  }

  // Update BIN routing
  const bin = charge.payment_method_details?.card?.fingerprint;
  if (bin) {
    await updateBINRoutingStrategy(
      bin,
      "block",
      "Chargeback received",
      undefined
    );
  }

  // Send critical alert
  await sendWebhookNotification(
    "charge.disputed",
    {
      chargeId: charge.id,
      orderId: charge.metadata?.order_id,
      amount: charge.amount,
      clientIp,
      userAgent,
    },
    "critical"
  );

  // Adjust transaction patterns for chargeback
  const chargebackRate = await calculateChargebackRate();
  await adjustTransactionPatterns(
    { chargebackRate, fraudDetections: 1 },
    bin ?? undefined
  );
}

async function calculateChargebackRate(): Promise<number> {
  const results = await db
    .select({
      total: sql<number>`count(*)::int`,
      chargedback: sql<number>`count(*) filter (where ${payments.isFraudulent} = true)::int`,
    })
    .from(payments)
    .where(sql`${payments.createdAt} >= date_trunc('day', now())`)
    .limit(1);

  const first = results[0];
  if (!first) return 0;
  const total = first.total;
  const chargedback = first.chargedback;
  return total > 0 ? chargedback / total : 0;
}

// Handle charge.refunded - refund processed
async function handleChargeRefunded(
  event: Stripe.Event,
  req: NextRequest
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  const clientIp = getClientIP(req);

  await db.insert(fraudEvents).values({
    eventType: "refund",
    severity: "low",
    description: `Refund processed for charge ${charge.id}`,
    ip: clientIp,
    source: "stripe_webhook",
  });
}

// Handle payment_method.attached - new payment method
async function handlePaymentMethodAttached(
  event: Stripe.Event
): Promise<void> {
  const pm = event.data.object as Stripe.PaymentMethod;

  // Check if CVV is disabled for this payment method
  if (pm.type === "card") {
    const card = pm.card;
    if (card) {
      const bin = `${card.brand}|${card.fingerprint}`;
      const routing = BIN_ROUTING_STRATEGIES.binRules.get(bin);

      if (routing) {
        await db.insert(fraudEvents).values({
          eventType: "bin_routing_check",
          severity: "low",
          description: `Payment method attached: ${card.brand}${card.last4 ? ` ending in ${card.last4}` : ""}. Routing: ${routing.action}`,
          source: "stripe_webhook",
        });
      }
    }
  }
}

// Handle payment_method.updated - CVV/3DS changes
async function handlePaymentMethodUpdated(
  event: Stripe.Event
): Promise<void> {
  const pm = event.data.object as Stripe.PaymentMethod;

  if (pm.type === "card" && pm.card) {
    const binProxy = `${pm.card.brand}|${pm.card.fingerprint}`;

    if (isHighRiskBinProxy(binProxy)) {
      await updateBINRoutingStrategy(
        binProxy,
        "high_value_only",
        "CVV potentially disabled for high-risk BIN - prioritizing for high-value transactions",
        undefined
      );

      await sendWebhookNotification(
        "cvv_check_disabled",
        {
          paymentMethodId: pm.id,
          bin: binProxy,
          brand: pm.card.brand,
          last4: pm.card.last4,
          action: "prioritize_high_value_bins",
        },
        "medium"
      );
    }
  }
}

function isHighRiskBinProxy(binProxy: string): boolean {
  if (BIN_ROUTING_STRATEGIES.blockedBins.includes(binProxy)) {
    return true;
  }

  const routing = BIN_ROUTING_STRATEGIES.binRules.get(binProxy);
  if (routing?.action === "block" || routing?.action === "manual_review") {
    return true;
  }

  return false;
}

// Handle account.updated - account health changes
async function handleAccountUpdated(
  event: Stripe.Event,
  req: NextRequest
): Promise<void> {
  const account = event.data.object as Stripe.Account;

  const chargesEnabled = (account as unknown as { charges?: { enabled?: boolean } }).charges?.enabled ?? true;
  const payoutsEnabled = (account as unknown as { payouts?: { enabled?: boolean } }).payouts?.enabled ?? true;

  await db.insert(fraudEvents).values({
    eventType: "account_health",
    severity: (
      !chargesEnabled || !payoutsEnabled ? "high" : "low"
    ) as "low" | "medium" | "high" | "critical",
    description: `Account health update: charges=${chargesEnabled}, payouts=${payoutsEnabled}`,
    source: "stripe_webhook",
  });

  if (!chargesEnabled || !payoutsEnabled) {
    await sendWebhookNotification(
      "account.health_issue",
      {
        accountId: account.id,
        chargesEnabled,
        payoutsEnabled,
      },
    "high" as const
    );
  }
}

// Main webhook handler
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("stripe-signature");
    const payload = await req.text();

    if (!signature) {
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 }
      );
    }

    const event = verifyStripeSignature(payload, signature);
    if (!event) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    const clientIp = getClientIP(req);
    const userAgent = getUserAgent(req);

    await db.insert(fraudEvents).values({
      eventType: "webhook_received",
      severity: "low",
      description: `Stripe webhook received: ${event.type}`,
      ip: clientIp,
      userAgent,
      source: "stripe_webhook",
    });

    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event, req);
        break;

      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        await handlePaymentIntentFailed(event, req);
        break;

      case "charge.dispute.created":
      case "charge.dispute.updated":
        await handleChargeDisputed(event, req);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event, req);
        break;

      case "payment_method.attached":
        await handlePaymentMethodAttached(event);
        break;

      case "payment_method.updated":
        await handlePaymentMethodUpdated(event);
        break;

      case "account.updated":
        await handleAccountUpdated(event, req);
        break;

      default:
        console.log(`[fraud/webhooks] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[fraud/webhooks] Error processing webhook:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
