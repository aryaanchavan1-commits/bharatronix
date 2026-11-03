import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}
