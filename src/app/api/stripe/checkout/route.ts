import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { products, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getStripe,
  getOrigin,
  THREE_DS_THRESHOLD_USD,
  MANUAL_REVIEW_THRESHOLD_USD,
  generateOrderNumber,
  isRateLimited,
  recordCheckoutAttempt,
  customerNameFromEmail,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) ?? {};
    const { productId, email } = body as {
      productId?: string;
      email?: string;
    };

    if (!productId || !email) {
      return NextResponse.json(
        { error: "productId and email are required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const product = await db
      .select()
      .from(products)
      .where(eq(products.slug, productId))
      .limit(1);

    if (!product.length) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const row = product[0];

    // Price is stored in INR; Stripe needs the amount in the smallest currency
    // unit. Keep the checkout in INR so the payer sees INR and the receipt
    // matches the product page.
    const priceInINR = Math.round(row.price * 100);

    // Fraud / risk toggles
    const requires3DS = row.price >= THREE_DS_THRESHOLD_USD;
    const requiresManualReview = row.price >= MANUAL_REVIEW_THRESHOLD_USD;

    const stripeOrderNumber = await generateOrderNumber();

    const metadata = {
      orderNumber: stripeOrderNumber,
      customerEmail: email,
      productId: row.slug,
      productName: row.name,
      site: "bharatronix",
    };

    // ---- IP velocity + per-minute rate limiting (Vercel-friendly) ----

    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ?? "unknown";

    if (await isRateLimited(clientIp)) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please wait and try again." },
        { status: 429 }
      );
    }

    await recordCheckoutAttempt(clientIp);

    // ---- Create the Stripe Checkout session ----

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: row.name,
              description: row.tagline,
              images: [
                row.image &&
                  `${getOrigin()}${row.image}`,
              ].filter(Boolean) as string[],
            },
            unit_amount: priceInINR,
          },
          quantity: 1,
        },
      ],
      metadata,
      success_url: `${getOrigin()}/order/${stripeOrderNumber}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getOrigin()}/products?cancelled=true`,
      payment_intent_data: {
        metadata: {
          ...metadata,
          clientIp,
          captureMethod: "manual",
        },
        capture_method: "manual",
      },
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["IN"],
      },
    });

    // ---- Persist the order locally ----

    await db.insert(orders).values({
      orderNumber: stripeOrderNumber,
      customerName: customerNameFromEmail(email),
      email,
      phone: "",
      company: "",
      address: "",

      status: requiresManualReview ? "pending_review" : "pending",
      captureMethod: "manual",
      stripeSessionId: session.id,
      stripePaymentIntentId: null,
      items: [
        {
          slug: row.slug,
          name: row.name,
          price: row.price,
          qty: 1,
          image: row.image || null,
        },
      ],
      subtotal: row.price,
      gst: Math.round(row.price * 0.18),
      total: Math.round(row.price * 1.18),
      fingerprint: null,
      ipEncrypted: null,
      userAgentEncrypted: null,
      binEncrypted: null,
      metadataEncrypted: null,
      encryptionKeyVersion: null,
    });

    return NextResponse.json({
      sessionId: session.id,
      orderNumber: stripeOrderNumber,
      url: session.url,
    });
  } catch (error) {
    console.error("[checkout] Error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
