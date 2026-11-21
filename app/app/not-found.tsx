import Link from "next/link";

// Inside the app shell (tabs stay), for a lift with no sessions or a workout that is not yours or no longer exists.
// Replaces Next's bare default 404, which dropped the navigation and left a dead end.
export default function NotFound() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <p className="label">Not found</p>
        <h1 className="display text-5xl">Nothing here</h1>
      </header>
      <p className="max-w-[40ch] text-sm text-[var(--muted)]">This lift or workout is not in your log. It may have been deleted, or the link is wrong.</p>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/app/log" className="btn btn-lg">
          Log
        </Link>
        <Link href="/app" className="btn btn-primary btn-lg">
          Train
        </Link>
      </div>
    </section>
  );
}
