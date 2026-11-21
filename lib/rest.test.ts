import { test } from "node:test";
import assert from "node:assert/strict";
import { endedLive, isAway, restPhase, restState } from "./rest.ts";
import { formatClock } from "./time.ts";

test("rest counts down from the last set to the target", () => {
  assert.deepEqual(restState(0, 30_000, 120), { remainingMs: 90_000, done: false });
  assert.deepEqual(restState(0, 120_000, 120), { remainingMs: 0, done: true });
  assert.deepEqual(restState(0, 500_000, 120), { remainingMs: 0, done: true }); // stays done, no overrun count
  assert.equal(restState(10_000, 5_000, 60).remainingMs, 60_000); // clock skew never adds time
});

test("clock format: m:ss under an hour, h:mm:ss after", () => {
  assert.equal(formatClock(91_000), "1:31");
  assert.equal(formatClock(5_000), "0:05");
  assert.equal(formatClock(2_052_000), "34:12");
  assert.equal(formatClock(3_725_000), "1:02:05");
  assert.equal(formatClock(-5), "0:00");
});

test("rest phase: screen while resting, bar once put away, GO only when seen", () => {
  const base = { done: false, away: false, shown: true, go: false };
  assert.equal(restPhase(base), "screen");
  assert.equal(restPhase({ ...base, shown: false }), "bar"); // the 600 ms after Log set
  assert.equal(restPhase({ ...base, away: true }), "bar"); // Skip: the countdown stays in the workout bar
  assert.equal(restPhase({ ...base, done: true }), "off"); // ran out unseen: no GO left behind, the title comes back
  assert.equal(restPhase({ ...base, done: true, go: true }), "go"); // ran out on screen
  assert.equal(restPhase({ ...base, done: true, go: true, away: true }), "off"); // GO tapped away
});

test("put away covers every set up to that moment", () => {
  assert.equal(isAway("2026-11-21T10:00:00.000Z", null), false);
  assert.equal(isAway("2026-11-21T10:00:00.000Z", "2026-11-21T10:00:00.000Z"), true);
  assert.equal(isAway("2026-11-21T09:58:00.000Z", "2026-11-21T10:00:00.000Z"), true); // Undo back to an older set: stays away
  assert.equal(isAway("2026-11-21T10:02:00.000Z", "2026-11-21T10:00:00.000Z"), false); // a new set: its own rest screen
});

test("rest ending is live only when it just happened or the length was just shortened", () => {
  assert.equal(endedLive(120_400, 120_000, false), true); // the tick right after the end
  assert.equal(endedLive(300_000, 120_000, false), false); // phone unlocked 3 min later: no buzz, no GO
  assert.equal(endedLive(300_000, 120_000, true), true); // picked 1:00 after resting 1:30 on screen: that ends it now
});
