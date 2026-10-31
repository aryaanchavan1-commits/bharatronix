import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="relative grid min-h-[70vh] place-items-center overflow-hidden bg-ink-950 text-white">
      <div className="bg-blueprint absolute inset-0" />
      <div className="relative text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-saffron-500/15 text-saffron-400">
          <Compass className="h-8 w-8" />
        </span>
        <p className="font-display mt-6 text-6xl font-bold text-saffron-400">404</p>
        <h1 className="font-display mt-2 text-2xl font-bold">This module doesn&rsquo;t exist</h1>
        <p className="mt-2 text-sm text-slate-400">
          The page you&rsquo;re looking for was moved, renamed or never shipped.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-saffron-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-saffron-500/25 transition-all hover:bg-saffron-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Cronaierp home
        </Link>
      </div>
    </section>
  );
}