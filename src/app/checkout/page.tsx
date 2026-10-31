"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  LoaderCircle,
  Mail,
  Phone,
  User,
  CreditCard,
} from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatINR } from "@/lib/format";

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: "",
    email: "",
    phone: "",
    company: "",
    gstin: "",
  });

  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ slug: i.slug, qty: i.qty })),
          customer: {
            name: form.customerName,
            email: form.email,
            phone: form.phone,
            company: form.company,
            address: form.gstin,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed. Please try again.");
      // Stripe hosts the payment page: card entry, 3DS and CVV checks happen there.
      if (data.checkoutUrl) {
        clear();
        window.location.href = data.checkoutUrl;
        return;
      }
      window.location.href = `/order/${data.orderNumber}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (items.length === 0 && !submitting) {
    return (
      <section className="bg-dots-light grid min-h-[60vh] place-items-center py-16">
        <div className="text-center">
          <p className="font-display text-2xl font-bold text-ink-900">Nothing to check out yet</p>
          <p className="mt-2 text-sm text-slate-500">Add an ERP suite to your cart first.</p>
          <Link
            href="/products"
            className="mt-6 inline-block rounded-lg bg-saffron-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 hover:bg-saffron-600"
          >
            Browse ERP Store
          </Link>
        </div>
      </section>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-ink-900 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-saffron-500 focus:bg-white";

  return (
    <section className="bg-dots-light min-h-[70vh] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition-colors hover:text-saffron-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to cart
        </Link>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Secure Checkout
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-lg font-bold text-ink-900">Billing details</h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Full name *</span>
                <span className="relative block">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required value={form.customerName} onChange={update("customerName")} placeholder="e.g. Rohan Sharma" className={inputClass} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Work email *</span>
                <span className="relative block">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required type="email" value={form.email} onChange={update("email")} placeholder="you@company.in" className={inputClass} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Phone *</span>
                <span className="relative block">
                  <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input required value={form.phone} onChange={update("phone")} placeholder="+91 98XXX XXXXX" className={inputClass} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Company name</span>
                <span className="relative block">
                  <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={form.company} onChange={update("company")} placeholder="Sharma Industries Pvt. Ltd." className={inputClass} />
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">GSTIN (for tax invoice)</span>
                <span className="relative block">
                  <Building2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={form.gstin} onChange={update("gstin")} placeholder="27XXXXX1234X1Z5" className={inputClass} />
                </span>
              </label>
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-saffron-500 py-4 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Redirecting to Stripe…
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" /> Pay with Stripe · {formatINR(total)}
                </>
              )}
            </button>
          </div>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-6 shadow-lg shadow-ink-900/5 lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-bold text-ink-900">Your licenses</h2>
            <ul className="mt-4 space-y-4">
              {items.map((item) => (
                <li key={item.slug} className="flex items-center gap-3">
                  <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-ink-900">
                    <Image src={item.image} alt={item.name} fill sizes="64px" className="object-cover" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold leading-tight text-ink-900">{item.name}</span>
                    <span className="text-xs font-semibold text-slate-500">× {item.qty}</span>
                  </span>
                  <span className="text-sm font-bold text-ink-900">{formatINR(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-sm font-semibold">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt><dd>{formatINR(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>GST (18%)</dt><dd>{formatINR(gst)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 font-display text-lg font-bold text-ink-900">
                <dt>Total</dt><dd>{formatINR(total)}</dd>
              </div>
            </dl>
          </aside>
        </form>
      </div>
    </section>
  );
}
