import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    groqReady: Boolean(process.env.GROQ_API_KEY),
  });
}
