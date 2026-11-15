// The session report on Finish and on the saved receipt (P1-06 v2, DD-041). Pure: also run by node's test runner.
import { sessionSummary, toKg } from "./lift.ts";
import { prKinds, repsAtOrAbove, type Bests, type Pr } from "./prs.ts";

type SetLike = { reps: number; weight: number; unit: string };

// One per exercise: its plainest PR today (a weight PR if any, else a rep PR), the biggest gain of that kind.
export type ReportPr = { exerciseId: string; name: string; set: SetLike } & Pr;
export type ReportLine = {
  exerciseId: string;
  name: string;
  today: string; // best set today, "3 × 5 @ 100 KG"
  change: { by: "volume" | "reps"; pct: number } | null; // vs the last session of this exercise; null = first time
};

// Volume (kg × reps) says how much work was done. When neither session carried load (bodyweight), total reps does.
function compare(today: SetLike[], prev: SetLike[]): ReportLine["change"] {
  const volume = (s: SetLike[]) => s.reduce((n, x) => n + toKg(x.weight, x.unit) * x.reps, 0);
  const reps = (s: SetLike[]) => s.reduce((n, x) => n + x.reps, 0);
  const by = volume(today) > 0 || volume(prev) > 0 ? "volume" : "reps";
  const [a, b] = by === "volume" ? [volume(today), volume(prev)] : [reps(today), reps(prev)];
  return b > 0 ? { by, pct: Math.round(((a - b) / b) * 100) } : null;
}

export function sessionReport(
  exercises: { id: string; exerciseId: string; label: string }[],
  sets: (SetLike & { exerciseInstanceId: string })[],
  last: Record<string, SetLike[]>,
  bests: Record<string, Bests>,
) {
  const prs: ReportPr[] = [];
  const lines: ReportLine[] = [];
  for (const ex of exercises) {
    const mine = sets.filter((s) => s.exerciseInstanceId === ex.id);
    if (!mine.length) continue;
    const before = bests[ex.exerciseId];
    // Which sets were PRs is decided set by set (earlier sets today count); the gain reported is against the record before
    // this workout, so 120 then 125 over a 115 best reads +10, not +5.
    const found = prKinds(mine, before)
      .map((pr, i) => {
        if (!pr || !before) return null;
        const kg = toKg(mine[i].weight, mine[i].unit);
        const gain = pr.kind === "weight" ? kg - before.weightKg : mine[i].reps - repsAtOrAbove(before.frontier, kg);
        return { kind: pr.kind, gain, set: mine[i] };
      })
      .filter((p) => p !== null);
    const top = found.reduce<(typeof found)[number] | null>(
      (a, b) => (!a || (b.kind === "weight" && a.kind === "reps") || (b.kind === a.kind && b.gain > a.gain) ? b : a),
      null,
    );
    if (top) prs.push({ exerciseId: ex.exerciseId, name: ex.label, ...top });
    const prev = last[ex.exerciseId];
    lines.push({ exerciseId: ex.exerciseId, name: ex.label, today: sessionSummary(mine), change: prev?.length ? compare(mine, prev) : null });
  }
  const volumeKg = sets.reduce((n, s) => n + toKg(s.weight, s.unit) * s.reps, 0);
  return { volumeKg, prs, lines };
}
