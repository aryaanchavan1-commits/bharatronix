import { NextResponse, type NextRequest } from "next/server"; // ponytail: NextResponse re-exported for parity

declare global {
  var __rateLimitBuckets: Map<string, number[]> | undefined;
}

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;

// ponytail: in-memory sliding window — per-lambda on Vercel, so effective budget
// is MAX_PER_WINDOW × concurrent instances. Upgrade path: Upstash Redis / Vercel
// KV shared store (drop-in swap of `hit()`).
globalThis.__rateLimitBuckets ??= new Map<string, number[]>();

function hit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = (globalThis.__rateLimitBuckets!.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const allowed = bucket.length < MAX_PER_WINDOW;
  if (allowed) bucket.push(now);
  globalThis.__rateLimitBuckets!.set(key, bucket);
  return { allowed, remaining: Math.max(0, MAX_PER_WINDOW - bucket.length) };
}

export function middleware(req: NextRequest) {
  // Vercel rate limit: max 20 payment attempts / minute / IP on paid checkout surfaces.
  if (req.method !== "GET" && /^\/api\/(orders|stripe\/checkout)/.test(req.nextUrl.pathname)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const { allowed, remaining } = hit(`pay:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many payment attempts. Try again in a minute." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(MAX_PER_WINDOW),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/orders", "/api/stripe/checkout"],
};
