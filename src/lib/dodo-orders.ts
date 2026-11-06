import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, type OrderLineItem } from "@/db/schema";
import { formatINR, generateLicenseKey } from "@/lib/format";
import { hasEmailConfig, sendMail } from "@/lib/email";

/**
 * Decide whether a gateway payment actually covers the order before licenses
 * are issued. The floor is the pre-tax subtotal, not order.total: Dodo is the
 * merchant of record and charges its own GST on top, so a settled payment has
 * to at least cover the goods. ₹1 (100 paise) of slack absorbs paise rounding.
 * An unknown amount does not block settlement - only a known, too-small one.
 */
export function paymentCoversOrder(
  order: { subtotal: number | null; total: number },
  payment: { amount?: number | null; currency?: string | null }
): { ok: true } | { ok: false; reason: string } {
  if (payment.currency && payment.currency.toLowerCase() !== "inr") {
    return { ok: false, reason: `currency ${payment.currency} is not INR` };
  }
  if (payment.amount == null) return { ok: true };
  const goods = order.subtotal ?? order.total;
  const floor = Math.max(0, goods - 100);
  return payment.amount >= floor
    ? { ok: true }
    : { ok: false, reason: `paid ${formatINR(payment.amount)} for goods worth ${formatINR(goods)}` };
}

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

  const covered = paymentCoversOrder(order, payment);
  if (!covered.ok) {
    // Money we did not expect: leave the order pending for a human instead of
    // minting licenses against it.
    console.error(`[payments] not settling ${orderNumber}: ${covered.reason}`);
    return;
  }

  const items: OrderLineItem[] = (order.items ?? []).map((it) => ({
    ...it,
    licenseKey: it.licenseKey ?? generateLicenseKey(it.slug),
  }));

  // Claim the order atomically. A webhook delivery landing while the buyer's
  // return page reconciles used to let both paths mint a full set of keys, so
  // the buyer could be shown one set and emailed another. Only the writer that
  // moves the status out of "paid" gets to issue keys and send mail.
  const claimed = await db
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
    .where(and(eq(orders.id, order.id), ne(orders.status, "paid")))
    .returning({ id: orders.id });
  if (claimed.length === 0) return;

  await db
    .update(payments)
    .set({
      status: "captured",
      providerPaymentRef: payment.paymentId ?? null,
      amount: payment.amount ?? order.total,
      currency: (payment.currency ?? "inr").toLowerCase(),
    })
    .where(eq(payments.orderId, String(order.id)));

  await sendOrderConfirmation({
    orderNumber: order.orderNumber,
    email: order.email,
    customerName: order.customerName,
    items,
    total: payment.amount ?? order.total,
  });
}

/**
 * Best effort by design: the payment is already captured, so a mail failure
 * must not bubble up and make the webhook retry a payment that succeeded.
 * Silent no-op until SMTP credentials exist.
 */
async function sendOrderConfirmation(input: {
  orderNumber: string;
  email: string;
  customerName: string;
  items: OrderLineItem[];
  total: number;
}): Promise<void> {
  if (!hasEmailConfig()) return;
  const keys = input.items
    .map((it) => `  ${it.name}: ${it.licenseKey ?? "(on its way)"}`)
    .join("\n");
  const text =
    `Hello ${input.customerName},\n\n` +
    `We received ${formatINR(input.total)} for order ${input.orderNumber}.\n\n` +
    `Your license keys:\n${keys}\n\n` +
    `One key activates one installation - keep this email safe.\n\n` +
    `Bharatrontech · +91 88579 12586 · aryaanchavan1@gmail.com\n`;
  await sendMail({
    to: input.email,
    subject: `Your Bharatrontech license keys - ${input.orderNumber}`,
    text,
  });
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
