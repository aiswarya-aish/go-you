import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatDayMonth, safeTimeZone, TZ_COOKIE } from "@/lib/time";
import { exerciseName, formatLoad, formatNumber, fromKg, type Unit } from "@/lib/lift";
import { getStats, resolveRange, resolveUnit, type Range } from "@/lib/stats";
import { getBoard, getExerciseNames } from "@/lib/history";
import { isRecent, type BoardRow } from "@/lib/lift-history";
import { prGain } from "@/lib/prs";
import StatGrid from "@/components/StatGrid";
import Segment from "@/components/Segment";

export const metadata: Metadata = { title: "Stats" };

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0M";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return hours ? `${hours}H ${mins}M` : `${mins}M`;
}

// Week keys are "YYYY-MM-DD"; read them as UTC so they don't shift.
const weekLabel = (day: string) => formatDayMonth(new Date(`${day}T12:00:00Z`), "UTC");

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "ALL" },
];

const BOARD_ROWS = 6; // the rest sit behind "All N lifts"
const NEW_DAYS = 14; // a record this fresh gets the New tag

const href = (range: Range, unit: Unit) => `/app/stats?range=${range}&unit=${unit}`;

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ range?: string; unit?: string }> }) {
  const [session, jar, params] = await Promise.all([getServerSession(authOptions), cookies(), searchParams]);
  const range = resolveRange(params.range);
  const unit = resolveUnit(params.unit);
  const tz = safeTimeZone(jar.get(TZ_COOKIE)?.value);
  const [data, names, board] = await Promise.all([
    getStats(session!.user.id, range, tz),
    getExerciseNames(session!.user.id),
    getBoard(session!.user.id),
  ]);
  const u = (kg: number) => fromKg(kg, unit);

  // One lift: its best estimate (or most reps, bodyweight), the heaviest set and when a record last moved. Opens the lift page.
  const boardRow = (b: BoardRow) => (
    <li key={b.exerciseId} className="border-t border-[var(--divider)]">
      <Link href={`/app/lift/${b.exerciseId}?unit=${unit}`} className="press grid grid-cols-[1fr_auto] items-center gap-3 py-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-bold tracking-[-0.01em]">{exerciseName(b.exerciseId, names[b.exerciseId])}</span>
            {isRecent(b.lastPrAt, NEW_DAYS) && <span className="tag shrink-0">New</span>}
          </span>
          <span className="label mt-1 block truncate">
            {b.heavyKg ? `Heaviest ${b.heavyReps} × ${formatLoad(u(b.heavyKg), unit)}` : "Bodyweight"}
            {b.lastPrAt && ` · ${formatDayMonth(new Date(b.lastPrAt), tz)}`}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-lg font-bold tabular">{b.e1rmKg ? formatNumber(u(b.e1rmKg)) : b.bestReps}</span>
          {!b.e1rmKg && <span className="label">Most reps</span>}
        </span>
      </Link>
    </li>
  );
  const maxTrendVolume = Math.max(0, ...data.volumeTrend.map((e) => e.volumeKg));

  return (
    <section className="space-y-10">
      <h1 className="display text-5xl">Stats</h1>

      {/* All-time, so it sits above the range filter it ignores (P2-03, DD-050). */}
      {board.length > 0 && (
        <section aria-labelledby="bests" className="space-y-3">
          {/* The column is named once here, not under every row; bodyweight rows label their own number. */}
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="bests" className="label">
              All-time bests
            </h2>
            <span className="label">Est. 1RM {unit}</span>
          </div>
          <ul className="border-b border-[var(--divider)]">{board.slice(0, BOARD_ROWS).map(boardRow)}</ul>
          {board.length > BOARD_ROWS && (
            <details className="group">
              <summary className="press label flex min-h-[var(--tap)] cursor-pointer list-none items-center justify-between text-[var(--fg)] [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">All {board.length} lifts</span>
                <span className="hidden group-open:inline">Fewer lifts</span>
                <span aria-hidden="true" className="text-base leading-none">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <ul className="border-b border-[var(--divider)]">{board.slice(BOARD_ROWS).map(boardRow)}</ul>
            </details>
          )}
        </section>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3" aria-label="Filters">
        <Segment active={range} items={RANGES.map((r) => ({ key: r.value, label: r.label, href: href(r.value, unit) }))} />
        <Segment active={unit} items={(["kg", "lb"] as const).map((x) => ({ key: x, label: x.toUpperCase(), href: href(range, x) }))} />
      </div>

      <StatGrid
        items={[
          ["Workouts", String(data.kpis.workoutsCount)],
          [`Volume ${unit}`, formatNumber(Math.round(u(data.kpis.totalVolumeKg)))],
          ["Avg session", formatMinutes(data.kpis.avgSessionLengthMinutes)],
        ]}
      />

      {data.kpis.workoutsCount === 0 ? (
        <p className="text-sm text-[var(--muted)]">No workouts in this range.</p>
      ) : (
        <>
          <section aria-labelledby="prs" className="space-y-3">
            <h2 id="prs" className="label">
              Personal records
            </h2>
            {data.recentPrs.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No PRs in this range.</p>
            ) : (
              <ul className="border-b border-[var(--divider)]">
                {data.recentPrs.map((pr) => (
                  <li key={pr.setId} className="border-t border-[var(--divider)]">
                    <Link href={`/app/lift/${pr.exerciseId}?unit=${unit}`} className="press grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-bold tracking-[-0.01em]">{exerciseName(pr.exerciseId, names[pr.exerciseId])}</span>
                      <span className="label mt-1 block">
                        {formatDayMonth(new Date(pr.occurredAt), tz)} · {pr.reps} × {formatLoad(u(pr.weightKg), unit)}
                      </span>
                    </span>
                    {/* Same words as the Finish sheet: "+2.5 kg heavier" or "+2 more reps" (DD-048, prGain). */}
                    <span className="text-right">
                      <span className="block text-lg font-bold tabular">{prGain(pr, unit).value}</span>
                      <span className="label">{prGain(pr, unit).what}</span>
                    </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="volume" className="space-y-3">
            <h2 id="volume" className="label">
              Volume / week · {unit}
            </h2>
            <ul className="space-y-1.5">
              {data.volumeTrend.map((entry) => (
                <li key={entry.weekStart} className="grid grid-cols-[3.5rem_1fr_4rem] items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--muted)] tabular">{weekLabel(entry.weekStart)}</span>
                  <span className="h-5 bg-[var(--divider)]">
                    <span
                      className="block h-full bg-[var(--fg)]"
                      style={{ width: `${maxTrendVolume > 0 ? Math.max(2, (entry.volumeKg / maxTrendVolume) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="text-right text-xs font-semibold tabular">{formatNumber(Math.round(u(entry.volumeKg)))}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="top" className="space-y-3">
            <h2 id="top" className="label">
              Top exercises
            </h2>
            <ul className="border-b border-[var(--divider)]">
              {data.topExercises.map((ex) => (
                <li key={ex.exerciseId} className="border-t border-[var(--divider)]">
                  <Link href={`/app/lift/${ex.exerciseId}?unit=${unit}`} className="press grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold tracking-[-0.01em]">{exerciseName(ex.exerciseId, names[ex.exerciseId])}</span>
                    <span className="label mt-1 block">
                      {ex.setCount} sets · {ex.workoutCount} workouts
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-base font-bold tabular">{ex.bestWeightKg ? formatNumber(u(ex.bestWeightKg)) : "BW"}</span>
                    <span className="label">Best</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-base font-bold tabular">{ex.best1rmKg ? formatNumber(u(ex.best1rmKg)) : "—"}</span>
                    <span className="label">e1RM</span>
                  </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
