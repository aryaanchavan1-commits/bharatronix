"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ShoppingCart, Star, Users, Cloud } from "lucide-react";
import type { Product } from "@/db/schema";
import { formatINR } from "@/lib/format";
import { useCart } from "./cart-provider";

export function ProductCard({ product }: { product: Product }) {
  const { addItem, lastAdded } = useCart();
  const justAdded = lastAdded === product.slug;
  const discount = product.oldPrice
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-ink-900/10">
      <Link href={`/products/${product.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-ink-900">
        <Image
          src={product.image}
          alt={`${product.name} dashboard`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {product.badge && (
          <span className="absolute left-3 top-3 rounded-md bg-saffron-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-lg">
            {product.badge}
          </span>
        )}
        {discount > 0 && (
          <span className="absolute right-3 top-3 rounded-md bg-teal-glow px-2.5 py-1 text-[11px] font-extrabold text-ink-950 shadow-lg">
            {discount}% OFF
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="rounded-full bg-ink-900/5 px-2.5 py-1 uppercase tracking-wide text-ink-700">
            {product.category}
          </span>
          <span className="flex items-center gap-1 text-amber-500">
            <Star className="h-3.5 w-3.5 fill-current" />
            {product.rating}
            <span className="font-semibold text-slate-400">({product.reviews})</span>
          </span>
        </div>

        <Link href={`/products/${product.slug}`}>
          <h3 className="font-display mt-3 text-lg font-bold leading-snug text-ink-900 transition-colors group-hover:text-saffron-600">
            {product.name}
          </h3>
        </Link>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-500">
          {product.tagline}
        </p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-teal-600" /> {product.usersIncluded}
          </span>
          <span className="flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5 text-teal-600" /> {product.deployment}
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <p className="font-display text-2xl font-bold text-ink-900">
              {formatINR(product.price)}
              <span className="text-xs font-semibold text-slate-400"> /year</span>
            </p>
            {product.oldPrice && (
              <p className="text-xs font-semibold text-slate-400 line-through">
                {formatINR(product.oldPrice)}
              </p>
            )}
          </div>
          <Link
            href={`/products/${product.slug}`}
            className="flex items-center gap-1 text-sm font-bold text-saffron-600 transition-all hover:gap-2"
          >
            Details <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          onClick={() =>
            addItem({
              slug: product.slug,
              name: product.name,
              price: product.price,
              image: product.image,
            })
          }
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
            justAdded
              ? "bg-teal-600 text-white"
              : "bg-ink-900 text-white hover:bg-saffron-500"
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
      </div>
    </article>
  );
}