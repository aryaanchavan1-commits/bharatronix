# Bharatronix — ERP Software E-Commerce Store

Enterprise-grade ERP software store built with **Next.js (App Router)**, **PostgreSQL + Drizzle ORM**, **Tailwind CSS v4** and **Three.js** (interactive 3D hero).

Founded by **Parth Ambre** (Founder & CEO) and **Aryan Chavan** (Co-Founder & CTO).

## Features

- 🧊 Interactive 3D hero (drag to rotate) showing the modular ERP core
- 🛒 Full store: catalog with search / category filters / sorting, product pages, cart (persisted), checkout
- 🔑 Orders stored in PostgreSQL with **instant license-key generation**
- 👥 Founders section with photos & bios, platform overview, testimonials, FAQ
- 🇮🇳 INR pricing with 18% GST computed transparently at checkout
- 📱 Fully responsive, scroll reveals, micro-interactions throughout

## Run on Windows (one click)

1. Install [Node.js 20+](https://nodejs.org) and make sure PostgreSQL is running
   (or use a free cloud DB from [neon.tech](https://neon.tech)).
2. Double-click **`run.bat`** — it installs dependencies, creates `.env` if missing,
   syncs the schema, seeds products, builds and starts the store at
   `http://localhost:3000`.

Development mode with hot reload:

```bat
run.bat dev
```

Default local database URL (edit `.env` to change):

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
```

## Manual setup (any OS)

```bash
npm install
npx drizzle-kit push --force   # create tables
node scripts/seed.mjs          # seed the 6 ERP products
npm run build && npm start
```

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — Next.js is auto-detected.
3. Create a free Postgres database (Vercel Postgres / Neon / Supabase) and copy its
   connection string.
4. In **Vercel → Project → Settings → Environment Variables**, add:
   - `DATABASE_URL` = your Postgres connection string
5. Deploy. Then, once, from your machine (with the same URL in `.env`):

```bash
npx drizzle-kit push --force
node scripts/seed.mjs
```

That's it — the store is live. All pages are dynamic, so no rebuild is needed when
the catalog changes.

## Project structure

```
src/app            App Router pages + API routes (/api/products, /api/orders, /api/health)
src/components     3D hero, navbar, cart provider, product cards, FAQ, reveals
src/db             Drizzle schema (products, orders) + client
src/data           Product catalog JSON (source for the seed script)
scripts/seed.mjs   Idempotent product seeder
run.bat            Windows one-click launcher
```