import Link from "next/link";
import { Package, Plus, ShoppingCart } from "lucide-react";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { formatINR } from "@/lib/format";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug?: string }> };

async function accountData(userEmail: string) {
  const [user] = await db.select().from(users).where(eq(users.email, userEmail)).limit(1);
  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.email, userEmail))
    .orderBy(desc(orders.createdAt));

  return { user: user ?? null, orders: userOrders };
}

export default async function MyAccountPage() {
  const session = await getSession();
  const email = session?.user?.email as string | undefined;
  const { user, orders: userOrders } = email
    ? await accountData(email)
    : { user: null, orders: [] };

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-10 sm:px-6">
      <header className="mb-8 flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">My Account</h1>
          <p className="mt-1 text-sm text-slate-500">{email ? `Signed in as ${email}` : "Sign in to see your full order history"}</p>
        </div>
        <div className="flex items-center gap-3">
          {email ? (
            <Link
              href="/products"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-saffron-600 shadow-sm transition hover:bg-saffron-50 hover:text-saffron-700 focus-visible:outline-2 focus-visible:outline-saffron-400"
            >
              <Plus className="h-4 w-4" /> Browse ERP suites
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-saffron-600 shadow-sm transition hover:bg-saffron-50 hover:text-saffron-700 focus-visible:outline-2 focus-visible:outline-saffron-400"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-saffron-600 shadow-sm transition hover:bg-saffron-50 hover:text-saffron-700 focus-visible:outline-2 focus-visible:outline-saffron-400"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold text-ink-900">Order history</h2>

        {userOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <ShoppingCart className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No orders yet</p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-saffron-500"
            >
              <Package className="h-4 w-4" /> Browse products
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {userOrders.map((order) => (
              <li key={order.orderNumber} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <p className="font-semibold text-ink-900">{order.orderNumber}</p>
                  <p className="text-xs font-medium text-slate-500">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}
                    {(order.items as Array<{ name: string }>).slice(0, 2).map((it) => it.name).join(", ")}
                    {(order.items as Array<{ name: string }>).length > 2 ? " …" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-ink-900">{formatINR(order.total)}</span>
                  <Link
                    href={`/my-account/orders/${order.orderNumber}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-saffron-50 hover:text-saffron-700"
                  >
                    View order
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
        <p>Bharatrontech — Indian ERP, built for businesses like yours.</p>
      </footer>
    </div>
  );
}
