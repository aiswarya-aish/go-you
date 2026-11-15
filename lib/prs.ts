// Personal records, two kinds (P2-01, DD-048). Pure: shared by the live logger, the session report, Log detail and Stats,
// and run by node's test runner.
//
// A set is a PR when it is heavier than ever (Weight PR) or has more reps than ever at that weight or heavier (Rep PR).
// A higher estimated 1RM is not a third kind: Epley rises only with weight or reps, so any 1RM gain is already one of these two.
import { formatNumber, KG_PER_LB, toKg } from "./lift.ts";

// What a lifter has done before, per exercise, in kg: the heaviest weight, and the rep frontier: [kg, most reps at that kg
// or heavier] points from heaviest to lightest (reps only grow as the weight drops).
export type Bests = { weightKg: number; frontier: [kg: number, reps: number][] };

export type PrKind = "weight" | "reps";
export type Pr = { kind: PrKind; gain: number }; // gain: kg for a Weight PR, reps for a Rep PR

type SetLike = { reps: number; weight: number; unit: string };
const EPS = 1e-6;

// The most reps ever done at this weight or heavier (0 if never this heavy).
export function repsAtOrAbove(frontier: Bests["frontier"], kg: number) {
  let best = 0;
  for (const [w, r] of frontier) if (w >= kg - EPS) best = Math.max(best, r);
  return best;
}

// Builds bests from (kg, most reps at that kg) pairs, e.g. one SQL row per exercise and weight.
export function bestsFrom(rows: { kg: number; reps: number }[]): Bests {
  const sorted = [...rows].sort((a, b) => b.kg - a.kg || b.reps - a.reps);
  const frontier: Bests["frontier"] = [];
  let reps = 0;
  for (const r of sorted) {
    if (r.reps > reps) frontier.push([r.kg, r.reps]);
    reps = Math.max(reps, r.reps);
  }
  return { weightKg: sorted[0]?.kg ?? 0, frontier };
}

// For one exercise's sets in order: which are PRs, against everything before (history, then the earlier sets today).
// Heavier is named first. No history means nothing to beat yet, so no PRs (a first session sets the baseline).
export function prKinds(sets: SetLike[], best: Bests | undefined): (Pr | null)[] {
  if (!best) return sets.map(() => null);
  let { weightKg } = best;
  const frontier = [...best.frontier];
  return sets.map((s) => {
    const kg = toKg(s.weight, s.unit);
    const repsBefore = repsAtOrAbove(frontier, kg);
    const pr: Pr | null =
      kg > weightKg + EPS ? { kind: "weight", gain: kg - weightKg } : s.reps > repsBefore ? { kind: "reps", gain: s.reps - repsBefore } : null;
    weightKg = Math.max(weightKg, kg);
    frontier.push([kg, s.reps]);
    return pr;
  });
}

// The sets of one exercise inside a Stats range, in time order, measured against the record before the range.
// No record before (range "all", or first done inside the range): its first session sets the baseline and is not counted.
export function prKindsInRange<S extends SetLike & { workoutId: string }>(sets: S[], before: Bests | undefined): { set: S; pr: Pr }[] {
  const firstSession = before ? 0 : sets.filter((s) => s.workoutId === sets[0]?.workoutId).length;
  const base = before ?? bestsFrom(sets.slice(0, firstSession).map((s) => ({ kg: toKg(s.weight, s.unit), reps: s.reps })));
  const rest = sets.slice(firstSession);
  return prKinds(rest, base).flatMap((pr, i) => (pr ? [{ set: rest[i], pr }] : []));
}

export const PR_LABEL: Record<PrKind, string> = { weight: "Weight PR", reps: "Rep PR" };

// How far a PR moved the record, in words that need no explaining: "+2.5" + "kg heavier", "+2" + "more reps".
// A weight gain under 0.05 shows as the smallest step (+0.1), never "+0". Shared by the Finish sheet, receipt and Stats.
export function prGain(pr: Pr, unit: "kg" | "lb"): { value: string; what: string } {
  if (pr.kind === "reps") return { value: `+${pr.gain}`, what: pr.gain === 1 ? "more rep" : "more reps" };
  const shown = Math.max(0.1, unit === "lb" ? pr.gain / KG_PER_LB : pr.gain);
  return { value: `+${formatNumber(shown)}`, what: `${unit} heavier` };
}
