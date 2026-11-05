import Link from "next/link";
import { Boxes, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-ink-950 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-saffron-500 text-white">
                <Boxes className="h-5 w-5" />
              </span>
              <span className="font-display text-xl font-bold text-white">
                Bharatrontech
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed">
              Enterprise-grade ERP software, built in India for the world.
              Instant license delivery, one platform, one price.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-teal-glow">
              <ShieldCheck className="h-4 w-4" /> Secure buyback · GST invoices
            </p>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-widest text-white">
              Products
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                ["OmniSuite ERP", "/products/omnisuite-erp"],
                ["ManufPro", "/products/manufpro-erp"],
                ["RetailOne POS", "/products/retailone-pos"],
                ["FinCore GST", "/products/fincore-gst"],
                ["PeopleSync HR", "/products/peoplesync-hr"],
                ["CloudLite", "/products/cloudlite-smb"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="transition-colors hover:text-saffron-400">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-widest text-white">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                ["Home", "/"],
                ["All products", "/products"],
                ["FAQ", "/#faq"],
                ["Order status", "/checkout"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="transition-colors hover:text-saffron-400">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-sm font-bold uppercase tracking-widest text-white">
              Contact
            </h4>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-saffron-400" />
                Bharatrontech HQ, Hinjawadi Phase 2, Pune, Maharashtra 411057
              </li>
              <li>
                <a href="tel:+918857912586" className="flex items-center gap-2.5 transition-colors hover:text-saffron-400">
                  <Phone className="h-4 w-4 shrink-0 text-saffron-400" />
                  +91 88579 12586
                </a>
              </li>
              <li>
                <a href="mailto:aryaanchavan1@gmail.com" className="flex items-center gap-2.5 break-all transition-colors hover:text-saffron-400">
                  <Mail className="h-4 w-4 shrink-0 text-saffron-400" />
                  aryaanchavan1@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} Bharatrontech. All rights reserved.</p>
          <p>Made in India · Secure checkout by Dodo Payments</p>
        </div>
      </div>
    </footer>
  );
}