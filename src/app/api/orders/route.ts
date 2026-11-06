import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  payments,
  products,
  siteFlags,
} from "@/db/schema";
import {
  IP_VELOCITY_LIMIT,
  HIGH_RISK_COUNTRIES,
  isRateLimited,
} from "@/lib/stripe";
import {
  calculateTransactionScore,
  validateGeoMatch,
  encryptTransactionData,
  getCurrentKeyVersion,
} from "@/lib/fraud";
import { createDodoCheckout } from "@/lib/dodo";

export const dynamic = "force-dynamic";

type Body = {
  items: { slug: string; qty: number }[];
  customer: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    address?: string;
    gstin?: string;
    country?: string;
    state?: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GSTIN is 2-digit state code + 10-char PAN + entity code + "Z" + checksum.
// Dodo answers an invalid tax id with a 400, which used to surface as a dead
// "retry in a moment" checkout, so catch the typo here where we can explain it.
function isValidGstin(value: string): boolean {
  const gstin = value.trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(gstin)) return false;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = alphabet.indexOf(gstin[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return alphabet[(36 - (sum % 36)) % 36] === gstin[14];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip")?.trim() ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;

    const [pauseFlag] = await db
      .select()
      .from(siteFlags)
      .where(eq(siteFlags.key, "payments_paused"))
      .limit(1);
    if (pauseFlag?.value === "true") {
      return NextResponse.json(
        { error: "Payments are temporarily paused for review. Please try again shortly." },
        { status: 503 }
      );
    }

    const ipVelocityResults = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(
        and(
          eq(payments.clientIp, clientIp),
          sql`${payments.createdAt} > now() - interval '24 hours'`
        )
      )
      .limit(1);
    const ipVelocityCount = ipVelocityResults[0] ? Number(ipVelocityResults[0].count) : 0;
    if (ipVelocityCount >= IP_VELOCITY_LIMIT) {
      return NextResponse.json(
        { error: "Too many purchase attempts from this connection. Please contact aryaanchavan1@gmail.com." },
        { status: 429 }
      );
    }

    const items =
      Array.isArray(body.items) ? body.items.filter((i) => i.slug && i.qty > 0) : [];
    const customer = body.customer ?? ({} as Body["customer"]);

    if (!items.length) {
      return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    }
    if (!customer.name?.trim() || !EMAIL_RE.test(customer.email ?? "")) {
      return NextResponse.json(
        { error: "Please provide a valid name and a working email address." },
        { status: 400 }
      );
    }
    const gstin = customer.gstin?.trim() ?? "";
    if (gstin && !isValidGstin(gstin)) {
      return NextResponse.json(
        {
          error:
            "That GSTIN doesn't look right. Check the 15 characters, or leave it blank for a personal invoice.",
        },
        { status: 400 }
      );
    }

    const dbProducts = await db
      .select()
      .from(products)
      .where(inArray(products.slug, items.map((i) => i.slug)));
    if (dbProducts.length !== items.length) {
      return NextResponse.json({ error: "One or more products not found." }, { status: 400 });
    }

    const lineItems = items.map((i) => {
      const p = dbProducts.find((d) => d.slug === i.slug)!;
      return { slug: p.slug, name: p.name, price: p.price, qty: i.qty, image: p.image };
    });
    const subtotal = lineItems.reduce((sum, li) => sum + li.price * li.qty, 0);
    const gst = Math.round(subtotal * 0.18);
    const total = subtotal + gst;
    const orderNumber = `CRN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    const fraudScore = await calculateTransactionScore({
      ip: clientIp,
      userAgent,
      amount: total,
      customerEmail: customer.email,
      customerName: customer.name,
      orderHistory: {
        totalOrders: 0,
        totalSpent: 0,
      },
    });

    const geoResult = await validateGeoMatch(
      clientIp,
      customer.country || "IN",
      customer.state
    );

    const riskLevel = fraudScore.riskLevel;
    const stepUpRequired = riskLevel === "critical" || geoResult.riskLevel === "high";

    await db.insert(orders).values({
      orderNumber,
      customerName: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone ?? "",
      company: customer.company ?? "",
      address: customer.address ?? "",
      fingerprint: clientIp,
      status: "pending",
      captureMethod: "manual",
      subtotal,
      gst,
      total,
      items: lineItems,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      ipEncrypted: null,
      userAgentEncrypted: null,
      binEncrypted: null,
      metadataEncrypted: null,
      encryptionKeyVersion: getCurrentKeyVersion(),
    });

    let checkoutUrl: string | null = null;
    let providerPaymentRef: string | null = null;

    try {
      const dodo = await createDodoCheckout({
        orderNumber,
        items: lineItems.map(({ slug, name, price, qty }) => ({ slug, name, price, qty })),
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim(),
          phone: customer.phone ?? "",
          company: customer.company ?? undefined,
          address: customer.address ?? undefined,
          gstin: gstin || undefined,
        },
        returnUrl: `${origin}/order/${orderNumber}?paid=1`,
        cancelUrl: `${origin}/checkout?canceled=1`,
        metadata: {
          fraud_score: String(fraudScore.score),
          fraud_risk_level: fraudScore.riskLevel,
          geo_validated: geoResult.valid ? "true" : "false",
          geo_risk_level: geoResult.riskLevel,
          step_up_required: stepUpRequired ? "true" : "false",
          customer_name: customer.name.trim(),
          cart_items: JSON.stringify(lineItems.map(({ slug, qty }) => ({ slug, qty }))),
        },
      });
      checkoutUrl = dodo.checkoutUrl;
      providerPaymentRef = dodo.paymentId;

      await db
        .update(orders)
        .set({ stripeSessionId: dodo.sessionId })
        .where(eq(orders.orderNumber, orderNumber));
    } catch (dodoError) {
      console.error("[orders:POST] dodo checkout creation failed", dodoError);
      // Don't leave a pending order behind for a checkout that was never
      // created: it can never be paid, it inflates the pending queue, and the
      // buyer's retry would add a second one.
      try {
        await db.delete(orders).where(eq(orders.orderNumber, orderNumber));
      } catch (cleanupErr) {
        console.error("[orders:POST] orphan order cleanup failed", cleanupErr);
      }
      const msg =
        dodoError instanceof Error ? dodoError.message : "Dodo checkout creation failed";
      // Surface configuration problems clearly so they can be fixed, rather than
      // a generic 500. Payment-process errors still get a 500.
      if (
        msg.includes("DODO_PAYMENTS_API_KEY") ||
        msg.includes("DODO_PRODUCT_IDS") ||
        msg.includes("No Dodo product id configured")
      ) {
        return NextResponse.json(
          { error: msg },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Could not start checkout. Please retry in a moment." },
        { status: 500 }
      );
    }

    const [createdOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!createdOrder) {
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    await encryptTransactionData(
      createdOrder.id,
      clientIp,
      userAgent,
      undefined,
      {
        fraudScore: fraudScore.score,
        riskLevel: fraudScore.riskLevel,
        geoValidation: geoResult,
        stepUpRequired,
        cartTotal: total,
        cartItems: lineItems,
      }
    );

    await db.insert(payments).values({
      orderId: String(createdOrder.id),
      amount: total,
      currency: "inr",
      status: "pending",
      captureMethod: "manual",
      providerCheckoutRef: checkoutUrl ? createdOrder.stripeSessionId ?? null : null,
      providerPaymentRef,
      clientIp,
      userAgent,
      fraudScore: fraudScore.score,
      stepUpRequired,
      geoValidated: geoResult.valid,
      geoRiskLevel: geoResult.riskLevel,
      isFraudulent: riskLevel === "critical",
      country: HIGH_RISK_COUNTRIES.includes(req.headers.get("x-vercel-ip-country") ?? "")
        ? req.headers.get("x-vercel-ip-country")
        : "",
    });

    return NextResponse.json({ orderNumber, checkoutUrl });
  } catch (err) {
    console.error("[orders:POST]", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please retry in a moment." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const orderNumber = req.nextUrl.searchParams.get("orderNumber");
    if (!orderNumber) {
      return NextResponse.json({ error: "Order number required" }, { status: 400 });
    }

    const [order] = await db
      .select({
        orderNumber: orders.orderNumber,
        status: orders.status,
        createdAt: orders.createdAt,
        total: orders.total,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Public endpoint, and the order number is the only credential: it embeds a
    // millisecond timestamp next to five random characters, so it is enumerable.
    // Customer PII and the issued license keys therefore stay out of this
    // response - the buyer reads those on their own order page.
    return NextResponse.json(order);
  } catch (err) {
    console.error("[orders:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}
