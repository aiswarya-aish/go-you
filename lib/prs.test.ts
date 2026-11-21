import { test } from "node:test";
import assert from "node:assert/strict";
import { bestsFrom, prGain, prKinds, prKindsInRange, repsAtOrAbove } from "./prs.ts";
import { e1rmKg } from "./lift.ts";

const s = (reps: number, weight: number, unit = "kg") => ({ reps, weight, unit });

test("bests: heaviest weight and the rep frontier", () => {
  const b = bestsFrom([{ kg: 100, reps: 5 }, { kg: 80, reps: 10 }, { kg: 90, reps: 4 }, { kg: 60, reps: 8 }]);
  assert.equal(b.weightKg, 100);
  assert.deepEqual(b.frontier, [[100, 5], [80, 10]]); // 90x4 and 60x8 are beaten by heavier-or-equal sets with more reps
  assert.equal(repsAtOrAbove(b.frontier, 85), 5);
  assert.equal(repsAtOrAbove(b.frontier, 70), 10);
  assert.equal(repsAtOrAbove(b.frontier, 120), 0);
  assert.deepEqual(bestsFrom([]), { weightKg: 0, frontier: [] });
});

test("weight PR before rep PR; earlier sets today count; equal is not a PR", () => {
  const best = bestsFrom([{ kg: 100, reps: 5 }, { kg: 80, reps: 10 }]);
  const prs = prKinds([s(1, 102.5), s(11, 80), s(6, 95), s(5, 95), s(10, 80)], best);
  assert.deepEqual(prs.map((p) => p?.kind ?? null), ["weight", "reps", "reps", null, null]);
  assert.equal(prs[0]!.gain, 2.5);
  assert.equal(prs[1]!.gain, 1); // 11 vs 10 reps at 80+
  assert.equal(prs[2]!.gain, 1); // 6 at 95: before, the most at 95+ was 5 (100x5)
  assert.equal(prKinds([s(4, 100)], bestsFrom([{ kg: 100, reps: 3 }, { kg: 110, reps: 4 }]))[0], null); // 110x4 beats it on both
  assert.equal(prKinds([s(5, 100)], bestsFrom([{ kg: 100, reps: 5 }]))[0], null);
});

test("every higher estimated 1RM is caught as a weight or rep PR", () => {
  const history = [{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }, { kg: 70, reps: 12 }, { kg: 0, reps: 15 }];
  const best = bestsFrom(history);
  const topE1rm = Math.max(...history.map((h) => e1rmKg(h.kg, h.reps, "kg")));
  for (let kg = 0; kg <= 110; kg += 2.5)
    for (let reps = 1; reps <= 20; reps++)
      if (e1rmKg(kg, reps, "kg") > topE1rm + 1e-6) assert.ok(prKinds([s(reps, kg)], best)[0], `${reps} x ${kg} raises the estimate`);
});

test("Stats range: against the record before it; without one, the first session is the baseline", () => {
  const w = (workoutId: string, reps: number, weight: number) => ({ workoutId, reps, weight, unit: "kg" });
  const sets = [w("a", 5, 100), w("a", 5, 105), w("b", 5, 110), w("b", 8, 90)];
  // No record before: workout "a" is the baseline, so only "b" can PR (110 heavier than 105; 8 reps at 90+ beat 5).
  assert.deepEqual(prKindsInRange(sets, undefined).map((x) => [x.set.weight, x.pr.kind]), [[110, "weight"], [90, "reps"]]);
  // A record before the range (120 x 3) and no baseline session: every set counts. Each x5 beats 3 reps at its weight or heavier
  // (the earlier 100 x5 is lighter, so it does not cover 105 or 110); 90 x8 beats 5 at 90+.
  assert.deepEqual(
    prKindsInRange(sets, bestsFrom([{ kg: 120, reps: 3 }])).map((x) => [x.set.weight, x.pr.kind]),
    [[100, "reps"], [105, "reps"], [110, "reps"], [90, "reps"]],
  );
  assert.deepEqual(prKindsInRange([], undefined), []);
});

test("PR wording: kg or lb heavier, reps singular/plural, never +0", () => {
  assert.deepEqual(prGain({ kind: "weight", gain: 2.5 }, "kg"), { value: "+2.5", what: "kg heavier" });
  assert.deepEqual(prGain({ kind: "weight", gain: 0.01 }, "kg"), { value: "+0.1", what: "kg heavier" });
  assert.deepEqual(prGain({ kind: "weight", gain: 2.26796185 }, "lb"), { value: "+5", what: "lb heavier" });
  assert.deepEqual(prGain({ kind: "reps", gain: 1 }, "kg"), { value: "+1", what: "more rep" });
  assert.deepEqual(prGain({ kind: "reps", gain: 3 }, "lb"), { value: "+3", what: "more reps" });
});

test("bodyweight: more reps is a rep PR; lb converts; no history means no PRs", () => {
  assert.equal(prKinds([s(12, 0)], bestsFrom([{ kg: 0, reps: 10 }]))[0]?.kind, "reps");
  assert.equal(prKinds([s(10, 0)], bestsFrom([{ kg: 0, reps: 10 }]))[0], null);
  assert.equal(prKinds([s(5, 225, "lb")], bestsFrom([{ kg: 100, reps: 5 }]))[0]?.kind, "weight"); // 102.06 kg
  assert.deepEqual(prKinds([s(5, 100), s(5, 110)], undefined), [null, null]);
});
