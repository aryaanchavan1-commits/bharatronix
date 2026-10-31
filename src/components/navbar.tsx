"use client";

import Link from "next/link";
import { useState } from "react";
import { Boxes, ShoppingCart, Menu, X, PhoneCall } from "lucide-react";
import { useCart } from "./cart-provider";

const links = [
  { href: "/products", label: "ERP Store" },
  { href: "/#platform", label: "Platform" },
  { href: "/founders", label: "Founders" },
  { href: "/#faq", label: "FAQ" },
];

export function Navbar() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-saffron-500 text-white shadow-lg shadow-saffron-500/30 transition-transform group-hover:rotate-6">
            <Boxes className="h-5 w-5" />
          </span>
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Cronaierp
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3.5 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="tel:+919800000000"
            className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:text-teal-glow lg:flex"
          >
            <PhoneCall className="h-4 w-4" />
            +91 98000 00000
          </a>
          <Link
            href="/cart"
            className="relative flex items-center gap-2 rounded-lg bg-saffron-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-saffron-500/25 transition-all hover:-translate-y-0.5 hover:bg-saffron-600"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-teal-glow px-1 text-[11px] font-extrabold text-ink-950">
                {count}
              </span>
            )}
          </Link>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-white/10 bg-ink-950 px-4 py-3 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}