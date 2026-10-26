"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, PackageX } from "lucide-react";
import type { Product } from "@/db/schema";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

type SortKey = "popular" | "price-asc" | "price-desc" | "rating";

export function CatalogBrowser({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState<SortKey>("popular");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.category)))],
    [products]
  );

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchesCategory = category === "All" || p.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.modules.some((m) => m.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
    switch (sort) {
      case "price-asc":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list = [...list].sort((a, b) => b.rating - a.rating);
        break;
      default:
        list = [...list].sort((a, b) => b.reviews - a.reviews);
    }
    return list;
  }, [products, query, category, sort]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search suites or modules — e.g. payroll, GST, POS…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-semibold text-ink-900 outline-none transition-colors placeholder:font-medium placeholder:text-slate-400 focus:border-saffron-500 focus:bg-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <SlidersHorizontal className="h-4 w-4 text-saffron-500" />
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-ink-900 outline-none focus:border-saffron-500"
          >
            <option value="popular">Most popular</option>
            <option value="rating">Highest rated</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>

      {/* Category chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
              category === c
                ? "bg-ink-900 text-white shadow-lg"
                : "border border-slate-200 bg-white text-slate-600 hover:border-saffron-500 hover:text-saffron-600"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="ml-auto self-center text-xs font-bold text-slate-400">
          {filtered.length} of {products.length} suites
        </span>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => (
            <Reveal key={p.slug} delay={(i % 3) * 80}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <PackageX className="h-12 w-12 text-slate-300" />
          <p className="font-display mt-4 text-lg font-bold text-ink-900">No suites match your search</p>
          <p className="mt-1 text-sm text-slate-500">
            Try “manufacturing”, “GST” or clear the filters.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
            className="mt-5 rounded-lg bg-saffron-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-saffron-600"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}