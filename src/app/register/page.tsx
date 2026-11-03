"use client";

import { useActionState, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

type FormState =
  | { type: "error"; errors: { email?: string; password?: string; name?: string } }
  | { type: "success"; message: string };

export default function RegisterPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<FormState | null, FormData>(register, null);
  const [showPw, setShowPw] = useState(false);
  const stateErrors = state && state.type === "error" ? state.errors : undefined;
  const stateSuccess = state && state.type === "success" ? state.message : undefined;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10 text-ink-900">
      <div className="order-first rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:col-span-2 sm:mx-auto sm:text-center sm:w-full">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Create your account</h1>
        <p className="mt-2 text-sm text-slate-500">
          Join Bharatrontech and buy ERP suites, manage licenses and view your invoices.
        </p>
      </div>

      <form
        action={formAction}
        className="order-2 sm:col-span-2 sm:mx-auto sm:w-full"
        onSubmit={() => emailRef.current?.focus()}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:w-full">
          {stateSuccess ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle className="h-10 w-10 text-teal-600" />
              <p className="text-sm font-semibold text-ink-900">{stateSuccess}</p>
              <a
                href="/login"
                className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-saffron-600 underline"
              >
                Back to sign in
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {stateErrors?.email && (
                <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {stateErrors.email}
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-ink-900">Email address</span>
                <input
                  ref={emailRef}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900 placeholder:text-slate-400 outline-none transition focus:border-saffron-500 focus:bg-white"
                  placeholder="you@company.com"
                />
              </label>

              {stateErrors?.password && (
                <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {stateErrors.password}
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-ink-900">Password</span>
                <div className="relative">
                  <input
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900 placeholder:text-slate-400 outline-none transition focus:border-saffron-500 focus:bg-white pr-10"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                  >
                    {showPw ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242-4.242L9.8 9.8" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              {stateErrors?.name && (
                <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {stateErrors.name}
                </p>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-ink-900">Full name (optional)</span>
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-ink-900 placeholder:text-slate-400 outline-none transition focus:border-saffron-500 focus:bg-white"
                  placeholder="Amit Sharma"
                />
              </label>

              <button
                type="submit"
                disabled={pending}
                className="flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-saffron-500 focus-visible:outline-2 focus-visible:outline-saffron-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </button>

              <p className="text-center text-xs text-slate-500">
                Already have an account?{" "}
                <a href="/login" className="font-bold text-saffron-600 underline">
                  Sign in
                </a>
              </p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

async function register(_prevState: FormState | null, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const name = String(formData.get("name") || "").trim() || undefined;

  const errors: { email?: string; password?: string; name?: string } = {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!password || password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }
  if (Object.keys(errors).length) {
    return { type: "error", errors };
  }

  // Sign-up happens on the server route so this client bundle never imports
  // the database driver.
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      type: "error",
      errors: { email: data.error ?? "Registration failed. Please try again." },
    };
  }

  return { type: "success", message: "Account created. You can sign in now." };
}
