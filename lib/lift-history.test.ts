import { test } from "node:test";
import assert from "node:assert/strict";
import { liftBoard, liftChange, liftHistory, pointsSince } from "./lift-history.ts";

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

test("board: one row per lift, freshest PR first, bodyweight lifts keep their reps", () => {
  const s = (workoutId: string, day: string, sets: ReturnType<typeof set>[]) => ({ workoutId, startedAt: `2026-${day}T10:00:00Z`, sets });
  const { rows: board, prsByWorkout } = liftBoard({
    bench: [s("a", "09-01", [set("1", 5, 100)]), s("b", "10-01", [set("2", 3, 110)])], // weight PR on 1 Oct
    squat: [s("c", "09-02", [set("3", 5, 120)]), s("d", "11-01", [set("4", 8, 120)])], // rep PR on 1 Nov
    pullup: [s("e", "09-03", [set("5", 8, 0)]), s("f", "09-10", [set("6", 6, 0)])], // nothing beaten yet
    curl: [s("g", "09-04", [])], // no sets: no row
  });
  assert.deepEqual(board.map((r) => [r.exerciseId, r.lastPrAt?.slice(0, 10) ?? null]), [
    ["squat", "2026-11-01"],
    ["bench", "2026-10-01"],
    ["pullup", null],
  ]);
  assert.deepEqual([board[1].heavyKg, board[1].heavyReps], [110, 3]);
  assert.deepEqual([board[2].e1rmKg, board[2].bestReps], [0, 8]);
  assert.deepEqual(prsByWorkout, { b: 1, d: 1 });
  assert.equal(board[2].bw, true); // pull-ups are measured in reps
  assert.deepEqual(board[2].points.map(([, v]) => v), [8, 6]);
});

test("window change: best inside minus best before; new lifts against their first session", () => {
  const p: [number, number][] = [[1, 100], [2, 110], [3, 105], [4, 112]];
  assert.equal(liftChange(p, 3), 2); // 112 vs 110 before
  assert.equal(liftChange(p, 2), 12); // window starts at the 110 session: 112 vs 100 before
  assert.equal(liftChange(p, null), 12); // ALL: vs the first session
  assert.equal(liftChange([[5, 90]], 3), null); // one session in the window, nothing before
  assert.equal(liftChange(p, 9), null); // not trained in the window
  assert.equal(liftChange([[1, 100], [5, 95]], 3), -5); // went down
});
