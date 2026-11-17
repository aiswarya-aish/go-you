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

// The PR board on Stats (P2-03, DD-050): every lift's current bests, the freshest record first.
export type BoardRow = {
  exerciseId: string;
  e1rmKg: number; // 0 for bodyweight-only lifts: the board shows bestReps instead
  heavyKg: number;
  heavyReps: number;
  bestReps: number;
  lastPrAt: string | null; // null: one session so far (the baseline), nothing beaten yet
  bw: boolean; // mostly bodyweight sets: measured in reps, not est. 1RM (a +5 kg pull-up is not a 7 kg lift)
  points: [t: number, v: number][]; // per session, oldest first: est. 1RM kg, or most reps when bw (Stats window, DD-058)
};

// The board, plus for Log (from the same pass over the history): how many PR sets each workout set ("2 PR" tag) and when
// every workout started (the month tapes).
export function liftBoard(byLift: Record<string, LiftSession[]>) {
  const prsByWorkout: Record<string, number> = {};
  const startedAt: Record<string, string> = {};
  const rows = Object.entries(byLift).flatMap(([exerciseId, sessions]) => {
    for (const s of sessions) startedAt[s.workoutId] = s.startedAt;
    const h = liftHistory(sessions);
    for (const pr of h.prs) prsByWorkout[pr.workoutId] = (prsByWorkout[pr.workoutId] ?? 0) + 1;
    if (!h.heaviest) return [];
    const all = sessions.flatMap((s) => s.sets);
    const reps = all.map((x) => x.reps);
    const bw = all.filter((x) => x.weight === 0).length * 2 > all.length;
    return [{
      exerciseId,
      e1rmKg: h.bestE1rmKg,
      heavyKg: toKg(h.heaviest.weight, h.heaviest.unit),
      heavyReps: h.heaviest.reps,
      bestReps: Math.max(...reps),
      lastPrAt: h.prs[0]?.startedAt ?? null,
      bw,
      points: sessions
        .filter((s) => s.sets.length)
        .map((s): [number, number] => [Date.parse(s.startedAt), bw ? Math.max(...s.sets.map((x) => x.reps)) : Math.max(...s.sets.map((x) => e1rmKg(x.weight, x.reps, x.unit)))]),
    }];
  });
  rows.sort((a, b) => (b.lastPrAt ?? "").localeCompare(a.lastPrAt ?? "") || b.e1rmKg - a.e1rmKg);
  return { rows, prsByWorkout, startedAt };
}

// One lift through the Stats window (DD-058): its best inside the window minus its best before it. A lift new in the window
// (or the ALL window) is measured against its own first session. null: not trained in the window, or nothing to compare yet.
export function liftChange(points: BoardRow["points"], since: number | null): number | null {
  const before = points.filter(([t]) => since !== null && t < since).map(([, v]) => v);
  const inside = points.filter(([t]) => since === null || t >= since).map(([, v]) => v);
  const base = before.length ? Math.max(...before) : inside.shift();
  return base === undefined || !inside.length ? null : Math.max(...inside) - base;
}

// Points inside the last `days` (null = all), for the chart's range switch.
export function pointsSince(points: LiftPoint[], days: number | null, now = Date.now()) {
  if (days === null) return points;
  const since = now - days * 86400000;
  return points.filter((p) => Date.parse(p.startedAt) >= since);
}

// A record set within the last `days` (the board's New tag).
export const isRecent = (iso: string | null, days: number, now = Date.now()) => !!iso && Date.parse(iso) >= now - days * 86400000;
