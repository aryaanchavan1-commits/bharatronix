"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

const faqs = [
  {
    q: "How do I receive my ERP license after purchase?",
    a: "Instantly. The moment your order is confirmed, license keys are generated and shown on your order page (also emailed). Download the installer, enter the key, and your ERP is live — the whole process takes under 10 minutes.",
  },
  {
    q: "Can you migrate our data from Tally, SAP or Excel?",
    a: "Yes — free of cost on every plan. Our migration team moves your masters, opening balances, stock and historical transactions with zero data loss, and runs parallel validation before go-live.",
  },
  {
    q: "Is Bharatrontech GST-compliant for Indian businesses?",
    a: "Completely. Every suite is GST-native: GSTR-1/3B/9 reports, e-Invoice (IRN), e-Way Bills, TDS/TCS and MCA-compliant audit trails. We ship compliance updates before every statutory deadline.",
  },
  {
    q: "Cloud or on-premise — which should I choose?",
    a: "Cloud gets you live in a day with automatic updates and India data residency. OmniSuite and ManufPro also offer on-premise deployment for factories with air-gapped networks. Our team will recommend the right fit on a free call.",
  },
  {
    q: "What does the pricing include? Any hidden costs?",
    a: "The listed yearly price includes the license, all listed modules, updates, cloud hosting (for cloud plans), onboarding and standard support. GST at 18% is shown transparently at checkout. No per-transaction fees, ever.",
  },
  {
    q: "Can I upgrade from CloudLite to a bigger suite later?",
    a: "Anytime. Your data carries over seamlessly and we credit the unused portion of your current subscription against the upgrade — you only pay the difference.",
  },
  {
    q: "What support do you provide after purchase?",
    a: "Every plan includes onboarding, training webinars in Hindi & English, and business-hours support via phone, chat and email. OmniSuite customers get a dedicated success manager and 24×7 priority support.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {faqs.map((faq, i) => {
        const open = openIndex === i;
        return (
          <div
            key={i}
            className={`overflow-hidden rounded-xl border transition-colors ${
              open ? "border-saffron-500/50 bg-white shadow-lg shadow-saffron-500/5" : "border-slate-200 bg-white"
            }`}
          >
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={open}
            >
              <span className="flex items-center gap-3 text-sm font-bold text-ink-900 sm:text-base">
                <HelpCircle
                  className={`h-5 w-5 shrink-0 ${open ? "text-saffron-500" : "text-slate-400"}`}
                />
                {faq.q}
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180 text-saffron-500" : ""}`}
              />
            </button>
            <div
              className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 pl-13 text-sm leading-relaxed text-slate-600">
                  {faq.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}