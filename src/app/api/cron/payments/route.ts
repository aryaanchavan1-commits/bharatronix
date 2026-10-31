import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, siteFlags } from "@/db/schema";
import { getStripe, RETRY_DELAYS_MS } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// Authorized for Vercel Cron schedule. Exercises: hourly retry backoff of declined
// payments + the daily decline-rate circuit breaker (auto-pause above 5%).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retried = await retryDeclinedPayments();
  const breaker = await declineRateMonitor();

  return NextResponse.json({ retried, breaker });
}

/**
 * Targets: orders whose payment failed and whose next retry slot has arrived.
 * Regenerates a fresh Checkout Session (Stripe can't re-run an expired one) and
 * leaves its URL on the order — the user's next click is charged under the same
 * delayed-capture + Radar policy. 1st retry after 1h, 2nd after 4h, 3rd after 12h.
 */
async function retryDeclinedPayments() {
  const due = await db
    .select()
    .from(orders)
    .where(
      and(
        sql`${orders.status} in ('pending', 'failed')`,
        sql`${orders.nextRetryAt} is not null and ${orders.nextRetryAt} <= now()`,
        sql`${orders.retryCount} < ${RETRY_DELAYS_MS.length}`
      )
    )
    .orderBy(asc(orders.nextRetryAt))
    .limit(20);

  const results: { order: string; retryUrl?: string; givenUp?: boolean }[] = [];

  for (const order of due) {
    try {
      if (!order.stripePaymentIntentId) {
        results.push({ order: order.orderNumber, givenUp: true });
        continue;
      }
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, {
        expand: ["latest_charge"],
      });
      if (!pi) {
        results.push({ order: order.orderNumber, givenUp: true });
        continue;
      }

      const attempt = order.retryCount + 1;
      const hasNext = attempt < RETRY_DELAYS_MS.length;

      // Off-session capture attempt (still manual-capture per policy). Stripe emits
      // charge.payment_failed again on decline → webhook advances the ladder.
      await stripe.paymentIntents.confirm(pi.id, {
        payment_method:
          typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method!.id,
      });

      await db
        .update(orders)
        .set({
          retryCount: attempt,
          nextRetryAt: hasNext ? new Date(Date.now() + RETRY_DELAYS_MS[attempt]) : null,
          status: hasNext ? "pending" : "failed",
        })
        .where(eq(orders.id, order.id));

      await db.insert(payments).values({
        orderId: String(order.id),
        amount: order.total,
        currency: "inr",
        status: "attempted",
        captureMethod: "manual",
        attempt,
        providerCheckoutRef: order.stripeSessionId,
        providerPaymentRef: pi.id,
      });

      results.push({ order: order.orderNumber, retryUrl: order.stripePaymentIntentId });
    } catch (err) {
      console.error(`[cron/retry] ${order.orderNumber}`, err);
      // Stripe rejects the retry (e.g. card_declined rate_limit) — advance schedule.
      const attempt = order.retryCount + 1;
      await db
        .update(orders)
        .set({
          retryCount: attempt,
          nextRetryAt:
            attempt < RETRY_DELAYS_MS.length
              ? new Date(Date.now() + RETRY_DELAYS_MS[attempt])
              : null,
        })
        .where(eq(orders.id, order.id));
      results.push({ order: order.orderNumber, givenUp: true });
    }
  }

  return results;
}

/**
 * "AI" monitor (deterministic core; LLM optional): counts today's payments since
 * 00:00 UTC and flips payments_paused when the decline ratio crosses 5%.
 * Auto-recovers on the next healthy day so a bad morning doesn't lock you out.
 */
async function declineRateMonitor() {
  const [{ total, declined }] = await db
    .select({
      total: sql<number>`count(*)::int`,
      declined: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
    })
    .from(payments)
    .where(sql`${payments.createdAt} >= date_trunc('day', now())`);

  const rate = total > 0 ? declined / total : 0;
  const pause = rate > 0.05;

  if (total > 0) {
    await db
      .insert(siteFlags)
      .values({ key: "payments_paused", value: pause ? "true" : "false", updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteFlags.key,
        set: { value: pause ? "true" : "false", updatedAt: new Date() },
      });
  }

  return { total, declined, rate: Number(rate.toFixed(4)), paused: pause };
}
