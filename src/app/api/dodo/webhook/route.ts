import { NextRequest, NextResponse } from "next/server";
import { verifyDodoWebhook } from "@/lib/dodo";
import { markOrderFailed, markOrderPaid, markOrderRefunded } from "@/lib/dodo-orders";

export const dynamic = "force-dynamic";

type DodoEvent = {
  type?: string;
  eventType?: string;
  data?: {
    payment_id?: string | null;
    total_amount?: number | null;
    currency?: string | null;
    metadata?: Record<string, string> | null;
  };
};

/**
 * Dodo sends Standard Webhooks events. We only care about the payment
 * lifecycle; the order number travels in the checkout metadata.
 *
 * Needs DODO_WEBHOOK_SECRET (the `whsec_...` value from the endpoint's
 * Overview tab). Without it every delivery is rejected as unsigned.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const valid = await verifyDodoWebhook(raw, {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  });
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(raw) as DodoEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const type = event.type ?? event.eventType ?? "";
  const data = event.data ?? {};
  const orderNumber = data.metadata?.order_number;
  if (!orderNumber) return NextResponse.json({ received: true });

  try {
    switch (type) {
      case "payment.succeeded":
        await markOrderPaid(orderNumber, {
          paymentId: data.payment_id,
          amount: data.total_amount ?? undefined,
          currency: data.currency,
        });
        break;
      case "payment.failed":
      case "payment.cancelled":
        await markOrderFailed(orderNumber);
        break;
      case "refund.succeeded":
        await markOrderRefunded(orderNumber);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`[dodo:webhook] ${type} handler failed`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
