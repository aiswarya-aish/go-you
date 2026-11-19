"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { rememberTimeZone } from "@/lib/time";
import { RENEWED_KEY } from "@/lib/sign-in";
import { brand } from "@/lib/name";
import { useWorkoutStore } from "@/state/workoutStore";
import SignOutButton from "@/components/SignOutButton";

const NAV_ITEMS = [
  { label: "TRAIN", href: "/app" },
  { label: "LOG", href: "/app/log" },
  { label: "STATS", href: "/app/stats" },
  { label: "GOALS", href: "/app/settings" },
];

const isActive = (pathname: string, href: string) =>
  pathname === href || (href !== "/app" && pathname.startsWith(href));

// The same four links, laid out as a desktop sidebar list or a mobile tab bar.
function NavList({ variant, live }: { variant: "side" | "tabs"; live: boolean }) {
  const pathname = usePathname();
  const tabs = variant === "tabs";
  return (
    <ul className={tabs ? "grid grid-cols-4" : "space-y-1"}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center text-xs font-bold tracking-[0.16em] ${
                tabs ? "h-[var(--tap-lg)] justify-center" : "min-h-[var(--tap)] justify-between px-3"
              } ${active ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
            >
              {item.label}
              {live && item.href === "/app" && (
                <span aria-label="workout in progress" className={tabs ? "absolute top-2 right-3 text-[8px]" : "text-[10px]"}>
                  {tabs ? "●" : "● LIVE"}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// P3-04: a session lasts 90 days from its last renewal, and reading it re-issues the cookie. Once a day is plenty;
// sign-in stamps the day, so the first screen after it costs no extra request.
function renewSession() {
  try {
    if (Date.now() - Number(localStorage.getItem(RENEWED_KEY)) < 86_400_000) return;
    fetch("/api/auth/session")
      .then((r) => r.ok && localStorage.setItem(RENEWED_KEY, String(Date.now())))
      .catch(() => {});
  } catch {}
}

export default function AppShell({ children, user }: { children: React.ReactNode; user: { name?: string | null } }) {
  const live = useWorkoutStore((s) => !!s.activeWorkout);

  useEffect(() => {
    rememberTimeZone();
    useWorkoutStore.persist.rehydrate();
    renewSession();
    // Offline Train + installability (DD-039). Production only, so dev reloads never serve a stale copy.
    if (process.env.NODE_ENV === "production") navigator.serviceWorker?.register("/sw.js").catch(() => {});
  }, []);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-[var(--fg)] focus:p-3 focus:text-[var(--bg)]">
        Skip to content
      </a>

      {/* Mobile has no brand bar (DD-047, 2026-11-15): each page's own title is the header; navigation is the tab bar under the thumb. */}
      <aside className="hidden flex-col gap-8 border-r border-[var(--divider)] p-5 md:flex">
        <span className="text-sm font-bold tracking-wide">GO—YOU</span>
        <nav aria-label="Main">
          <NavList variant="side" live={live} />
        </nav>
        <div className="mt-auto space-y-3 border-t border-[var(--divider)] pt-5 text-sm">
          <p className="label text-[var(--fg)]">
            {brand(user.name)} <span className="text-[var(--muted)]">· signed in</span>
          </p>
          <SignOutButton />
        </div>
      </aside>

      <main id="main" className="px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(var(--tap-lg)+env(safe-area-inset-bottom)+2rem)] md:p-8">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--fg)] bg-[var(--bg)] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavList variant="tabs" live={live} />
      </nav>
    </div>
  );
}
