import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { dayIn, monthStart, weekStart } from "@/lib/time";
import { toKg, type Unit } from "@/lib/lift";
import { prKindsInRange, type Bests, type Pr } from "@/lib/prs";
import { bestsByExercise } from "@/lib/history"; // history imports workoutsTag from here; both are only used inside functions

// The Stats window (DD-058): everything on the page is read through it.
export type Range = "1m" | "3m" | "1y" | "all";

export const workoutsTag = (userId: string) => `workouts:${userId}`;

export const resolveRange = (v: string | undefined): Range => (v === "1m" || v === "1y" || v === "all" ? v : "3m");
export const resolveUnit = (v: string | undefined): Unit => (v === "lb" ? "lb" : "kg");

const DAYS: Record<Exclude<Range, "all">, number> = { "1m": 30, "3m": 91, "1y": 365 };
export const rangeStart = (range: Range, now = Date.now()) => (range === "all" ? null : new Date(now - DAYS[range] * 86400000));

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const nextMonth = (day: string) => addDays(`${day.slice(0, 8)}28`, 7).slice(0, 8) + "01";

// All values in kg; the page converts to the display unit.
async function computeStats(userId: string, range: Range, tz: string) {
  const since = rangeStart(range);
  // PRs in the range are measured against the all-time record before it (P2-01), fetched beside the range's workouts.
  const [workouts, before] = await Promise.all([
    prisma.workout.findMany({
    where: { userId, ...(since ? { startedAt: { gte: since } } : {}) },
    orderBy: { startedAt: "asc" },
    relationLoadStrategy: "join",
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      exercises: {
        select: {
          exerciseId: true,
          sets: { orderBy: { createdAt: "asc" }, select: { id: true, reps: true, weight: true, unit: true, createdAt: true } },
        },
      },
    },
    }),
    since ? bestsByExercise(userId, since) : Promise.resolve({} as Record<string, Bests | undefined>),
  ]);

  const day = dayIn(tz);
  let totalVolumeKg = 0;
  let totalMinutes = 0;
  let completed = 0;
  // Volume per week (1M, 3M) or per month (1Y, ALL), every bucket kept so empty weeks show as gaps.
  const monthly = range === "1y" || range === "all";
  const bucketOf = (d: Date) => (monthly ? monthStart(day(d)) : weekStart(day(d)));
  const volume = new Map<string, { kg: number; workouts: number }>();
  type RangeSet = { id: string; reps: number; weight: number; unit: string; createdAt: Date; workoutId: string };
  const setsByExercise = new Map<string, RangeSet[]>(); // in time order, for the PR pass below
  const prs: ({ occurredAt: string; exerciseId: string; setId: string; reps: number; weightKg: number } & Pr)[] = [];

  for (const w of workouts) {
    if (w.endedAt) {
      totalMinutes += Math.max(0, (w.endedAt.getTime() - w.startedAt.getTime()) / 60000);
      completed += 1;
    }
    const bucket = volume.get(bucketOf(w.startedAt)) ?? volume.set(bucketOf(w.startedAt), { kg: 0, workouts: 0 }).get(bucketOf(w.startedAt))!;
    bucket.workouts += 1;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        const kg = toKg(s.weight, s.unit);
        totalVolumeKg += kg * s.reps;
        bucket.kg += kg * s.reps;
        const list = setsByExercise.get(ex.exerciseId) ?? setsByExercise.set(ex.exerciseId, []).get(ex.exerciseId)!;
        list.push({ ...s, workoutId: w.id });
      }
    }
  }

  // Weight and rep PRs (DD-048) against the record before the range (lib/prs.ts prKindsInRange, tested).
  for (const [exerciseId, list] of setsByExercise)
    for (const { set: s, pr } of prKindsInRange(list, before[exerciseId]))
      prs.push({ occurredAt: s.createdAt.toISOString(), exerciseId, setId: s.id, reps: s.reps, weightKg: toKg(s.weight, s.unit), ...pr });

  const buckets: { start: string; kg: number; workouts: number }[] = [];
  const first = since ?? workouts[0]?.startedAt;
  if (first) {
    const now = bucketOf(new Date());
    for (let k = bucketOf(first); k <= now; k = monthly ? nextMonth(k) : addDays(k, 7)) buckets.push({ start: k, ...(volume.get(k) ?? { kg: 0, workouts: 0 }) });
  }

  return {
    kpis: {
      workoutsCount: workouts.length,
      totalVolumeKg,
      avgSessionLengthMinutes: completed > 0 ? totalMinutes / completed : 0,
      days: first ? Math.max(1, (Date.now() - first.getTime()) / 86400000) : 0, // the window's length, for "a week"
    },
    prCount: prs.length,
    recentPrs: prs.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 12),
    monthly,
    buckets, // oldest first; the last one is still running
  };
}

// "stats-2": new shape (DD-058); the data cache outlives deploys.
// shortcut: relative ranges (1m/3m/1y) can be up to 1h stale between saves; saving a workout clears the cache at once.
export const getStats = (userId: string, range: Range, tz: string) =>
  unstable_cache(() => computeStats(userId, range, tz), ["stats-2", userId, range, tz], {
    tags: [workoutsTag(userId)],
    revalidate: 3600,
  })();
