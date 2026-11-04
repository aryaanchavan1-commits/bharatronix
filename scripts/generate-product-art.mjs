// Generates one 1600x1000 product image per catalog entry, from the real
// catalog data (name, category, modules). Run: node scripts/generate-product-art.mjs
//
// The art is deliberately shape-only on the right (no invented UI text) so it
// can never render as the broken/mismatched fake dashboards the old raster
// assets shipped, and every product gets its own image instead of sharing four.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(root, "src/data/products.json");
const outDir = join(root, "public/images/products");

const ACCENT = {
  Hospitality: "#F97316",
  Finance: "#10B981",
  Healthcare: "#38BDF8",
  Education: "#A78BFA",
  Manufacturing: "#F59E0B",
  Retail: "#FB7185",
  "HR & Payroll": "#34D399",
  Inventory: "#22D3EE",
  "Small Business": "#A3E635",
};

const W = 1600;
const H = 1000;
// A family with real 600/700 weights, otherwise pango fakes bold by drawing the
// glyph twice at an offset and every heading picks up a ghosted double stroke.
const FONT = "Segoe UI, DejaVu Sans, Liberation Sans, sans-serif";
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Greedy word wrap to a character budget (Arial metrics are close enough here). */
function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[,.;:]$/, "")}…`;
  }
  return lines;
}

function bars(accent) {
  const heights = [58, 96, 74, 128, 104, 150];
  return heights
    .map((h, i) => {
      const opacity = 0.32 + i * 0.11;
      return `<rect x="${i * 34}" y="${160 - h}" width="20" height="${h}" rx="10" fill="${accent}" fill-opacity="${opacity.toFixed(2)}"/>`;
    })
    .join("");
}

function art(product) {
  const accent = ACCENT[product.category] ?? "#F97316";
  const shortName = product.name.replace(/^Bharatronix\s+/i, "");
  const nameLines = wrap(shortName, 16, 2);
  const tagline = wrap(product.tagline, 46, 2);
  const modules = (product.modules ?? []).slice(0, 4);

  const nameSize = shortName.length > 14 ? 84 : 100;
  const nameY = nameLines.length > 1 ? 470 : 430;

  // Donut: fixed 3-segment ring, thickness 16.
  const r = 84;
  const c = 2 * Math.PI * r;
  const seg = [0.46, 0.32, 0.22];
  let offset = 0;
  const ring = seg
    .map((frac, i) => {
      const len = c * frac - 6;
      const el = `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${
        ["#FFFFFF", accent, "#334155"][i]
      }" stroke-opacity="${[0.18, 1, 0.55][i]}" stroke-width="16"
        stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"
        stroke-linecap="round" transform="rotate(-90)"/>`;
      offset += c * frac;
      return el;
    })
    .join("");

  const chips = modules
    .map((m, i) => {
      const text = esc(m);
      const w = Math.max(112, text.length * 13.5 + 48);
      const x = modules.slice(0, i).reduce((acc, prev) => acc + Math.max(112, prev.length * 13.5 + 48) + 14, 0);
      return { text, w, x };
    })
    .reduce((acc, chip, i) => {
      const x = acc.cursor;
      acc.cursor += chip.w + 14;
      acc.svg += `<rect x="${x}" y="0" width="${chip.w}" height="52" rx="26"
        fill="#FFFFFF" fill-opacity="0.05" stroke="${accent}" stroke-opacity="0.45"/>
        <text x="${x + chip.w / 2}" y="33" text-anchor="middle" font-family="${FONT}"
        font-size="22" font-weight="600" fill="#CBD5E1">${chip.text}</text>`;
      return acc;
    }, { svg: "", cursor: 0 }).svg;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B1220"/>
      <stop offset="0.55" stop-color="#0E1729"/>
      <stop offset="1" stop-color="#111C31"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.08" r="0.75">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${accent}"/>

  <!-- category pill -->
  <rect x="96" y="96" width="${esc(product.category).length * 14 + 76}" height="46" rx="23"
    fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-opacity="0.5"/>
  <circle cx="126" cy="119" r="7" fill="${accent}"/>
  <text x="146" y="127" font-family="${FONT}" font-size="21" font-weight="700"
    fill="${accent}" letter-spacing="1.6">${esc(product.category.toUpperCase())}</text>

  <!-- product name -->
  ${nameLines
    .map(
      (line, i) =>
        `<text x="96" y="${nameY + i * (nameSize + 8)}" font-family="${FONT}"
          font-size="${nameSize}" font-weight="700" fill="#FFFFFF" letter-spacing="-2">${esc(line)}</text>`
    )
    .join("\n  ")}

  <!-- tagline -->
  ${tagline
    .map(
      (line, i) =>
        `<text x="96" y="${nameY + nameLines.length * (nameSize + 8) + 40 + i * 38}"
          font-family="${FONT}" font-size="27" font-weight="400"
          fill="#94A3B8">${esc(line)}</text>`
    )
    .join("\n  ")}

  <!-- module chips -->
  <g transform="translate(96, ${H - 170})">${chips}</g>

  <!-- brand -->
  <g transform="translate(96, ${H - 74})">
    <rect x="0" y="-16" width="30" height="30" rx="8" fill="${accent}"/>
    <path d="M15 -8 21 -4.5v10L15 9 9 5.5v-10z" fill="none" stroke="#0B1220" stroke-width="2" stroke-linejoin="round"/>
    <text x="44" y="6" font-family="${FONT}" font-size="21" font-weight="700"
      fill="#64748B">bharatronix.in</text>
  </g>

  <!-- shape-only software motif: no invented UI text -->
  <g transform="translate(1010, 250)">
    <rect x="0" y="0" width="494" height="498" rx="28" fill="#0F1A2E" fill-opacity="0.92" stroke="#243352"/>
    <g transform="translate(40, 96)">${bars(accent)}</g>
    <line x1="40" y1="272" x2="454" y2="272" stroke="#243352"/>
    <g transform="translate(356, 366)">${ring}</g>
    <g transform="translate(40, 320)">
      ${[0, 1, 2]
        .map(
          (i) =>
            `<rect x="0" y="${i * 46}" width="${i === 0 ? 250 : i === 1 ? 190 : 214}" height="14" rx="7"
              fill="#FFFFFF" fill-opacity="${0.16 - i * 0.04}"/>`
        )
        .join("\n      ")}
    </g>
    <circle cx="454" cy="46" r="18" fill="${accent}" fill-opacity="0.22"/>
    <circle cx="454" cy="46" r="7" fill="${accent}"/>
  </g>
</svg>`;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
mkdirSync(outDir, { recursive: true });

for (const product of catalog) {
  const rel = `/images/products/${product.slug}.png`;
  const file = join(outDir, `${product.slug}.png`);
  await sharp(Buffer.from(art(product)))
    .png({ quality: 92, compressionLevel: 9 })
    .toFile(file);
  product.image = rel;
  console.log(`${product.slug} -> ${rel}`);
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`\n${catalog.length} product images written to public/images/products/`);
