import { test } from "node:test";
import assert from "node:assert/strict";
import { liftHistory, pointsSince } from "./lift-history.ts";

const set = (id: string, reps: number, weight: number, unit = "kg") => ({ id, reps, weight, unit });

test("a point per session, PR sessions marked, bests and PR history newest first", () => {
  const h = liftHistory([
    { workoutId: "a", startedAt: "2026-09-01T10:00:00Z", sets: [set("1", 5, 100), set("2", 5, 100)] }, // baseline
    { workoutId: "b", startedAt: "2026-10-01T10:00:00Z", sets: [set("3", 5, 95)] }, // nothing beaten
    { workoutId: "c", startedAt: "2026-11-01T10:00:00Z", sets: [set("4", 3, 110), set("5", 8, 90)] }, // weight PR + rep PR
    { workoutId: "d", startedAt: "2026-11-10T10:00:00Z", sets: [] }, // no sets: no point
  ]);
  assert.deepEqual(h.points.map((p) => [p.workoutId, p.pr]), [["a", false], ["b", false], ["c", true]]);
  assert.equal(Math.round(h.points[2].e1rmKg * 10) / 10, 121); // the session's best estimate: 110 x 3 (121) over 90 x 8 (114)
  assert.deepEqual(h.prs.map((p) => [p.set.id, p.kind, p.workoutId]), [["5", "reps", "c"], ["4", "weight", "c"]]);
  assert.equal(h.heaviest?.weight, 110);
  assert.equal(h.sessions, 3);
});

test("empty history and range filtering", () => {
  const h = liftHistory([]);
  assert.deepEqual([h.points, h.prs, h.heaviest, h.bestE1rmKg, h.sessions], [[], [], null, 0, 0]);
  const pts = [
    { workoutId: "a", startedAt: "2026-01-01T00:00:00Z", e1rmKg: 100, pr: false },
    { workoutId: "b", startedAt: "2026-11-01T00:00:00Z", e1rmKg: 110, pr: true },
  ];
  const now = Date.parse("2026-11-15T00:00:00Z");
  assert.deepEqual(pointsSince(pts, 90, now).map((p) => p.workoutId), ["b"]);
  assert.deepEqual(pointsSince(pts, null, now).map((p) => p.workoutId), ["a", "b"]);
});
