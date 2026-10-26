import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, products, type OrderItem } from "@/db/schema";
import { generateLicenseKey } from "@/lib/format";

export const dynamic = "force-dynamic";

type Body = {
  customerName?: string;
  email?: string;
  phone?: string;
  company?: string;
  gstin?: string;
  items?: { slug: string; qty: number }[];
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customerName, email, phone, company, gstin } = body;
  const cart = Array.isArray(body.items) ? body.items : [];

  if (!customerName?.trim() || !email?.trim() || !phone?.trim()) {
    return NextResponse.json(
      { error: "Name, email and phone are required." },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (cart.length === 0) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }

  const slugs = cart.map((c) => c.slug);
  const catalog = await db
    .select()
    .from(products)
    .where(inArray(products.slug, slugs));

  if (catalog.length === 0) {
    return NextResponse.json({ error: "Products not found." }, { status: 400 });
  }

  const items: OrderItem[] = [];
  for (const entry of cart) {
    const product = catalog.find((p) => p.slug === entry.slug);
    if (!product) continue;
    const qty = Math.min(Math.max(1, Math.floor(entry.qty || 1)), 99);
    for (let i = 0; i < qty; i++) {
      items.push({
        slug: product.slug,
        name: product.name,
        price: product.price,
        qty: 1,
        image: product.image,
        licenseKey: generateLicenseKey(product.slug),
      });
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const gst = Math.round(subtotal * 0.18);
  const total = subtotal + gst;
  const orderNumber = `BHX-${Date.now().toString(36).toUpperCase()}${Math.floor(
    Math.random() * 900 + 100
  )}`;

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber,
      customerName: customerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      company: company?.trim() || null,
      gstin: gstin?.trim() || null,
      items,
      subtotal,
      gst,
      total,
    })
    .returning();

  return NextResponse.json({ orderNumber: order.orderNumber }, { status: 201 });
}