import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, ne } from "drizzle-orm";
import { ArrowLeft, Check, Cloud, Layers, Star, Users } from "lucide-react";
import { db } from "@/db";
import { products } from "@/db/schema";
import { BuyPanel } from "@/components/buy-panel";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getProduct(slug: string) {
  const [product] = await db.select().from(products).where(eq(products.slug, slug));
  return product;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found — Cronaierp" };
  return {
    title: `${product.name} — Cronaierp ERP Store`,
    description: product.tagline,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = await db
    .select()
    .from(products)
    .where(ne(products.slug, slug))
    .limit(3);

  const discount = product.oldPrice
    ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
    : 0;

  return (
    <>
      <section className="relative overflow-hidden bg-ink-950 py-12 text-white">
        <div className="bg-blueprint absolute inset-0" />
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-saffron-500/15 blur-[110px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition-colors hover:text-saffron-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back to ERP Store
          </Link>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-200">
                  {product.category}
                </span>
                {product.badge && (
                  <span className="rounded-full bg-saffron-500 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
                    {product.badge}
                  </span>
                )}
                {discount > 0 && (
                  <span className="rounded-full bg-teal-glow px-3 py-1 text-xs font-extrabold text-ink-950">
                    Save {discount}%
                  </span>
                )}
              </div>
              <h1 className="font-display mt-4 text-3xl font-bold tracking-tight sm:text-5xl">
                {product.name}
              </h1>
              <p className="mt-3 text-lg text-slate-300">{product.tagline}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Star className="h-4 w-4 fill-current" />
                  {product.rating}
                  <span className="text-slate-400">· {product.reviews} verified reviews</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-teal-glow" /> {product.usersIncluded}
                </span>
                <span className="flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-teal-glow" /> {product.deployment}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-dots-light py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-8">
              <Reveal>
                <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-200 bg-ink-900 shadow-2xl shadow-ink-900/20">
                  <Image
                    src={product.image}
                    alt={`${product.name} dashboard preview`}
                    fill
                    priority
                    sizes="(max-width: 1024px) 100vw, 60vw"
                    className="object-cover"
                  />
                </div>
              </Reveal>

              <Reveal>
                <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                  <h2 className="font-display text-xl font-bold text-ink-900">About this suite</h2>
                  <p className="mt-3 leading-relaxed text-slate-600">{product.description}</p>

                  <h3 className="font-display mt-8 flex items-center gap-2 text-lg font-bold text-ink-900">
                    <Layers className="h-5 w-5 text-saffron-500" /> Included modules
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {product.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-ink-700"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  <h3 className="font-display mt-8 text-lg font-bold text-ink-900">
                    What you get
                  </h3>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {product.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm font-semibold text-slate-700">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-600/10 text-teal-600">
                          <Check className="h-3 w-3" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>

            <div className="lg:sticky lg:top-24 lg:self-start">
              <Reveal delay={100}>
                <BuyPanel product={product} />
              </Reveal>
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-16">
              <Reveal>
                <h2 className="font-display text-2xl font-bold text-ink-900">
                  You may also like
                </h2>
              </Reveal>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((p, i) => (
                  <Reveal key={p.slug} delay={i * 90}>
                    <ProductCard product={p} />
                  </Reveal>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}