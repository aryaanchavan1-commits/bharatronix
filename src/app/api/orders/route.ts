import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  payments,
  products,
  siteFlags,
} from "@/db/schema";
import { getStripe, IP_VELOCITY_LIMIT, HIGH_RISK_COUNTRIES } from "@/lib/stripe";
import {
  calculateTransactionScore,
  validateGeoMatch,
  encryptTransactionData,
  isHighRiskBIN,
  updateBINRoutingStrategy,
  getCurrentKeyVersion,
  sendWebhookNotification,
} from "@/lib/fraud";
import {
  BIN_ROUTING_STRATEGIES,
  GEO_MATCH_THRESHOLD,
  FRAUD_SCORE_THRESHOLDS,
} from "@/lib/fraud-config";

export const dynamic = "force-dynamic";

type Body = {
  items: { slug: string; qty: number }[];
  customer: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    address?: string;
    country?: string;
    state?: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip")?.trim() ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;

    // Decline-rate circuit breaker (set by /api/cron/payments and /api/cron/fraud monitor)
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

    // IP velocity check
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
        { error: "Too many purchase attempts from this connection. Please contact support@bharatrontech.in." },
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

    // Load products
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

    // Fraud scoring and validation
    const fraudScore = await calculateTransactionScore({
      ip: clientIp,
      userAgent,
      amount: total,
      customerEmail: customer.email,
      customerName: customer.name,
      orderHistory: {
        totalOrders: 0, // Would fetch from DB if customer has history
        totalSpent: 0,
      },
    });

    // Geo validation
    const geoResult = await validateGeoMatch(
      clientIp,
      customer.country || "IN", // Default to India
      customer.state
    );

    // Check if BIN is high-risk (in production, extract BIN from payment method)
    // For now, we assume BIN will be provided during payment
    let isHighRiskBin = false;
    let binRoutingAction: "allow" | "manual_review" | "block" | "high_value_only" = "allow";

    // Determine if step-up authentication is required
    const stepUpRequired =
      fraudScore.stepUpRequired ||
      geoResult.riskLevel === "high" ||
      total > BIN_ROUTING_STRATEGIES.highValueThreshold;

    // Log fraud assessment
    await db.insert(orders).values({
      orderNumber,
      customerName: customer.name.trim(),
      email: customer.email.trim(),
      phone: customer.phone ?? null,
      company: customer.company ?? null,
      address: customer.address ?? null,
      fingerprint: clientIp,
      status: "pending",
      captureMethod: stepUpRequired ? "manual" : "manual", // Still manual capture for review
      subtotal,
      gst,
      total,
      items: lineItems,
      stripeSessionId: null,
      ipEncrypted: null,
      userAgentEncrypted: null,
      binEncrypted: null,
      metadataEncrypted: null,
      encryptionKeyVersion: getCurrentKeyVersion(),
    }).returning();

    // Create Stripe checkout session
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      payment_method_options: {
        card: {
          request_three_d_secure: stepUpRequired ? "any" : "automatic",
        },
      },
      line_items: lineItems.map((li) => ({
        price_data: {
          currency: "inr",
          product_data: { name: li.name, description: "Bharatrontech annual license" },
          unit_amount: li.price,
        },
        quantity: li.qty,
      })),
      customer_email: customer.email.trim(),
      metadata: {
        customer_email: customer.email.trim(),
        customer_name: customer.name.trim(),
        ip: clientIp,
        fraudScore: fraudScore.score.toString(),
        fraudRiskLevel: fraudScore.riskLevel,
        geoValidated: geoResult.valid ? "true" : "false",
        geoRiskLevel: geoResult.riskLevel,
        stepUpRequired: stepUpRequired ? "true" : "false",
        cartItems: JSON.stringify(lineItems.map(({ slug, qty }) => ({ slug, qty }))),
      },
      payment_intent_data: {
        capture_method: "manual",
        description: `Bharatrontech ${orderNumber}`,
        statement_descriptor_suffix: "BHARATRONTECH",
        metadata: {
          order_id: orderNumber,
          customer_email: customer.email.trim(),
          ip: clientIp,
          fraudScore: fraudScore.score.toString(),
        },
      },
      success_url: `${origin}/order/${orderNumber}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout?canceled=1`,
    });

    // Update order with session ID
    await db
      .update(orders)
      .set({ stripeSessionId: session.id })
      .where(eq(orders.orderNumber, orderNumber));

    // Encrypt and store transaction data
    await encryptTransactionData(
      (await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1))[0]!.id,
      clientIp,
      userAgent,
      undefined, // BIN will be encrypted after payment
      {
        fraudScore: fraudScore.score,
        riskLevel: fraudScore.riskLevel,
        geoValidation: geoResult,
        stepUpRequired,
        cartTotal: total,
        cartItems: lineItems,
      }
    );

    // Get order ID
    const [createdOrder] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!createdOrder) {
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Create payment record
    await db.insert(payments).values({
      orderId: String(createdOrder.id),
      amount: total,
      currency: "inr",
      status: "pending",
      captureMethod: "manual",
      providerCheckoutRef: session.id,
      clientIp,
      userAgent,
      stripeRiskLevel: fraudScore.riskLevel,
      stripeRiskScore: fraudScore.score,
      isFraudulent: fraudScore.riskLevel === "critical",
      country: HIGH_RISK_COUNTRIES.includes(req.headers.get("x-vercel-ip-country") ?? "")
        ? req.headers.get("x-vercel-ip-country")
        : null,
      fraudScore: fraudScore.score,
      stepUpRequired,
      geoValidated: geoResult.valid,
      geoRiskLevel: geoResult.riskLevel,
      cvvAvailable: true, // Will be updated after payment method check
    });

    // Send webhook for high-risk transactions
    if (fraudScore.riskLevel === "high" || fraudScore.riskLevel === "critical") {
      await sendWebhookNotification(
        "high_risk_transaction",
        {
          orderNumber,
          customerEmail: customer.email,
          amount: total,
          fraudScore: fraudScore.score,
          riskLevel: fraudScore.riskLevel,
          factors: fraudScore.factors,
          clientIp,
        },
        fraudScore.riskLevel === "critical" ? "critical" : "high"
      );
    }

    if (!session.url) {
      return NextResponse.json({ error: "Stripe session error." }, { status: 502 });
    }

    return NextResponse.json({ orderNumber, checkoutUrl: session.url });
  } catch (err) {
    console.error("[orders:POST]", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please retry in a moment." },
      { status: 500 }
    );
  }
}

