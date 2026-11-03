import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatINR } from "@/lib/format";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderNumber: string }> };

async function getOrder(orderNumber: string, userEmail: string) {
  const rows = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  const order = rows[0];
  if (!order) return null;
  if (order.email.toLowerCase() !== userEmail.toLowerCase()) {
    return "owned";
  }
  return order;
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  authorized: "bg-blue-100 text-blue-800",
  paid: "bg-teal-100 text-teal-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
};

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;
  const session = await getSession();
  const user = session?.user;

  const email = user?.email?.toLowerCase();

  const order = await getOrder(orderNumber, email ?? "");

  if (!order) notFound();
  if (order === "owned") notFound();

  const statusClass = statusColors[order.status] ?? "bg-slate-200 text-slate-700";

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="flex items-center justify-between border-b border-slate-200 pb-4">
        <Link
          href={user ? "/my-account" : "/products"}
          className="inline-flex items-center gap-2 text-sm font-bold text-saffron-600 transition hover:underline"
        >
          <Loader2 className="h-4 w-4" /> {user ? "Back to My Account" : "Back to Store"}
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-saffron-600"
        >
          Continue shopping
        </Link>
      </header>

      <div className="mt-8 prose prose-invert max-w-none border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Order</p>
            <p className="mt-1 text-xl font-bold text-ink-900">{order.orderNumber}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${statusClass}`}>
              {order.status}
            </span>
            <span className="text-sm font-semibold text-slate-400">
              {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">Email</p>
            <p className="mt-1 truncate text-sm font-bold text-ink-900">{order.email}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400">Total</p>
            <p className="mt-1 text-sm font-bold text-ink-900">{formatINR(order.total)}</p>
          </div>
          {order.phone && (
            <div>
              <p className="text-xs font-semibold text-slate-400">Phone</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{order.phone}</p>
            </div>
          )}
          {order.company && (
            <div>
              <p className="text-xs font-semibold text-slate-400">Company</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">{order.company}</p>
            </div>
          )}
        </div>

        {order.address && (
          <div className="mt-6 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-ink-900">Shipping address</p>
            <p className="mt-1 text-slate-600">{order.address}</p>
          </div>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="font-display text-lg font-bold text-ink-900">Items</h3>
          <ul className="mt-4 divide-y divide-slate-100">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="font-semibold text-ink-900">{item.name}</p>
                  <p className="text-xs font-medium text-slate-500">Qty {item.qty} · {formatINR(item.price)} each</p>
                </div>
                <p className="font-bold text-ink-900">{formatINR(item.price * item.qty)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-500">Subtotal</p>
              <p className="text-sm font-bold text-ink-900">{formatINR(order.subtotal ?? 0)}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">GST (18%)</p>
              <p className="text-sm font-bold text-ink-900">{formatINR(order.gst ?? 0)}</p>
            </div>
            <div className="border-t border-slate-200 pt-2">
              <p className="text-base font-display font-bold text-ink-900">Total paid {formatINR(order.total)}</p>
            </div>
          </div>
        </div>

        {(order.items as Array<{ licenseKey?: string | null }>).some((it) => it.licenseKey != null) && (
          <div className="mt-6 rounded-lg border border-saffron-200 bg-saffron-50 p-4">
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <KeyRound className="h-4 w-4 text-saffron-500" /> License keys
            </h3>
            <div className="mt-3 space-y-2">
              {(order.items as Array<{ licenseKey?: string | null }>).filter((it) => it.licenseKey != null).map(
                (item, i) => (
                  <details key={i} className="rounded-lg border border-slate-200 bg-white p-3 text-sm" open>
                    <summary className="cursor-pointer font-semibold text-ink-900">{(item as { name: string }).name}</summary>
                    {item.licenseKey != null && (
                      <code className="mt-2 block rounded bg-slate-50 px-2 py-1 font-mono text-slate-700">
                        {item.licenseKey}
                      </code>
                    )}
                  </details>
                )
              )}
            </div>
          </div>
        )}

        {order.status === "pending" && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This order is still pending payment.{" "}
            <Link href={`/checkout?session=${order.stripeSessionId ?? ""}`} className="font-bold underline">
              {/* stripeSessionId now stores the Dodo session/payment reference */}
              Complete payment
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
