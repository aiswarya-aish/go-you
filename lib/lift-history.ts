// One lift's story for its page (P2-02, DD-049): a point per session for the chart, the PR history, the current bests.
// Pure: also run by node's test runner.
import { e1rmKg, toKg } from "./lift.ts";
import { prKindsInRange, type Pr } from "./prs.ts";

type Set = { id: string; reps: number; weight: number; unit: string };
export type LiftSession = { workoutId: string; startedAt: string; sets: Set[] }; // oldest first

export type LiftPoint = { workoutId: string; startedAt: string; e1rmKg: number; pr: boolean };
export type LiftPr = { workoutId: string; startedAt: string; set: Set } & Pr;

export function liftHistory(sessions: LiftSession[]) {
  const all = sessions.flatMap((s) => s.sets.map((set) => ({ ...set, workoutId: s.workoutId })));
  // PRs exactly as Stats → ALL counts them: the first session is the baseline (prs.ts, tested).
  const found = prKindsInRange(all, undefined);
  const prWorkouts = new Set(found.map((f) => f.set.workoutId));
  const startedAt = new Map(sessions.map((s) => [s.workoutId, s.startedAt]));

  const points: LiftPoint[] = sessions
    .filter((s) => s.sets.length)
    .map((s) => ({
      workoutId: s.workoutId,
      startedAt: s.startedAt,
      e1rmKg: Math.max(...s.sets.map((x) => e1rmKg(x.weight, x.reps, x.unit))),
      pr: prWorkouts.has(s.workoutId),
    }));

  const heaviest = all.reduce<Set | null>((a, b) => (!a || toKg(b.weight, b.unit) > toKg(a.weight, a.unit) ? b : a), null);
  return {
    points,
    prs: found
      .map(({ set: { workoutId, ...set }, pr }) => ({ workoutId, startedAt: startedAt.get(workoutId)!, set, ...pr }))
      .reverse(), // newest first
    heaviest, // the set itself, so the page can say "120 kg × 1"
    bestE1rmKg: Math.max(0, ...points.map((p) => p.e1rmKg)),
    sessions: points.length,
  };
}

// Points inside the last `days` (null = all), for the chart's range switch.
export function pointsSince(points: LiftPoint[], days: number | null, now = Date.now()) {
  if (days === null) return points;
  const since = now - days * 86400000;
  return points.filter((p) => Date.parse(p.startedAt) >= since);
}
