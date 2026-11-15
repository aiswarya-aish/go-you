// Run: npm test (node --test, Node's built-in TypeScript stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraft, validateWorkout } from "./validate-workout.ts";

const ok = () => ({
  workout: { id: "w1", startedAt: "2026-11-10T10:00:00Z", endedAt: "2026-11-10T11:00:00Z" },
  exercises: [{ id: "e1", exerciseId: "bench_press", order: 0, label: "Bench press" } as { id: string; exerciseId: string; order: number; label?: string }],
  sets: [{ id: "s1", exerciseInstanceId: "e1", reps: 5, weight: 100, unit: "kg", createdAt: "2026-11-10T10:05:00Z" }],
});

test("accepts a valid workout, including bodyweight (0 kg)", () => {
  assert.equal(validateWorkout(ok()), null);
  const bw = ok();
  bw.sets[0].weight = 0;
  assert.equal(validateWorkout(bw), null);
  const noLabel = ok(); // saved on a phone before labels existed
  delete noLabel.exercises[0].label;
  assert.equal(validateWorkout(noLabel), null);
});

test("drafts: only the owner's, same rules as a save, exercises may be empty", () => {
  const draft = () => ({
    workout: { id: "w1", userId: "me@x", startedAt: "2026-11-10T10:00:00Z" },
    title: "ROUTINE A",
    exercises: [{ id: "e1", exerciseId: "bench_press", order: 7, label: "Bench press" }, { id: "e2", exerciseId: "row", order: 0 }],
    sets: [{ id: "s1", exerciseInstanceId: "e1", reps: 5, weight: 100, unit: "kg", createdAt: "2026-11-10T10:05:00Z" }],
  });
  assert.equal(validateDraft(draft(), "me@x"), null);
  assert.equal(validateDraft(draft(), "other@x"), "Not your workout");
  assert.equal(validateDraft(null, "me@x"), "Not your workout");
  const bad = draft();
  bad.sets[0].reps = 5000;
  assert.equal(validateDraft(bad, "me@x"), "Invalid reps");
  const long = draft();
  long.title = "x".repeat(65);
  assert.equal(validateDraft(long, "me@x"), "Invalid title");
});

test("rejects bad input", () => {
  assert.equal(validateWorkout(null), "Invalid workout");
  const cases: [string, (b: ReturnType<typeof ok>) => void][] = [
    ["Workout ends before it starts", (b) => (b.workout.endedAt = "2026-11-10T09:00:00Z")],
    ["Invalid set", (b) => (b.sets[0].exerciseInstanceId = "nope")],
    ["Invalid reps", (b) => (b.sets[0].reps = 0)],
    ["Invalid weight", (b) => (b.sets[0].weight = -1)],
    ["Invalid unit", (b) => (b.sets[0].unit = "st")],
    ["Invalid exercise name", (b) => (b.exercises[0].exerciseId = "Bench Press")],
    ["Invalid exercise id", (b) => b.exercises.push({ id: "e1", exerciseId: "row", order: 1 })],
    ["Invalid exercise label", (b) => (b.exercises[0].label = "   ")],
    ["Invalid exercise label", (b) => (b.exercises[0].label = "x".repeat(65))],
  ];
  for (const [msg, mutate] of cases) {
    const b = ok();
    mutate(b);
    assert.equal(validateWorkout(b), msg);
  }
});
