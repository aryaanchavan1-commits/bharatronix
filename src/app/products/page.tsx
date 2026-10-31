import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { ShieldCheck, Truck, Headset, BadgeIndianRupee } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CatalogBrowser } from "@/components/catalog-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ERP Store — Bharatrontech",
  description:
    "Browse and buy Bharatrontech ERP suites: manufacturing, retail POS, finance & GST, HR & payroll. Instant license delivery.",
};

const assurances = [
  { icon: Truck, label: "Free data migration" },
  { icon: ShieldCheck, label: "14-day free trial" },
  { icon: BadgeIndianRupee, label: "GST invoice included" },
  { icon: Headset, label: "Onboarding & training" },
];

export default async function ProductsPage() {
  const catalog = await db.select().from(products).orderBy(asc(products.price));

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 py-14 text-white">
        <div className="bg-blueprint absolute inset-0" />
        <div className="absolute -right-24 top-0 h-72 w-72 rounded-full bg-saffron-500/15 blur-[110px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-saffron-400">
            Bharatrontech ERP Store
          </p>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            Every suite. One transparent price.
          </h1>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            {assurances.map((a) => (
              <span key={a.label} className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <a.icon className="h-4 w-4 text-teal-glow" />
                {a.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-dots-light py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <CatalogBrowser products={catalog} />
        </div>
      </section>
    </>
  );
}