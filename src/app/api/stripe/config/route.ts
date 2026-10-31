import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY),
  });
}
