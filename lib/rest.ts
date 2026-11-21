// Rest between sets, derived from the last set's timestamp: no timer state, so it survives a locked phone or a reload.

export const REST_TARGETS = [60, 90, 120, 180] as const; // seconds, offered as a segmented choice
export const DEFAULT_REST = 120;
export const REST_SCREEN_DELAY = 600; // ms after Log set, so the set row (and its PR stamp) lands before the rest screen covers it

export function restState(lastSetMs: number, nowMs: number, targetSec: number) {
  const elapsedMs = Math.max(0, nowMs - lastSetMs);
  const remainingMs = Math.max(0, targetSec * 1000 - elapsedMs);
  return { remainingMs, done: remainingMs === 0 };
}

// What the rest timer shows for the newest set (DD-060):
// "screen" = the full-screen rest, "bar" = the countdown in the workout bar, "go" = the white GO, "off" = the workout title.
// away: this set's rest was put away (Skip, drag up, Escape, Undo). shown: the screen's delay after Log set has passed.
// go: rest ran out while the screen was up. A GO that nobody saw is never shown afterwards.
export type RestPhase = "off" | "bar" | "screen" | "go";
export function restPhase({ done, away, shown, go }: { done: boolean; away: boolean; shown: boolean; go: boolean }): RestPhase {
  if (go && !away) return "go";
  if (done) return "off";
  return away || !shown ? "bar" : "screen";
}

// Rest ran out "live", so it earns the buzz and GO: it ended under 2 s ago, or because a shorter length was just picked.
// A page frozen by a locked phone wakes long after rest ended: its first tick is not live, so no buzz and no stale GO.
export const LIVE_END_MS = 2000;
export const endedLive = (nowMs: number, endMs: number, lengthChanged: boolean) => lengthChanged || nowMs - endMs < LIVE_END_MS;

// Putting rest away stores a moment, not a set id: every set up to it stays away, so an Undo (back to an older set)
// or a reload never brings an old rest screen back. ISO strings compare in time order.
export const isAway = (setCreatedAt: string, awayAt: string | null | undefined) => awayAt != null && setCreatedAt <= awayAt;
