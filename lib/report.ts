// The session report on Finish and on the saved receipt (P1-06 v2, DD-041). Pure: also run by node's test runner.
import { e1rmKg, prFlags, sessionSummary, toKg } from "./lift.ts";

type SetLike = { reps: number; weight: number; unit: string };

export type ReportPr = { exerciseId: string; name: string; set: SetLike; gainKg: number };
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
  bestE1rmKg: Record<string, number>,
) {
  const prs: ReportPr[] = [];
  const lines: ReportLine[] = [];
  for (const ex of exercises) {
    const mine = sets.filter((s) => s.exerciseInstanceId === ex.id);
    if (!mine.length) continue;
    const best = bestE1rmKg[ex.exerciseId];
    const flags = prFlags(mine, best);
    const flagged = mine.filter((_, i) => flags[i]);
    if (flagged.length) {
      const top = flagged.reduce((a, b) => (e1rmKg(b.weight, b.reps, b.unit) > e1rmKg(a.weight, a.reps, a.unit) ? b : a));
      prs.push({ exerciseId: ex.exerciseId, name: ex.label, set: top, gainKg: e1rmKg(top.weight, top.reps, top.unit) - best });
    }
    const prev = last[ex.exerciseId];
    lines.push({ exerciseId: ex.exerciseId, name: ex.label, today: sessionSummary(mine), change: prev?.length ? compare(mine, prev) : null });
  }
  const volumeKg = sets.reduce((n, s) => n + toKg(s.weight, s.unit) * s.reps, 0);
  return { volumeKg, prs, lines };
}
