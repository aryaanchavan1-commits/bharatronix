import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, password, name } = body as { email?: string; password?: string; name?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const emailNorm = email.trim().toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, emailNorm)).limit(1);

  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  const passwordHash = hashPassword(password ?? "");
  const passwordHashValue = passwordHash instanceof Promise ? await passwordHash : passwordHash;
  const [inserted] = await db.insert(users).values({ email: emailNorm, name: name?.trim() ?? "", passwordHash: passwordHashValue }).returning({ id: users.id });

  if (!inserted) {
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: inserted.id }, { status: 200 });
}
