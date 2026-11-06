import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  Copy,
  Headset,
  KeyRound,
  Rocket,
  XCircle,
} from "lucide-react";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { formatINR } from "@/lib/format";
import { getDodoCheckout } from "@/lib/dodo";
import { getKelviqCheckout, KELVIQ_SESSION_PREFIX } from "@/lib/kelviq";
import { markOrderFailed, markOrderPaid } from "@/lib/dodo-orders";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Confirmed — Bharatrontech",
};

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ paid?: string }>;
};

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;

  let [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber));
  if (!order) notFound();

  // The gateway redirects here after payment. If the webhook has not landed yet
  // (or the tunnel hostname moved and it 404'd), confirm with the gateway
  // directly so the buyer still gets keys. Not gated on ?paid=1: however the
  // buyer reached this page, it should tell the truth, and a genuinely abandoned
  // attempt reconciles to failed instead of sitting pending forever.
  if (order.status === "pending" && order.stripeSessionId) {
    try {
      const sessionId = order.stripeSessionId;
      // Trust only the gateway's verdict. A failed attempt still carries a
      // payment id, so "has a payment id" is NOT proof of payment - that bug
      // issued license keys for declined cards.
      let status: "paid" | "failed" | "pending";
      let payment: {
        paymentId: string | null;
        amount: number | null;
        currency: string | null;
      };

      if (sessionId.startsWith(KELVIQ_SESSION_PREFIX)) {
        const kelviq = await getKelviqCheckout(sessionId.slice(KELVIQ_SESSION_PREFIX.length));
        status = kelviq.status;
        payment = {
          paymentId: kelviq.paymentId,
          amount: kelviq.amountUnits,
          currency: kelviq.currency,
        };
      } else {
        const dodo = await getDodoCheckout(sessionId);
        status =
          dodo.paymentStatus === "succeeded"
            ? "paid"
            : dodo.paymentStatus === "failed" || dodo.paymentStatus === "cancelled"
              ? "failed"
              : "pending";
        payment = {
          paymentId: dodo.paymentId,
          amount: dodo.totalAmount,
          currency: dodo.currency,
        };
      }

      if (status !== "pending") {
        if (status === "paid") await markOrderPaid(order.orderNumber, payment);
        else await markOrderFailed(order.orderNumber);
        [order] = await db
          .select()
          .from(orders)
          .where(eq(orders.orderNumber, orderNumber));
      }
    } catch (err) {
      console.error("[order] payment reconciliation failed", err);
    }
  }

  // license keys are revealed only once payment is captured (or legacy demo orders)
  const paid = order.status === "paid";
  const authorized = order.status === "authorized";

  return (
    <section className="relative overflow-hidden bg-ink-950 py-16 text-white">
      <div className="bg-blueprint absolute inset-0" />
      <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-glow/15 blur-[120px]" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal>
          <div className="text-center">
            <span
              className={`relative mx-auto grid h-20 w-20 place-items-center rounded-full ${
                order.status === "failed" || order.status === "refunded"
                  ? "bg-red-500/20 text-red-400"
                  : paid
                    ? "bg-teal-600/20 text-teal-glow"
                    : "bg-saffron-500/15 text-saffron-400"
              }`}
            >
              {order.status === "failed" || order.status === "refunded" ? (
                <XCircle className="h-10 w-10" />
              ) : paid ? (
                <>
                  <span className="animate-pulse-ring absolute inset-0 rounded-full bg-teal-600/30" />
                  <BadgeCheck className="h-10 w-10" />
                </>
              ) : (
                <Clock className="h-10 w-10" />
              )}
            </span>

            <h1 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              {order.status === "failed"
                ? "Payment declined"
                : order.status === "refunded"
                  ? "Order refunded"
                  : paid
                    ? "Order confirmed! 🎉"
                    : order.status === "pending"
                      ? "Finish your payment"
                      : "Payment authorized"}
            </h1>

            {paid ? (
              <p className="mt-3 text-slate-300">
                Thank you, <span className="font-bold text-white">{order.customerName}</span>. Your
                Bharatrontech licenses are ready.
              </p>
            ) : authorized ? (
              <p className="mt-3 max-w-xl text-slate-300">
                Your bank has authorized the payment and the charge is settling. Refresh this page in
                a moment — keys unlock automatically once the payment confirms.
              </p>
            ) : order.status === "pending" ? (
              <p className="mt-3 max-w-xl text-slate-300">
                Nothing has been charged — this payment simply didn&apos;t complete. Try again from{" "}
                <Link href="/checkout" className="font-bold text-saffron-400 underline">
                  checkout
                </Link>
                , or call us on{" "}
                <a href="tel:+918857912586" className="text-saffron-400 hover:underline">
                  +91 88579 12586
                </a>{" "}
                if the card keeps failing.
              </p>
            ) : order.status === "refunded" ? (
              <p className="mt-3 max-w-xl text-slate-300">
                This order was disputed and refunded in full. Nothing was charged beyond the
                original authorization.
              </p>
            ) : (
              <p className="mt-3 max-w-xl text-slate-300">
                All payment attempts were declined. Please check your card or try a different one at{" "}
                <Link href="/checkout" className="font-bold text-saffron-400 underline">
                  checkout
                </Link>
                .
              </p>
            )}

            <p className="mt-4 inline-block rounded-lg border border-white/15 bg-white/5 px-5 py-2 font-mono text-sm font-bold tracking-widest text-saffron-400">
              {order.orderNumber}
            </p>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 rounded-2xl border border-white/10 bg-ink-900/80 p-6 sm:p-8">
            <h2 className="font-display flex items-center gap-2 text-xl font-bold">
              <KeyRound className="h-5 w-5 text-saffron-400" /> Your license keys
            </h2>
            {paid ? (
              <p className="mt-1 text-sm text-slate-400">
                Copy these keys now — this page is the only place they appear. Enter one key per
                installation to activate.
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">
                License keys are issued the moment payment is captured. Refresh this page then —
                keys appear here for{" "}
                <span className="font-bold text-slate-200">{order.email}</span>.
              </p>
            )}
            <ul className={`mt-6 gap-4 ${paid ? "space-y-4" : "hidden"}`}>
              {order.items.map((item, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center"
                >
                  <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-950">
                    <Image src={item.image ?? "/images/product-manufacturing.jpg"} alt={item.name} fill sizes="80px" className="object-cover" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-display font-bold">{item.name}</span>
                    <span className="text-xs font-semibold text-slate-400">
                      Annual license · {formatINR(item.price)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 rounded-lg border border-saffron-500/40 bg-saffron-500/10 px-4 py-2.5 font-mono text-sm font-bold tracking-wider text-saffron-400">
                    {item.licenseKey ?? ""}
                    <Copy className="h-3.5 w-3.5 opacity-60" />
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-2 border-t border-white/10 pt-5 text-sm font-semibold">
              <div className="flex justify-between text-slate-400">
                <dt>Subtotal</dt><dd>{formatINR(order.subtotal ?? 0)}</dd>
              </div>
              <div className="flex justify-between text-slate-400">
                <dt>GST (18%)</dt><dd>{formatINR(order.gst ?? 0)}</dd>
              </div>
              <div className="flex justify-between font-display text-lg font-bold text-white">
                <dt>{paid ? "Total paid" : "Total on authorization"}</dt><dd>{formatINR(order.total)}</dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Rocket, title: "Onboarding call", desc: "Our team will call you within 1 business day to plan your go-live." },
              { icon: KeyRound, title: "Keep your keys", desc: "Save the keys above somewhere safe — one key activates one installation." },
              {
                icon: Headset,
                title: "Need help now?",
                desc: (
                  <>
                    Call{" "}
                    <a href="tel:+918857912586" className="text-saffron-400 hover:underline">
                      +91 88579 12586
                    </a>{" "}
                    or write to{" "}
                    <a href="mailto:aryaanchavan1@gmail.com" className="break-all text-saffron-400 hover:underline">
                      aryaanchavan1@gmail.com
                    </a>
                    .
                  </>
                ),
              },
            ].map((s) => (
              <div key={s.title} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <s.icon className="h-6 w-6 text-teal-glow" />
                <h3 className="font-display mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="mt-10 text-center">
          <Link
            href="/products"
            className="group inline-flex items-center gap-2 rounded-lg bg-saffron-500 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
          >
            Continue exploring the store
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