// GET /api/orders - Fetch order by number (for order status page)
export async function GET(req: NextRequest) {
  try {
    const orderNumber = req.nextUrl.searchParams.get("orderNumber");
    if (!orderNumber) {
      return NextResponse.json({ error: "Order number required" }, { status: 400 });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Get associated payments
    const payments_list = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, String(order.id)));

    const firstPayment = payments_list[0];
    if (!firstPayment) {
      return NextResponse.json({
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        total: order.total,
        items: order.items,
        customer: {
          name: order.customerName,
          email: order.email,
          phone: order.phone,
          company: order.company,
          address: order.address,
        },
        fraudData: {
          ipEncrypted: !!order.ipEncrypted,
          userAgentEncrypted: !!order.userAgentEncrypted,
          encryptionKeyVersion: order.encryptionKeyVersion,
          decryptedData: null,
        },
        payment: null,
      });
    }

    return NextResponse.json({
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      items: order.items,
      customer: {
        name: order.customerName,
        email: order.email,
        phone: order.phone,
        company: order.company,
        address: order.address,
      },
      fraudData: {
        ipEncrypted: !!order.ipEncrypted,
        userAgentEncrypted: !!order.userAgentEncrypted,
        encryptionKeyVersion: order.encryptionKeyVersion,
        decryptedData: null,
      },
      payment: firstPayment
        ? {
            status: firstPayment.status,
            amount: firstPayment.amount,
            providerPaymentRef: firstPayment.providerPaymentRef,
            fraudScore: firstPayment.fraudScore,
            stepUpRequired: firstPayment.stepUpRequired,
            geoValidated: firstPayment.geoValidated,
            geoRiskLevel: firstPayment.geoRiskLevel,
            isFraudulent: firstPayment.isFraudulent,
          }
        : null,
    });
  } catch (err) {
    console.error("[orders:GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}
