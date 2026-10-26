"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ShoppingCart, Zap, RotateCcw, ShieldCheck } from "lucide-react";
import type { Product } from "@/db/schema";
import { formatINR } from "@/lib/format";
import { useCart } from "./cart-provider";

export function BuyPanel({ product }: { product: Product }) {
  const { addItem, lastAdded } = useCart();
  const [qty, setQty] = useState(1);
  const router = useRouter();
  const justAdded = lastAdded === product.slug;

  const item = {
    slug: product.slug,
    name: product.name,
    price: product.price,
    image: product.image,
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-lg shadow-ink-900/5">
      <div className="flex items-end gap-3">
        <p className="font-display text-4xl font-bold text-ink-900">
          {formatINR(product.price)}
        </p>
        <span className="pb-1 text-sm font-semibold text-slate-400">/year</span>
        {product.oldPrice && (
          <span className="pb-1 text-sm font-semibold text-slate-400 line-through">
            {formatINR(product.oldPrice)}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        + 18% GST · includes {product.usersIncluded.toLowerCase()} · {product.deployment}
      </p>

      <div className="mt-5 flex items-center gap-4">
        <span className="text-sm font-bold text-slate-600">Licenses</span>
        <div className="flex items-center rounded-lg border border-slate-200">
          <button
            onClick={() => setQty(Math.max(1, qty - 1))}
            aria-label="Decrease quantity"
            className="grid h-10 w-10 place-items-center text-slate-500 transition-colors hover:text-saffron-600"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center font-display font-bold text-ink-900">{qty}</span>
          <button
            onClick={() => setQty(Math.min(99, qty + 1))}
            aria-label="Increase quantity"
            className="grid h-10 w-10 place-items-center text-slate-500 transition-colors hover:text-saffron-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <span className="ml-auto text-sm font-bold text-ink-900">
          {formatINR(product.price * qty)}
        </span>
      </div>

      <button
        onClick={() => {
          addItem(item, qty);
          router.push("/checkout");
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-saffron-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
      >
        <Zap className="h-4 w-4" /> Buy Now — Instant License
      </button>
      <button
        onClick={() => addItem(item, qty)}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-bold transition-all ${
          justAdded
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-white"
        }`}
      >
        {justAdded ? (
          <>
            <Check className="h-4 w-4" /> Added to Cart
          </>
        ) : (
          <>
            <ShoppingCart className="h-4 w-4" /> Add to Cart
          </>
        )}
      </button>

      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500">
        <p className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-teal-600" /> 14-day free trial before you commit
        </p>
        <p className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-teal-600" /> 30-day money-back guarantee
        </p>
      </div>
    </div>
  );
}