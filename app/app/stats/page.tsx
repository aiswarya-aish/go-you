import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatDayMonth, formatIn, safeTimeZone, TZ_COOKIE } from "@/lib/time";
import { exerciseName, formatLoad, formatNumber, fromKg, type Unit } from "@/lib/lift";
import { getStats, rangeStart, resolveRange, resolveUnit, type Range } from "@/lib/stats";
import { getBoard, getExerciseNames } from "@/lib/history";
import { isRecent, liftChange, type BoardRow } from "@/lib/lift-history";
import { prGain } from "@/lib/prs";
import Segment from "@/components/Segment";
import VolumeChart from "@/components/VolumeChart";

export const metadata: Metadata = { title: "Stats" };

const RANGES: { value: Range; label: string }[] = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "ALL" },
];

const BOARD_ROWS = 6; // the rest sit behind "All N lifts"
const RECORD_ROWS = 3;
const NEW_DAYS = 14; // a record this fresh gets the New tag

const href = (range: Range, unit: Unit) => `/app/stats?range=${range}&unit=${unit}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Est. 1RM (or most reps) in the window, oldest first, as a 64 × 26 line ending in a square (the latest session).
// At most 16 points (the best of each chunk): at 64px every session is noise; the lift page chart has them all.
function Spark({ points: all }: { points: [number, number][] }) {
  const size = Math.ceil(all.length / 16);
  const points = Array.from({ length: Math.ceil(all.length / size) }, (_, i) => all.slice(i * size, i * size + size).reduce((a, b) => (b[1] > a[1] ? b : a)));
  if (points.length < 2) return <span aria-hidden="true" className="hidden min-[360px]:block" />;
  const vs = points.map(([, v]) => v);
  const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
  const [t0, t1] = [points[0][0], points.at(-1)![0]];
  const xy = points.map(([t, v]) => [2 + ((t - t0) / (t1 - t0 || 1)) * 58, 22 - ((v - lo) / (hi - lo || 1)) * 18]);
  const [ex, ey] = xy.at(-1)!;
  return (
    <svg width="64" height="26" viewBox="0 0 64 26" aria-hidden="true" className="hidden overflow-visible min-[360px]:block">
      <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--fg)" strokeWidth={1.5} strokeLinejoin="round" />
      <rect x={ex - 3} y={ey - 3} width={6} height={6} fill="var(--fg)" />
    </svg>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ range?: string; unit?: string }> }) {
  const [session, jar, params] = await Promise.all([getServerSession(authOptions), cookies(), searchParams]);
  const range = resolveRange(params.range);
  const unit = resolveUnit(params.unit);
  const tz = safeTimeZone(jar.get(TZ_COOKIE)?.value);
  const [data, names, { rows: board }] = await Promise.all([
    getStats(session!.user.id, range, tz),
    getExerciseNames(session!.user.id),
    getBoard(session!.user.id),
  ]);
  const u = (kg: number) => fromKg(kg, unit);
  const since = rangeStart(range);
  const name = (id: string) => exerciseName(id, names[id]);

  // Every lift through the window: how far its best moved (null: not trained in it, or nothing to compare yet).
  const lifts = board.map((b) => ({ ...b, change: liftChange(b.points, since?.getTime() ?? null) }));
  const compared = lifts.filter((l) => l.change !== null);
  const stronger = compared.filter((l) => l.change! > 1e-6).length;
  const workouts = data.kpis.workoutsCount;

  const changeText = (l: BoardRow & { change: number | null }) => {
    if (l.change === null) return "—";
    if (Math.abs(l.change) < 1e-6) return "same";
    const v = l.bw ? l.change : u(l.change);
    return `${v > 0 ? "+" : "−"}${formatNumber(Math.abs(v))}`;
  };

  const liftRow = (l: (typeof lifts)[number]) => (
    <li key={l.exerciseId} className="border-t border-[var(--divider)] first:border-t-0">
      <Link href={`/app/lift/${l.exerciseId}?unit=${unit}`} className="press grid grid-cols-[1fr_5rem] min-[360px]:grid-cols-[1fr_64px_5rem] items-center gap-3 py-3">
        <span className="min-w-0">
          <span className="block truncate text-base font-bold tracking-[-0.01em]">{name(l.exerciseId)}</span>
          {/* New sits on the detail line so long names keep their width; it already says the record is recent, so no date. */}
          <span className="mt-1 flex items-center gap-2 truncate text-xs text-[var(--muted)] tabular">
            {isRecent(l.lastPrAt, NEW_DAYS) && <span className="tag shrink-0 text-[var(--fg)]">New</span>}
            {l.bw
              ? l.heavyKg
                ? `Heaviest +${formatLoad(u(l.heavyKg), unit).toLowerCase()}`
                : "Bodyweight"
              : `Best set ${l.heavyReps} × ${formatLoad(u(l.heavyKg), unit).toLowerCase()}`}
          </span>
        </span>
        <Spark points={l.points.filter(([t]) => !since || t >= since.getTime())} />
        <span className="text-right">
          <span className="block text-xl font-bold leading-none tracking-[-0.02em] tabular">
            {l.bw ? l.bestReps : formatNumber(u(l.e1rmKg))}
            <span className="unit">{l.bw ? "reps" : unit}</span>
          </span>
          <span
            className={`mt-1 block text-xs tabular ${l.change !== null && l.change > 1e-6 ? "font-bold" : "font-semibold text-[var(--muted)]"}`}
          >
            {changeText(l)}
          </span>
        </span>
      </Link>
    </li>
  );

  const bars = data.buckets.map((b, i) => {
    const d = new Date(`${b.start}T12:00:00Z`); // bucket keys are "YYYY-MM-DD"; read as UTC so they don't shift
    const last = i === data.buckets.length - 1;
    return {
      value: Math.round(u(b.kg)),
      workouts: b.workouts,
      label: data.monthly
        ? `${last ? "This month" : formatIn(d, "UTC", { month: "long", year: "numeric" }, "en-GB")}`
        : last
          ? "This week"
          : `Week of ${formatDayMonth(d, "UTC")}`,
      short: last ? "Now" : data.monthly ? formatIn(d, "UTC", { month: "short", year: "2-digit" }, "en-GB") : formatDayMonth(d, "UTC"),
    };
  });
  const perWeek = workouts / Math.max(1, data.kpis.days / 7);
  // One row per lift per day (its newest record), "×2" when it moved more than once that day.
  const records: ((typeof data.recentPrs)[number] & { times: number })[] = [];
  for (const pr of data.recentPrs) {
    const same = records.find((r) => r.exerciseId === pr.exerciseId && formatDayMonth(new Date(r.occurredAt), tz) === formatDayMonth(new Date(pr.occurredAt), tz));
    if (same) same.times += 1;
    else records.push({ ...pr, times: 1 });
  }

  return (
    <section className="space-y-10">
      <div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="display text-5xl">Stats</h1>
          <div className="w-[6.5rem]">
            <Segment active={unit} items={(["kg", "lb"] as const).map((x) => ({ key: x, label: x.toUpperCase(), href: href(range, x) }))} />
          </div>
        </div>
        {/* One window for the whole page: everything below is read through it (DD-058). */}
        <div className="mt-5" aria-label="Window">
          <Segment active={range} items={RANGES.map((r) => ({ key: r.value, label: r.label, href: href(r.value, unit) }))} />
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">{since ? `Since ${formatDayMonth(since, tz)}` : "Every workout"}</p>

        {/* The answer first: is the lifter getting stronger? */}
        <div className="mt-8">
          {compared.length > 0 ? (
            <>
              <p className="text-[88px] font-bold leading-[0.85] tracking-[-0.05em] tabular">
                {stronger}
                <span className="text-[40px] tracking-[-0.03em] text-[var(--muted)]"> of {compared.length}</span>
              </p>
              <p className="mt-2 text-[22px] font-bold tracking-[-0.01em]">
                {compared.length === 1 ? "lift is" : "lifts are"} stronger
              </p>
            </>
          ) : (
            <>
              <p className="text-[88px] font-bold leading-[0.85] tracking-[-0.05em] tabular">{workouts}</p>
              <p className="mt-2 text-[22px] font-bold tracking-[-0.01em]">{workouts === 1 ? "workout" : "workouts"}</p>
            </>
          )}
          <p className="mt-1.5 text-sm text-[var(--muted)] tabular">
            {workouts === 0
              ? "Nothing logged in this window."
              : compared.length === 0
                ? "Do a lift twice to see it move."
                : `${plural(data.prCount, "record", "records")} in ${plural(workouts, "workout", "workouts")}`}
          </p>
        </div>
      </div>

      {lifts.length > 0 && (
        <section aria-labelledby="lifts">
          <h2 id="lifts" className="section-head">
            Lifts <span className="label">Best · change</span>
          </h2>
          <ul className="mt-1.5">{lifts.slice(0, BOARD_ROWS).map(liftRow)}</ul>
          {lifts.length > BOARD_ROWS && (
            <details className="group">
              <summary className="press label flex min-h-[var(--tap)] cursor-pointer list-none items-center justify-between border-t border-[var(--divider)] text-[var(--fg)] [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">All {lifts.length} lifts</span>
                <span className="hidden group-open:inline">Fewer lifts</span>
                <span aria-hidden="true" className="text-base leading-none">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <ul className="border-t border-[var(--divider)]">{lifts.slice(BOARD_ROWS).map(liftRow)}</ul>
            </details>
          )}
        </section>
      )}

      {workouts > 0 && (
        <>
          <section aria-labelledby="volume">
            <h2 id="volume" className="section-head">
              Volume <span className="label">Per {data.monthly ? "month" : "week"}</span>
            </h2>
            <div className="mt-3">
              <VolumeChart bars={bars} unit={unit} />
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3">
              {[
                [String(workouts), "", workouts === 1 ? "workout" : "workouts"],
                [formatNumber(Math.round(perWeek * 10) / 10), "", "a week"],
                [String(Math.round(data.kpis.avgSessionLengthMinutes)), "min", "average"],
              ].map(([value, suffix, what]) => (
                <div key={what}>
                  <dd className="text-[26px] font-bold leading-none tracking-[-0.02em] tabular">
                    {value}
                    {suffix && <span className="unit">{suffix}</span>}
                  </dd>
                  <dt className="mt-1 text-xs text-[var(--muted)]">{what}</dt>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="records">
            <h2 id="records" className="section-head">
              Records <span className="label tabular">{data.prCount}</span>
            </h2>
            {records.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">No records in this window yet.</p>
            ) : (
              <>
                <ul className="mt-1.5">{records.slice(0, RECORD_ROWS).map(recordRow)}</ul>
                {records.length > RECORD_ROWS && (
                  <details className="group">
                    <summary className="press label flex min-h-[var(--tap)] cursor-pointer list-none items-center justify-between border-t border-[var(--divider)] text-[var(--fg)] [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">{records.length - RECORD_ROWS} more</span>
                      <span className="hidden group-open:inline">Fewer</span>
                      <span aria-hidden="true" className="text-base leading-none">
                        <span className="group-open:hidden">+</span>
                        <span className="hidden group-open:inline">−</span>
                      </span>
                    </summary>
                    <ul className="border-t border-[var(--divider)]">{records.slice(RECORD_ROWS).map(recordRow)}</ul>
                  </details>
                )}
              </>
            )}
          </section>
        </>
      )}
    </section>
  );

  // One record: when, which lift and set, and how far it moved the record (same words as the Finish sheet, DD-048).
  function recordRow(pr: (typeof records)[number]) {
    const gain = prGain(pr, unit);
    return (
      <li key={pr.setId} className="border-t border-[var(--divider)] first:border-t-0">
        <Link href={`/app/lift/${pr.exerciseId}?unit=${unit}`} className="press grid grid-cols-[3.25rem_1fr_auto] items-start gap-3 py-3">
          <span className="pt-0.5 text-xs font-bold uppercase tracking-[0.08em] tabular">{formatDayMonth(new Date(pr.occurredAt), tz)}</span>
          <span className="min-w-0">
            <span className="block truncate text-base font-bold tracking-[-0.01em]">{name(pr.exerciseId)}</span>
            <span className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)] tabular">
              {pr.weightKg ? `${pr.reps} × ${formatLoad(u(pr.weightKg), unit).toLowerCase()}` : plural(pr.reps, "rep", "reps")}
              {pr.times > 1 && <span>×{pr.times}</span>}
              <span className="tag">{pr.kind === "weight" ? "Weight" : "Reps"}</span>
            </span>
          </span>
          <span className="text-lg font-bold leading-tight tracking-[-0.02em] tabular">
            {gain.value}
            <span className="unit">{pr.kind === "weight" ? unit : pr.gain === 1 ? "rep" : "reps"}</span>
          </span>
        </Link>
      </li>
    );
  }
}
