import { NextRequest, NextResponse } from "next/server";
import { verifyKelviqWebhook } from "@/lib/kelviq";
import { markOrderPaid, markOrderRefunded } from "@/lib/dodo-orders";

export const dynamic = "force-dynamic";

type KelviqEvent = {
  id?: string;
  type?: string;
  data?: {
    object?: {
      id?: string | null;
      status?: string | null;
      amount?: number | string | null;
      amount_units?: number | null;
      currency?: string | null;
      metadata?: Record<string, string> | null;
    } | null;
  };
};

/**
 * Kelviq webhook. Payloads look like { id, type, created_at, data: { object } },
 * and the order number we attached at checkout comes back in
 * data.object.metadata.order_number.
 *
 * Needs KELVIQ_WEBHOOK_SECRET (shown once when the endpoint was created).
 * Without it every delivery is rejected as unsigned.
 *
 * Kelviq retries on 5xx/429 and may deliver duplicates, so settlement goes
 * through markOrderPaid, which claims the order atomically and is a no-op once
 * the order is already paid.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const valid = await verifyKelviqWebhook(raw, {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    // Kelviq documents `Kelviq-Signature`; the Standard Webhooks name is
    // accepted too. Only one of them will be present.
    signature:
      req.headers.get("kelviq-signature") ?? req.headers.get("webhook-signature"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: KelviqEvent;
  try {
    event = JSON.parse(raw) as KelviqEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const type = event.type ?? "";
  const object = event.data?.object ?? {};
  const orderNumber = object.metadata?.order_number;
  if (!orderNumber) return NextResponse.json({ received: true });

  try {
    switch (type) {
      case "checkout.completed":
        // A completed checkout that is not `success` is not money in the bank.
        if (object.status && object.status !== "success") break;
        await markOrderPaid(orderNumber, {
          paymentId: object.id ?? event.id ?? null,
          // amount_units is paise; amount is the decimal rupee string. Prefer
          // the integer and fall back to the string, both scaled to paise.
          amount: object.amount_units ?? ((Number(object.amount) || 0) * 100 || undefined),
          currency: object.currency,
        });
        break;
      case "order.refunded":
        await markOrderRefunded(orderNumber);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[kelviq:webhook] ${type} handler failed`, err);
    // 5xx so Kelviq retries the delivery.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
