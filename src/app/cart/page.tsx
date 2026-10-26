"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { formatINR } from "@/lib/format";

export default function CartPage() {
  const { items, subtotal, setQty, removeItem, count } = useCart();
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;

  return (
    <section className="bg-dots-light min-h-[70vh] py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Your Cart
          {count > 0 && <span className="ml-3 text-lg font-semibold text-slate-400">({count} license{count > 1 ? "s" : ""})</span>}
        </h1>

        {items.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-saffron-500/10 text-saffron-500">
              <ShoppingCart className="h-8 w-8" />
            </span>
            <p className="font-display mt-5 text-xl font-bold text-ink-900">Your cart is empty</p>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Explore our ERP suites — manufacturing, retail, finance, HR — and add the right fit for your business.
            </p>
            <Link
              href="/products"
              className="group mt-6 flex items-center gap-2 rounded-lg bg-saffron-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:bg-saffron-600"
            >
              Browse ERP Store
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.slug}
                  className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
                >
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-ink-900 sm:w-36"
                  >
                    <Image src={item.image} alt={item.name} fill sizes="150px" className="object-cover" />
                  </Link>
                  <div className="flex-1">
                    <Link
                      href={`/products/${item.slug}`}
                      className="font-display font-bold text-ink-900 transition-colors hover:text-saffron-600"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      Annual license · instant key delivery
                    </p>
                    <p className="mt-1.5 font-display text-lg font-bold text-ink-900">
                      {formatINR(item.price)}
                      <span className="text-xs font-semibold text-slate-400"> /year</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-lg border border-slate-200">
                      <button
                        onClick={() => setQty(item.slug, item.qty - 1)}
                        aria-label="Decrease quantity"
                        className="grid h-9 w-9 place-items-center text-slate-500 hover:text-saffron-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center font-display text-sm font-bold">{item.qty}</span>
                      <button
                        onClick={() => setQty(item.slug, item.qty + 1)}
                        aria-label="Increase quantity"
                        className="grid h-9 w-9 place-items-center text-slate-500 hover:text-saffron-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="w-28 text-right font-display font-bold text-ink-900">
                      {formatINR(item.price * item.qty)}
                    </p>
                    <button
                      onClick={() => removeItem(item.slug)}
                      aria-label={`Remove ${item.name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              <Link
                href="/products"
                className="inline-flex items-center gap-2 text-sm font-bold text-saffron-600 hover:underline"
              >
                ← Continue shopping
              </Link>
            </div>

            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-6 shadow-lg shadow-ink-900/5 lg:sticky lg:top-24">
              <h2 className="font-display text-lg font-bold text-ink-900">Order Summary</h2>
              <dl className="mt-4 space-y-3 text-sm font-semibold">
                <div className="flex justify-between text-slate-600">
                  <dt>Subtotal</dt>
                  <dd>{formatINR(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-slate-600">
                  <dt>GST (18%)</dt>
                  <dd>{formatINR(gst)}</dd>
                </div>
                <div className="flex justify-between text-teal-600">
                  <dt>Onboarding & migration</dt>
                  <dd>FREE</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 font-display text-lg font-bold text-ink-900">
                  <dt>Total</dt>
                  <dd>{formatINR(total)}</dd>
                </div>
              </dl>
              <Link
                href="/checkout"
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-saffron-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <p className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                Secure checkout · 30-day money-back guarantee
              </p>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}