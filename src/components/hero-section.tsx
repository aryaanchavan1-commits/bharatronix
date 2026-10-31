"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  PlayCircle,
  Factory,
  Landmark,
  Store,
  Users,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

const Hero3D = dynamic(() => import("./hero-3d"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <div className="h-40 w-40 animate-pulse rounded-full bg-saffron-500/20 blur-2xl" />
    </div>
  ),
});

const chips = [
  { icon: Factory, label: "Manufacturing", className: "left-0 top-10", delay: "0s" },
  { icon: Landmark, label: "Finance & GST", className: "right-0 top-24", delay: "1.2s" },
  { icon: Store, label: "Retail POS", className: "bottom-24 left-2", delay: "2.1s" },
  { icon: Users, label: "HR & Payroll", className: "bottom-10 right-4", delay: "0.6s" },
];

const stats = [
  { value: "2,400+", label: "Businesses running on Bharatrontech" },
  { value: "12", label: "Integrated ERP modules" },
  { value: "99.95%", label: "Uptime SLA, India data residency" },
  { value: "4.8★", label: "Average customer rating" },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-ink-950 text-white">
      <div className="bg-blueprint absolute inset-0" />
      <div className="absolute -left-40 top-0 h-[480px] w-[480px] rounded-full bg-saffron-500/15 blur-[140px]" />
      <div className="absolute -right-32 bottom-0 h-[420px] w-[420px] rounded-full bg-teal-glow/10 blur-[140px]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* Copy */}
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-saffron-500/40 bg-saffron-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-saffron-400">
              <Sparkles className="h-3.5 w-3.5" />
              India&rsquo;s ERP Software Store
            </p>
            <h1 className="font-display mt-6 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
              Run your entire business on{" "}
              <span className="text-saffron-400">one ERP.</span>
              <br />
              Buy it online in{" "}
              <span className="relative whitespace-nowrap text-teal-glow">
                minutes.
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 200 9"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M2 7C60 2 140 2 198 6"
                    stroke="#2dd4bf"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Manufacturing, retail, finance, HR — Bharatrontech suites connect every
              department into one live command centre. Transparent pricing, instant
              license keys, free migration from Tally &amp; SAP.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/products"
                className="group flex items-center gap-2 rounded-lg bg-saffron-500 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-saffron-500/30 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
              >
                Browse ERP Store
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#platform"
                className="flex items-center gap-2 rounded-lg border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition-all hover:border-teal-glow hover:text-teal-glow"
              >
                <PlayCircle className="h-5 w-5" />
                Explore the Platform
              </a>
            </div>

            <p className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <ShieldCheck className="h-4 w-4 text-teal-glow" />
              14-day free trial · No credit card · GST invoice included
            </p>
          </div>

          {/* 3D scene */}
          <div className="relative h-[380px] sm:h-[460px] lg:h-[540px]">
            <Hero3D />
            {chips.map((chip) => (
              <div
                key={chip.label}
                className={`animate-float-slow absolute ${chip.className} pointer-events-none hidden items-center gap-2 rounded-lg border border-white/15 bg-ink-900/80 px-3 py-2 text-xs font-bold text-slate-100 shadow-xl backdrop-blur-sm sm:flex`}
                style={{ animationDelay: chip.delay }}
              >
                <chip.icon className="h-4 w-4 text-saffron-400" />
                {chip.label}
              </div>
            ))}
            <p className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Drag to rotate · 12 modules, one core
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-ink-900/90 px-6 py-5">
              <p className="font-display text-3xl font-bold text-saffron-400">{s.value}</p>
              <p className="mt-1 text-xs font-semibold leading-snug text-slate-400">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}