import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Decodes the JWT session cookie only — the auth config (and its database
// access) must stay out of the Edge bundle, where `pg` cannot be resolved.
export async function middleware(req: NextRequest) {
  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/my-account/:path*"],
};
