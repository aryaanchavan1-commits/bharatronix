import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const session = await getSession();

  if (session?.user) {
    redirect("/my-account");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10 text-ink-900">
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="order-last rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:mx-auto sm:w-full">
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="text-sm text-slate-500">
              Enter your email and password to access your Bharatrontech account.
            </p>
          </div>

          <LoginForm callbackUrl={callbackUrl} />

          <p className="mt-5 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-bold text-saffron-600 underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
