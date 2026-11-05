import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, type OrderLineItem } from "@/db/schema";
import { generateLicenseKey } from "@/lib/format";

/**
 * Mark an order as paid and issue its license keys. Safe to call repeatedly:
 * orders already paid are left untouched, so webhook retries and a buyer
 * refreshing the return page cannot issue keys twice.
 */
export async function markOrderPaid(
  orderNumber: string,
  payment: { paymentId?: string | null; amount?: number | null; currency?: string | null }
): Promise<void> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order || order.status === "paid") return;

  const items: OrderLineItem[] = (order.items ?? []).map((it) => ({
    ...it,
    licenseKey: it.licenseKey ?? generateLicenseKey(it.slug),
  }));

  await db
    .update(orders)
    .set({
      status: "paid",
      items,
      stripePaymentIntentId: payment.paymentId ?? order.stripePaymentIntentId,
      // slice(-5), not -6: order numbers end in a dash (CRN-...-A2JD6), so
      // -6 would keep the dash and render "INV-2026--A2JD6".
      invoiceNumber: `INV-${new Date().getFullYear()}-${order.orderNumber.slice(-5)}`,
      retryCount: 0,
      nextRetryAt: null,
    })
    .where(eq(orders.id, order.id));

  await db
    .update(payments)
    .set({
      status: "captured",
      providerPaymentRef: payment.paymentId ?? null,
      amount: payment.amount ?? order.total,
      currency: (payment.currency ?? "inr").toLowerCase(),
    })
    .where(eq(payments.orderId, String(order.id)));
}

export async function markOrderFailed(orderNumber: string): Promise<void> {
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order) return;
  // Never demote a captured payment: webhooks can arrive out of order, so a
  // late payment.failed for an earlier attempt must not revoke good keys.
  if (order.status === "paid" || order.status === "refunded") return;
  await db.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
  await db
    .update(payments)
    .set({ status: "failed" })
    .where(eq(payments.orderId, String(order.id)));
}

export async function markOrderRefunded(orderNumber: string): Promise<void> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  if (!order) return;
  await db.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
  await db
    .update(payments)
    .set({ status: "refunded" })
    .where(eq(payments.orderId, String(order.id)));
}
