import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ArrowRight,
  BadgeCheck,
  Copy,
  Headset,
  KeyRound,
  Mail,
  Rocket,
} from "lucide-react";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { formatINR } from "@/lib/format";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Confirmed — Bharatronix",
};

type Props = { params: Promise<{ orderNumber: string }> };

export default async function OrderPage({ params }: Props) {
  const { orderNumber } = await params;
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber));
  if (!order) notFound();

  return (
    <section className="relative overflow-hidden bg-ink-950 py-16 text-white">
      <div className="bg-blueprint absolute inset-0" />
      <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-glow/15 blur-[120px]" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal>
          <div className="text-center">
            <span className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-teal-600/20 text-teal-glow">
              <span className="animate-pulse-ring absolute inset-0 rounded-full bg-teal-600/30" />
              <BadgeCheck className="h-10 w-10" />
            </span>
            <h1 className="font-display mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
              Order confirmed! 🎉
            </h1>
            <p className="mt-3 text-slate-300">
              Thank you, <span className="font-bold text-white">{order.customerName}</span>. Your
              Bharatronix licenses are ready.
            </p>
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
            <p className="mt-1 text-sm text-slate-400">
              Also sent to <span className="font-bold text-slate-200">{order.email}</span>. Enter a key in the
              installer to activate each license.
            </p>
            <ul className="mt-6 space-y-4">
              {order.items.map((item, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center"
                >
                  <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-950">
                    <Image src={item.image} alt={item.name} fill sizes="80px" className="object-cover" />
                  </span>
                  <span className="flex-1">
                    <span className="block font-display font-bold">{item.name}</span>
                    <span className="text-xs font-semibold text-slate-400">
                      Annual license · {formatINR(item.price)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 rounded-lg border border-saffron-500/40 bg-saffron-500/10 px-4 py-2.5 font-mono text-sm font-bold tracking-wider text-saffron-400">
                    {item.licenseKey}
                    <Copy className="h-3.5 w-3.5 opacity-60" />
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-6 space-y-2 border-t border-white/10 pt-5 text-sm font-semibold">
              <div className="flex justify-between text-slate-400">
                <dt>Subtotal</dt><dd>{formatINR(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-400">
                <dt>GST (18%)</dt><dd>{formatINR(order.gst)}</dd>
              </div>
              <div className="flex justify-between font-display text-lg font-bold text-white">
                <dt>Total paid</dt><dd>{formatINR(order.total)}</dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Rocket, title: "Onboarding call", desc: "Our team will call you within 1 business day to plan your go-live." },
              { icon: Mail, title: "Check your inbox", desc: "Installers, keys and your GST invoice are on the way to your email." },
              { icon: Headset, title: "Need help now?", desc: "Call +91 98000 00000 or write to support@bharatronix.in." },
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