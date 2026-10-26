/* Seeds the products table. Safe to run repeatedly (upsert on slug). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(path.join(__dirname, "../src/data/products.json"), "utf8")
);

const url =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  for (const p of catalog) {
    await client.query(
      `INSERT INTO products
        (slug, name, tagline, description, category, price, old_price, image, rating, reviews, badge, deployment, users_included, features, modules)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, tagline = EXCLUDED.tagline, description = EXCLUDED.description,
        category = EXCLUDED.category, price = EXCLUDED.price, old_price = EXCLUDED.old_price,
        image = EXCLUDED.image, rating = EXCLUDED.rating, reviews = EXCLUDED.reviews,
        badge = EXCLUDED.badge, deployment = EXCLUDED.deployment, users_included = EXCLUDED.users_included,
        features = EXCLUDED.features, modules = EXCLUDED.modules`,
      [
        p.slug, p.name, p.tagline, p.description, p.category, p.price, p.oldPrice,
        p.image, p.rating, p.reviews, p.badge, p.deployment, p.usersIncluded,
        JSON.stringify(p.features), JSON.stringify(p.modules),
      ]
    );
  }
  console.log(`Seeded ${catalog.length} Bharatronix products ✔`);
  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});