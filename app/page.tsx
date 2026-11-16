"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rememberTimeZone } from "@/lib/time";
import { EMAIL_KEY, getCsrf, signInRequest } from "@/lib/sign-in";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const csrf = useRef<Promise<string> | null>(null);

  // While the user types: fetch the CSRF token and wake the server + database.
  useEffect(() => {
    rememberTimeZone();
    csrf.current = getCsrf().catch(() => "");
    fetch("/api/warm").catch(() => {});
  }, []);

  // The error stays until the user changes what caused it.
  const edit = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setError(null);
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return setError("Email and password are required.");
    if (!email.includes("@")) return setError("Enter a valid email address.");

    setLoading(true);
    try {
      const result = await signInRequest(email, password, (await csrf.current) || (await getCsrf()));
      if (result === "ok") return router.replace("/app");
      csrf.current = getCsrf().catch(() => "");
      setError(result === "tooMany" ? "Too many tries. Wait 15 minutes, or reset your password." : "Wrong email or password.");
    } catch {
      setError("No connection. Try again.");
    }
    setLoading(false);
  }

  // The email typed here follows to Create account / Forgot password (session storage, never the URL).
  const carryEmail = () => {
    try {
      sessionStorage.setItem(EMAIL_KEY, email.trim());
    } catch {}
  };

  return (
    <main className="min-h-dvh flex items-center px-4 sm:px-6">
      <section className="w-full max-w-[420px] mx-auto sm:-translate-y-[4vh]">
        <h1 className="display text-6xl sm:text-7xl mb-3">GO—YOU</h1>
        <p className="label mb-10">Train. Log. Progress.</p>

        <form className="space-y-6" onSubmit={handleLogin} noValidate>
          <div className="space-y-2">
            <label htmlFor="email" className="label block">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={edit(setEmail)}
              aria-invalid={!!error}
              className="field h-12"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pwd" className="label block">
              Password
            </label>
            <input
              id="pwd"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={edit(setPassword)}
              aria-invalid={!!error}
              className="field h-12"
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full tracking-[0.2em]">
            {loading ? "SIGNING IN…" : "ENTER"}
          </button>

          <p role="alert" className="min-h-5 text-sm text-[var(--danger)]">
            {error}
          </p>
        </form>

        <nav aria-label="Account" className="mt-6 grid grid-cols-2 border-t border-[var(--divider)]">
          <Link href="/signup" onClick={carryEmail} className="press label flex min-h-[var(--tap)] items-center text-[var(--fg)]">
            Create account
          </Link>
          <Link href="/reset" onClick={carryEmail} className="press label flex min-h-[var(--tap)] items-center justify-end">
            Forgot password
          </Link>
        </nav>
      </section>
    </main>
  );
}
