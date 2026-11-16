"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SegmentedBar from "@/components/SegmentedBar";
import { EMAIL_KEY, getCsrf, signInRequest } from "@/lib/sign-in";
import { rememberTimeZone } from "@/lib/time";
import { useNow } from "@/lib/useNow";

// P3-01 (DD-053): email → 6-digit code → password, then straight into the app. Creating an account and resetting a password are the
// same three steps (the code proves the email); only the words differ. One screen per step, same frame as the sign-in page.
type Mode = "signup" | "reset";
type Step = "email" | "code" | "password";
const STEPS: Step[] = ["email", "code", "password"];

const TITLE: Record<Mode, Record<Step, string>> = {
  signup: {
    email: "Create account",
    code: "Check your email",
    password: "Set a password",
  },
  reset: {
    email: "Reset password",
    code: "Check your email",
    password: "New password",
  },
};
const RESEND_S = 30;

async function post(
  path: string,
  body: object,
): Promise<{
  ok: boolean;
  error?: string;
  expired?: boolean;
  retryAfter?: number;
}> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    return {
      ok: false,
      ...(await res
        .json()
        .catch(() => ({ error: "Something went wrong. Try again." }))),
    };
  } catch {
    return { ok: false, error: "No connection. Try again." };
  }
}

export default function AccountFlow({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const now = useNow(1000, resendAt);
  const csrf = useRef<Promise<string> | null>(null);

  useEffect(() => {
    rememberTimeZone();
    fetch("/api/warm").catch(() => {});
    try {
      const typed = sessionStorage.getItem(EMAIL_KEY);
      if (typed) setEmail(typed); // eslint-disable-line react-hooks/set-state-in-effect -- read once from storage after mount
    } catch {}
  }, []);

  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(null);
  };

  async function sendCode() {
    setBusy(true);
    const r = await post("/api/account/code", { email });
    setBusy(false);
    if (!r.ok) {
      if (r.retryAfter) setResendAt(Date.now() + r.retryAfter);
      return setError(r.error ?? "Could not send the code.");
    }
    setCode("");
    setError(null);
    setResendAt(Date.now() + RESEND_S * 1000);
    setStep("code");
  }

  async function verify(value: string) {
    setBusy(true);
    const r = await post("/api/account/verify", { email, code: value });
    setBusy(false);
    if (!r.ok) {
      if (r.expired) setCode("");
      return setError(r.error ?? "That code is not right.");
    }
    csrf.current = getCsrf().catch(() => "");
    setStep("password");
  }

  async function savePassword() {
    setBusy(true);
    const r = await post("/api/account/password", { email, code, password });
    if (!r.ok) {
      setBusy(false);
      if (r.expired) {
        setCode("");
        setStep("code");
      }
      return setError(r.error ?? "Could not save the password.");
    }
    try {
      sessionStorage.removeItem(EMAIL_KEY);
      const signedIn = await signInRequest(
        email,
        password,
        (await csrf.current) || (await getCsrf()),
      );
      if (signedIn === "ok") return router.replace("/app");
    } catch {}
    // The account exists; only the automatic sign-in failed. The sign-in page takes it from here.
    router.replace("/");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        return setError("Enter a valid email address.");
      return sendCode();
    }
    if (step === "code")
      return code.length === 6 ? verify(code) : setError("Enter all 6 digits.");
    return savePassword();
  }

  const n = STEPS.indexOf(step) + 1;
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    // Top-anchored, not centred like sign-in: steps differ in height, and the back link and step bar must not jump between them.
    <main className="min-h-dvh px-4 pb-8 pt-[calc(2rem+env(safe-area-inset-top))] sm:px-6 sm:pt-[12vh]">
      <section className="mx-auto w-full max-w-[420px]">
        <Link
          href="/"
          className="press label -ml-1 mb-8 inline-flex min-h-[var(--tap)] items-center px-1 text-[var(--fg)]"
        >
          ← Sign in
        </Link>

        <div className="mb-3 space-y-2">
          <p className="label tabular">Step {n} of 3</p>
          <div aria-hidden="true">
            <SegmentedBar count={n} target={3} />
          </div>
        </div>

        {/* A new step rises in (rare, so it can be felt); the key restarts it and moves focus to the step's field. */}
        <form
          key={step}
          className="step space-y-6"
          onSubmit={onSubmit}
          noValidate
        >
          <header className="space-y-3 pt-6">
            <h1 className="display text-5xl">{TITLE[mode][step]}</h1>
            <p className="text-sm text-[var(--muted)]">
              {step === "email" &&
                "We email you a 6-digit code to check it is you."}
              {step === "code" && (
                <>
                  Enter the code we sent to
                  <span className="block break-all font-semibold text-[var(--fg)]">{email.trim()}</span>
                  It works for 10 minutes.
                </>
              )}
              {step === "password" &&
                "At least 8 characters. A short sentence you will remember works well."}
            </p>
          </header>

          {step === "email" && (
            <div className="space-y-2">
              <label htmlFor="email" className="label block">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                value={email}
                onChange={(e) => edit(setEmail)(e.target.value)}
                aria-invalid={!!error}
                className="field h-12"
              />
            </div>
          )}

          {step === "code" && (
            <div className="space-y-2">
              <label htmlFor="code" className="label block">
                6-digit code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  edit(setCode)(v);
                  if (v.length === 6 && !busy) verify(v); // a pasted or autofilled code goes straight through
                }}
                aria-invalid={!!error}
                // the extra left pad balances the tracking after the last digit, so the code sits centred
                className="field h-16 pl-[calc(0.75rem+0.5em)] text-center text-3xl font-bold tracking-[0.5em] tabular"
              />
            </div>
          )}

          {step === "password" && (
            <div className="space-y-2">
              {/* Lets password managers save the new password under the right email. */}
              <input
                type="email"
                autoComplete="username"
                value={email.trim()}
                readOnly
                hidden
              />
              <label htmlFor="pwd" className="label block">
                Password
              </label>
              <div className="grid grid-cols-[1fr_auto]">
                <input
                  id="pwd"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => edit(setPassword)(e.target.value)}
                  aria-invalid={!!error}
                  className="field h-12 border-r-0"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-pressed={show}
                  className="press label h-12 w-16 border border-[var(--control)] text-[var(--fg)]"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="btn btn-primary btn-lg w-full tracking-[0.2em]"
          >
            {step === "email" && (busy ? "SENDING…" : "SEND CODE")}
            {step === "code" && (busy ? "CHECKING…" : "CONTINUE")}
            {step === "password" &&
              (busy
                ? "SAVING…"
                : mode === "signup"
                  ? "CREATE ACCOUNT"
                  : "SAVE PASSWORD")}
          </button>

          <p role="alert" className="min-h-5 text-sm text-[var(--danger)]">
            {error}
          </p>

          {step === "code" && (
            <div className="grid grid-cols-2 border-t border-[var(--divider)]">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("email");
                }}
                className="press label flex min-h-[var(--tap)] items-center text-left text-[var(--fg)]"
              >
                Change email
              </button>
              <button
                type="button"
                onClick={sendCode}
                disabled={busy || wait > 0}
                className="press label flex min-h-[var(--tap)] items-center justify-end text-right text-[var(--fg)] disabled:text-[var(--muted)]"
              >
                {wait > 0 ? (
                  <span className="tabular">New code in {wait}s</span>
                ) : (
                  "Send a new code"
                )}
              </button>
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
