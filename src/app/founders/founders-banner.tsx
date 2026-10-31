import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";

const founders = [
  {
    name: "Parth Ambre",
    role: "Co-founder & CEO",
    tagline: "Built the checkout engine and fraud controls so thousands of Indian factories run on Cronaierp.",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=faces&q=60",
  },
  {
    name: "Aryan Chavan",
    role: "Co-founder & Engineering Lead",
    tagline: "Architects the security and licensing platform. Formerly led payments infrastructure at a Bengaluru SaaS scale-up.",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=faces&q=60",
  },
];

export function FoundersBanner() {
  return (
    <section className="relative overflow-hidden bg-ink-950 pt-10 text-white">
      <div className="absolute inset-0 bg-blueprint opacity-50" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-saffron-400">
            The team behind Cronaierp
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Built by operators, for Indian operations
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-slate-300">
            Parth and Aryan met building stand-alone ERP for small Indian manufacturers.
            Cronaierp is what they wish they had in 2018: transparent pricing, instant
            licenses, and a payment flow customers can trust.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {founders.map((f) => (
            <div
              key={f.name}
              className="group flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 transition-all hover:border-saffron-500/40 hover:bg-white/10 hover:bg-[radial-gradient(circle_at_1px_0,rgba(255,200,80,0.12)_0_0,transparent_90%)]"
            >
              <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-ink-900 ring-1 ring-white/10">
                <Image
                  src={f.image}
                  alt={f.name}
                  fill
                  sizes="15rem"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 rounded-xl ring-1 ring-black/30" />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                  <div className="rounded-xl bg-ink-900 px-3 py-1 text-xs font-bold text-saffron-400 ring-1 ring-black/30">
                    {f.role}
                  </div>
                </div>
              </div>

              <div>
                <p className="font-display text-base font-bold text-white">
                  {f.name}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-slate-300">
                {f.tagline}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-5 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-sm font-semibold text-slate-200">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-glow" />
            Payment protected by Stripe Radar
          </span>
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 2.5l3 3-3 3v-3l-3-3z" />
            </svg>
            Full trace logging, payments protected
          </span>
        </div>
      </div>
    </section>
  );
}
