import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReport } from "./report.ts";

const set = (exerciseInstanceId: string, reps: number, weight: number, unit = "kg") => ({ exerciseInstanceId, reps, weight, unit });

test("PRs carry the gain over the previous best; lines compare with the last session", () => {
  const r = sessionReport(
    [
      { id: "a", exerciseId: "bench_press", label: "BENCH PRESS" },
      { id: "b", exerciseId: "pull_up", label: "PULL-UP" },
      { id: "c", exerciseId: "zercher_squat", label: "Zercher squat" },
      { id: "d", exerciseId: "row", label: "ROW" }, // no sets: left out
    ],
    [set("a", 5, 100), set("a", 5, 102.5), set("b", 8, 0), set("b", 7, 0), set("c", 5, 60)],
    { bench_press: [set("x", 5, 100), set("x", 5, 100)], pull_up: [set("x", 6, 0), set("x", 6, 0)] },
    { bench_press: 100 * (1 + 5 / 30), pull_up: 0 },
  );
  // Bench: 102.5 × 5 beats the old best (100 × 5); the gain is the e1RM difference.
  assert.equal(r.prs.length, 1);
  assert.equal(r.prs[0].set.weight, 102.5);
  assert.equal(Math.round(r.prs[0].gainKg * 100) / 100, 2.92);
  assert.deepEqual(
    r.lines.map((l) => [l.name, l.today, l.change]),
    [
      ["BENCH PRESS", "5 @ 102.5 KG", { by: "volume", pct: 1 }], // 1012.5 vs 1000
      ["PULL-UP", "8 @ BW", { by: "reps", pct: 25 }], // bodyweight: 15 reps vs 12
      ["Zercher squat", "5 @ 60 KG", null], // first time
    ],
  );
  assert.equal(r.volumeKg, 100 * 5 + 102.5 * 5 + 60 * 5);
});

test("lb sets count in kg, and an empty workout reports nothing", () => {
  const r = sessionReport([{ id: "a", exerciseId: "squat", label: "SQUAT" }], [set("a", 5, 225, "lb")], { squat: [set("x", 5, 100)] }, {});
  assert.equal(r.lines[0].change?.pct, 2); // 225 lb = 102.06 kg
  assert.equal(r.prs.length, 0); // no history best → nothing to beat
  assert.deepEqual(sessionReport([], [], {}, {}), { volumeKg: 0, prs: [], lines: [] });
});
