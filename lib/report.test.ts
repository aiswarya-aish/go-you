import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReport } from "./report.ts";
import { bestsFrom } from "./prs.ts";

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
    { bench_press: bestsFrom([{ kg: 100, reps: 5 }]), pull_up: bestsFrom([{ kg: 0, reps: 6 }]) },
  );
  // Bench: 102.5 × 5 is heavier than ever (a weight PR, +2.5 kg). Pull-up: 8 bodyweight reps beat 6 (a rep PR, +2).
  assert.deepEqual(
    r.prs.map((p) => [p.name, p.kind, p.gain, p.set.reps]),
    [["BENCH PRESS", "weight", 2.5, 5], ["PULL-UP", "reps", 2, 8]],
  );
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

test("an exercise with both kinds reports its weight PR; within a kind, the biggest gain", () => {
  const r = sessionReport(
    [{ id: "a", exerciseId: "squat", label: "SQUAT" }],
    [set("a", 12, 80), set("a", 1, 120), set("a", 1, 125)],
    {},
    { squat: bestsFrom([{ kg: 115, reps: 1 }, { kg: 80, reps: 10 }]) },
  );
  assert.deepEqual(r.prs.map((p) => [p.kind, p.gain]), [["weight", 10]]); // 125 vs 115, not 120's +5 or the 12-rep PR
});
