import type { Metadata } from "next";
import { FoundersBanner } from "./founders-banner";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Founders — Cronaierp",
  description:
    "Parth Ambre and Aryan Chavan founded Cronaierp to run the Indian factory ERD for operations teams who care about uptime, licensing, and trustworthy payments.",
};

export default function FoundersPage() {
  return (
    <main className="min-h-screen pt-14">
      <FoundersBanner />

      <section className="relative bg-ink-950 py-20 text-white">
        <div className="absolute inset-0 bg-blueprint opacity-[0.25]" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-2xl font-bold">Our promise</h2>
            <p className="mt-3 font-display text-lg font-bold text-white">
              Open, auditable software that Indian operations can trust
            </p>
            <p className="mt-4 text-slate-300">
              Cronaierp is the ERP platform we wished we had in 2018 — transparent pricing,
              instant license delivery, and a payments team built on trust, not tricks.
              Every order runs through Stripe with full 3D Secure, Radar compliance, and
              a 7-day pre-capture hold so chargebacks are neutralised before they ever leave
              the balance.
            </p>
          </div>

          <div className="mt-12 border-t border-white/10 pt-10">
            <h2 className="font-display text-2xl font-bold">The platform</h2>
            <p className="mt-4 text-slate-300">
              Built by Parth Ambre and Aryan Chavan, Cronaierp is operated from Mumbai and
              Bengaluru, with offline backups and trial licenses available. Reach the team at
              <Link href="mailto:founders@cronaierp.co" className="font-semibold underline hover:text-saffron-400">
                {" "}
                founders@cronaierp.co
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
