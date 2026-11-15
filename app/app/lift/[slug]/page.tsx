import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getExerciseNames, getLiftSessions } from "@/lib/history";
import { liftHistory, pointsSince } from "@/lib/lift-history";
import { exerciseName, formatLoad, formatNumber, fromKg, toKg } from "@/lib/lift";
import { PR_LABEL, prGain } from "@/lib/prs";
import { resolveUnit } from "@/lib/stats";
import { formatDayLabel, formatDayMonth, safeTimeZone, TZ_COOKIE } from "@/lib/time";
import StatGrid from "@/components/StatGrid";
import Segment from "@/components/Segment";
import LiftChart from "@/components/LiftChart";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = { title: "Lift" };

const RANGES = { "3m": { days: 91, label: "3M" }, "1y": { days: 365, label: "1Y" }, all: { days: null, label: "ALL" } } as const;
type LiftRange = keyof typeof RANGES;
const resolveRange = (v: string | undefined): LiftRange => (v === "3m" || v === "all" ? v : "1y");
const PR_ROWS = 10;
const SESSION_ROWS = 8;

// One lift's page (P2-02, DD-049): where it stands, how it moved, every PR, the recent sessions. Reached from Stats and Log detail.
export default async function LiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; unit?: string }>;
}) {
  const [{ slug }, sp, session, jar] = await Promise.all([params, searchParams, getServerSession(authOptions), cookies()]);
  if (!/^[a-z0-9_]{1,64}$/.test(slug)) notFound();
  const userId = session!.user.id;
  const tz = safeTimeZone(jar.get(TZ_COOKIE)?.value);
  const unit = resolveUnit(sp.unit);
  const range = resolveRange(sp.range);
  const [sessions, names] = await Promise.all([getLiftSessions(userId, slug), getExerciseNames(userId)]);
  const lift = liftHistory(sessions);
  if (!lift.sessions) notFound();

  const name = exerciseName(slug, names[slug]);
  const u = (kg: number) => fromKg(kg, unit);
  const shown = pointsSince(lift.points, RANGES[range].days);
  const points = shown.map((p) => ({ t: Date.parse(p.startedAt), value: u(p.e1rmKg), label: formatDayMonth(new Date(p.startedAt), tz), pr: p.pr }));
  const first = shown[0];
  const last = shown.at(-1);
  const summary = last
    ? `Estimated 1RM, ${name.toLowerCase()}: ${formatNumber(u(first!.e1rmKg))} to ${formatNumber(u(last.e1rmKg))} ${unit} over ${shown.length} ${
        shown.length === 1 ? "session" : "sessions"
      }, ${shown.filter((p) => p.pr).length} with a PR.`
    : `No ${name.toLowerCase()} sessions in this range.`;
  const heavy = lift.heaviest!;
  const href = (r: LiftRange) => `/app/lift/${slug}?range=${r}&unit=${unit}`;
  const recent = sessions.filter((s) => s.sets.length).slice(-SESSION_ROWS).reverse();
  const e1rmBy = new Map(lift.points.map((p) => [p.workoutId, p.e1rmKg]));

  return (
    <section className="space-y-8">
      <BackLink href={`/app/stats?unit=${unit}`} />

      <h1 className="display break-words text-4xl">{name}</h1>

      <StatGrid
        size="text-xl"
        items={[
          [`Heaviest ${unit}`, heavy.weight === 0 ? `BW × ${heavy.reps}` : `${formatNumber(u(toKg(heavy.weight, heavy.unit)))} × ${heavy.reps}`],
          [`Est. 1RM ${unit}`, lift.bestE1rmKg ? formatNumber(u(lift.bestE1rmKg)) : "—"],
          ["Sessions", String(lift.sessions)],
        ]}
      />

      <section aria-labelledby="trend" className="space-y-3">
        {/* The range switch sits on the heading row (like KG/LB on Stats): the chart is the content, not its controls. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <h2 id="trend" className="label">
            Est. 1RM over time
          </h2>
          <div className="w-40">
            <Segment items={(Object.keys(RANGES) as LiftRange[]).map((r) => ({ key: r, label: RANGES[r].label, href: href(r) }))} active={range} />
          </div>
        </div>
        {/* Keyed by range: a new range starts on its latest session (the old inspected index may not exist in fewer points). */}
        <LiftChart key={range} points={points} unit={unit} summary={summary} />
      </section>

      <section aria-labelledby="prs" className="space-y-3">
        <h2 id="prs" className="label">
          PR history
        </h2>
        {lift.prs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No PRs yet. Your first session is the baseline; beat it to set one.</p>
        ) : (
          <ul className="border-b border-[var(--divider)]">
            {lift.prs.slice(0, PR_ROWS).map((pr) => (
              <li key={pr.set.id} className="border-t border-[var(--divider)]">
                <Link href={`/app/log/${pr.workoutId}`} className="press grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-base font-bold tabular tracking-[-0.01em]">
                      {pr.set.reps} × {formatLoad(pr.set.weight, pr.set.unit)}
                    </span>
                    <span className="label mt-1 block">
                      {formatDayMonth(new Date(pr.startedAt), tz)} · {PR_LABEL[pr.kind]}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-bold tabular">{prGain(pr, unit).value}</span>
                    <span className="label">{prGain(pr, unit).what}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {lift.prs.length > PR_ROWS && <p className="label">+ {lift.prs.length - PR_ROWS} earlier</p>}
      </section>

      <section aria-labelledby="sessions" className="space-y-3">
        <h2 id="sessions" className="label">
          Recent sessions
        </h2>
        <ul className="border-b border-[var(--divider)]">
          {recent.map((s) => (
            <li key={s.workoutId} className="border-t border-[var(--divider)]">
              <Link href={`/app/log/${s.workoutId}`} className="press grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-base font-bold tracking-[-0.01em]">{formatDayLabel(new Date(s.startedAt), tz)}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--muted)] tabular">
                    {s.sets.map((x) => `${x.reps} × ${formatLoad(x.weight, x.unit)}`).join(" / ")}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-base font-bold tabular">{formatNumber(u(e1rmBy.get(s.workoutId) ?? 0))}</span>
                  <span className="label">Est. 1RM</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

