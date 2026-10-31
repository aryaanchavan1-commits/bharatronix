import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  Boxes,
  ClipboardList,
  Factory,
  Headset,
  Landmark,
  ExternalLink,
  PackageSearch,
  Quote,
  Rocket,
  ShoppingCart,
  Star,
  Store,
  Truck,
  Users,
  Wrench,
  ShieldCheck,
  KeyRound,
  DownloadCloud,
} from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { HeroSection } from "@/components/hero-section";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { Faq } from "@/components/faq";

export const dynamic = "force-dynamic";

const clients = [
  "Shakti Steel Works", "Apex Pharma", "Kiran Textiles", "MetroMart Retail",
  "Deccan Auto Components", "Sunrise Foods", "Veer Logistics", "Ganesh Agro",
  "Pune Precision Tools", "Coastal Chemicals",
];

const modules = [
  { icon: Factory, name: "Manufacturing", desc: "BOM, MRP, shop-floor & OEE tracking" },
  { icon: Landmark, name: "Finance & GST", desc: "Ledgers, e-Invoice, GSTR filing" },
  { icon: Store, name: "Retail & POS", desc: "2-second billing, multi-outlet stock" },
  { icon: Users, name: "HR & Payroll", desc: "Attendance, PF/ESI, one-click salary" },
  { icon: PackageSearch, name: "Inventory", desc: "Batch, serial & warehouse control" },
  { icon: ShoppingCart, name: "CRM & Sales", desc: "Leads to orders, WhatsApp follow-ups" },
  { icon: Truck, name: "Supply Chain", desc: "Vendors, GRN, landed-cost tracking" },
  { icon: ClipboardList, name: "Purchase", desc: "Indent to PO with approval flows" },
  { icon: Wrench, name: "Projects & Assets", desc: "Costing, milestones, maintenance" },
  { icon: ShieldCheck, name: "Quality", desc: "Inward, in-process & final QC" },
  { icon: BarChart3, name: "Analytics & AI", desc: "Live dashboards, demand forecasts" },
  { icon: Boxes, name: "E-commerce Sync", desc: "Amazon, Flipkart & Shopify bridge" },
];

const steps = [
  {
    icon: ShoppingCart,
    title: "Choose & checkout",
    desc: "Pick the suite that fits your industry, pay securely online with a GST invoice. Transparent yearly pricing — no sales calls required.",
  },
  {
    icon: KeyRound,
    title: "Get instant license keys",
    desc: "Keys are generated the moment your order is confirmed. Download the installer for cloud or on-premise and activate in minutes.",
  },
  {
    icon: DownloadCloud,
    title: "Migrate & go live",
    desc: "Our engineers migrate your Tally / SAP / Excel data free, train your team in Hindi or English, and take you live — typically within 7 days.",
  },
];

export default async function HomePage() {
  const catalog = await db.select().from(products).orderBy(asc(products.price));

  return (
    <>
      <HeroSection />

      {/* Trusted-by marquee */}
      <section className="border-b border-slate-200 bg-white py-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
          Trusted by 2,400+ Indian businesses
        </p>
        <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div className="animate-marquee flex w-max gap-12 pr-12">
            {[...clients, ...clients].map((c, i) => (
              <span
                key={i}
                className="font-display whitespace-nowrap text-lg font-bold text-slate-300 transition-colors hover:text-saffron-500"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Products */}
      <section id="store" className="bg-dots-light py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-saffron-600">
                  The ERP Store
                </p>
                <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                  Pick your suite. Go live this week.
                </h2>
                <p className="mt-3 max-w-2xl text-slate-600">
                  Every suite includes free data migration, onboarding, training and
                  statutory GST updates. Yearly pricing, instant license delivery.
                </p>
              </div>
              <Link
                href="/products"
                className="group flex items-center gap-2 rounded-lg border-2 border-ink-900 px-5 py-2.5 text-sm font-bold text-ink-900 transition-all hover:bg-ink-900 hover:text-white"
              >
                View all products
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 3) * 90}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Platform / modules */}
      <section id="platform" className="relative overflow-hidden bg-ink-950 py-20 text-white">
        <div className="bg-blueprint absolute inset-0" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-teal-glow/10 blur-[130px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <Reveal>
              <div className="lg:sticky lg:top-28">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-glow">
                  One Platform
                </p>
                <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                  12 modules.
                  <br />
                  One live core.
                </h2>
                <p className="mt-4 leading-relaxed text-slate-400">
                  Every Bharatrontech suite runs on the same modular core — so a sale
                  updates stock, stock triggers production, production posts to the
                  ledger, and payroll closes the loop. No integrations to maintain,
                  no data silos, no reconciliation spreadsheets.
                </p>
                <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-300">
                  {[
                    "API-first: connect anything with REST & webhooks",
                    "AI forecasting trained on Indian demand patterns",
                    "India data residency, ISO 27001 certified",
                    "Works in Hindi, English + 8 regional languages",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/products/omnisuite-erp"
                  className="group mt-8 inline-flex items-center gap-2 rounded-lg bg-saffron-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
                >
                  Get the full OmniSuite
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {modules.map((m, i) => (
                <Reveal key={m.name} delay={(i % 3) * 70}>
                  <div className="group h-full rounded-xl border border-white/10 bg-ink-900/70 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-saffron-500/50 hover:bg-ink-800">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-saffron-500/15 text-saffron-400 transition-colors group-hover:bg-saffron-500 group-hover:text-white">
                      <m.icon className="h-5 w-5" />
                    </span>
                    <h3 className="font-display mt-3 font-bold">{m.name}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{m.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-saffron-600">
                How buying works
              </p>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                From checkout to go-live in 3 steps
              </h2>
            </div>
          </Reveal>
          <div className="relative mt-12 grid gap-8 md:grid-cols-3">
            <div className="absolute left-[16%] right-[16%] top-9 hidden border-t-2 border-dashed border-saffron-500/30 md:block" />
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 120}>
                <div className="relative text-center">
                  <div className="relative mx-auto grid h-[72px] w-[72px] place-items-center rounded-2xl bg-ink-900 text-saffron-400 shadow-xl">
                    <s.icon className="h-8 w-8" />
                    <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-saffron-500 font-display text-sm font-bold text-white">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-display mt-5 text-lg font-bold text-ink-900">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal>
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-saffron-600">
                Questions, answered
              </p>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                Everything you need to know
              </h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="mt-10">
              <Faq />
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA band */}
      <section className="relative overflow-hidden bg-ink-950 py-16 text-white">
        <div className="absolute inset-0 bg-gradient-to-r from-saffron-600/20 via-transparent to-teal-glow/15" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-4 sm:px-6 lg:flex-row">
          <Reveal>
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to run your business on one ERP?
              </h2>
              <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-slate-300">
                <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-saffron-400" /> Go live in 7 days</span>
                <span className="flex items-center gap-2"><BadgeIndianRupee className="h-4 w-4 text-saffron-400" /> Transparent pricing</span>
                <span className="flex items-center gap-2"><Headset className="h-4 w-4 text-saffron-400" /> Support in Hindi & English</span>
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Link
              href="/products"
              className="group flex items-center gap-2 rounded-lg bg-saffron-500 px-8 py-4 text-base font-bold text-white shadow-2xl shadow-saffron-500/30 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
            >
              Start with a free trial
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}