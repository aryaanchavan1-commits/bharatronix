#!/usr/bin/env node
// Sync the store catalogue into Kelviq as products with one-time INR plans.
//
// Kelviq is a merchant of record: every sellable item must exist there as a
// product with a published plan, and a checkout session is created against a
// plan identifier. We use the store slug as both the Kelviq product and plan
// identifier, so no slug->id map has to be maintained anywhere.
//
// Idempotent: matches on identifier, replaces prices, only publishes drafts.
// Re-run it after a price change in the ERP.
//
//   KELVIQ_SERVER_API_KEY=server-... node scripts/kelviq-sync.mjs [catalogue]
//
// `catalogue` is either a URL (the site's own GET /api/products) or a path to
// that JSON. Defaults to the locally running site.

import { readFile } from "node:fs/promises";

const API = (process.env.KELVIQ_API_BASE || "https://api.kelviq.com/api/v1").replace(/\/+$/, "");
const KEY = process.env.KELVIQ_SERVER_API_KEY;

if (!KEY) {
  console.error("KELVIQ_SERVER_API_KEY is not set");
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${String(text).slice(0, 400)}`);
  }
  return body;
}

async function listAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const page = await api(next);
    out.push(...(page.results ?? []));
    // `next` is returned as an absolute URL; our api() takes a path.
    next = page.next ? page.next.replace(/^https?:\/\/[^/]+\/api\/v1/, "") : null;
  }
  return out;
}

const src =
  process.argv[2] || process.env.PRODUCTS_SOURCE || "http://127.0.0.1:3000/api/products";
const raw = /^https?:/.test(src)
  ? await (await fetch(src, { cache: "no-store" })).json()
  : JSON.parse(await readFile(src, "utf8"));
const catalogue = (Array.isArray(raw) ? raw : raw.products ?? []).filter(
  (p) => p?.slug && p?.name && Number.isFinite(Number(p.price))
);

if (!catalogue.length) {
  console.error(`No products found in ${src}`);
  process.exit(1);
}
console.log(`Syncing ${catalogue.length} products to ${API}`);

const existingProducts = await listAll("/catalog/products/?page_size=100");
const existingPlans = await listAll("/catalog/plans/?page_size=100");
const productBySlug = new Map(existingProducts.map((p) => [p.identifier, p]));
const planBySlug = new Map(existingPlans.map((p) => [p.identifier, p]));

for (const item of catalogue) {
  const identifier = item.slug;
  const price = Number(item.price);

  let product = productBySlug.get(identifier);
  if (!product) {
    product = await api("/catalog/products/", {
      method: "POST",
      body: JSON.stringify({
        name: item.name,
        identifier,
        description: item.tagline || "",
        // "software" is the supported tax code for downloadable business software.
        taxCode: "software",
      }),
    });
    console.log(`  product created: ${identifier}`);
  }

  let plan = planBySlug.get(identifier);
  if (!plan) {
    plan = await api("/catalog/plans/", {
      method: "POST",
      body: JSON.stringify({
        name: item.name,
        identifier,
        description: item.tagline || "",
        product: product.id,
        isVisible: true,
      }),
    });
    console.log(`  plan created: ${identifier}`);
  }

  // Prices are quoted pre-GST, matching how the store stores them: the 18% GST
  // is added by the merchant of record at checkout, exactly as Dodo does.
  await api(`/catalog/plans/${identifier}/prices/bulk/`, {
    method: "POST",
    body: JSON.stringify({
      prices: [
        {
          priceType: "PAID",
          currency: "INR",
          taxBehavior: "EXCLUSIVE",
          enabled: true,
          chargeCatalogPrice: [
            {
              feature: null,
              priceModel: "FLAT",
              paymentType: "ADVANCE_COMMITMENT",
              charges: [{ chargePeriod: "ONE_TIME", priceData: { amount: price } }],
            },
          ],
        },
      ],
    }),
  });

  // A new plan is a draft until published; checkout against a draft fails.
  if (!plan.isLatest) {
    await api(`/catalog/plans/${identifier}/publish/`, {
      method: "POST",
      body: "{}",
    });
    console.log(`  published: ${identifier}`);
  }

  console.log(`${identifier.padEnd(24)} INR ${price}`);
}

// Self-check: read every price back. A units mistake (sending paise where the
// API wants rupees, or the reverse) would otherwise surface as a 100x pricing
// error on a live checkout, so fail here instead.
let mismatches = 0;
for (const item of catalogue) {
  const { results } = await api(`/catalog/plans/${item.slug}/prices/?page_size=100`);
  const inr = (results ?? []).find((p) => p.currency === "INR" && p.enabled !== false);
  const amount = inr?.chargeCatalogPrice?.[0]?.charges?.[0]?.priceData?.amount;
  if (Number(amount) !== Number(item.price)) {
    console.error(`PRICE MISMATCH ${item.slug}: catalogue ${item.price}, kelviq ${amount}`);
    mismatches++;
  }
}

if (mismatches) {
  console.error(`\n${mismatches} price(s) did not round-trip. Nothing here is safe to sell.`);
  process.exit(1);
}
console.log(`\nAll ${catalogue.length} plans read back at the catalogue price.`);
