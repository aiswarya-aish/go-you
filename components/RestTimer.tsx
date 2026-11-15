"use client";

import { useEffect, useRef } from "react";
import { useWorkoutStore } from "@/state/workoutStore";
import { useNow } from "@/lib/useNow";
import { formatClock } from "@/lib/time";
import { REST_TARGETS, restState } from "@/lib/rest";

// Rest strip under the workout bar (DD-038).
// Resting: counts DOWN the rest left. Done: inverts to a static REST DONE · GO (no ticking) and buzzes once.
// The target is a visible segmented choice, not a hidden tap-to-cycle.
export default function RestTimer({ lastSetAt }: { lastSetAt: string }) {
  const target = useWorkoutStore((s) => s.restTarget);
  const setTarget = useWorkoutStore((s) => s.setRestTarget);
  const lastSetMs = Date.parse(lastSetAt);
  // Ticks only until the rest is over: the done state is static.
  const now = useNow(1000, lastSetMs + target * 1000);
  const { remainingMs, done } = restState(lastSetMs, now, target);

  // Buzz only when this screen sees rest go from running to done, and only if the user is looking.
  // Starting from the current state keeps a remount or reload that is already done silent.
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current && document.visibilityState === "visible") navigator.vibrate?.([0, 200, 100, 200]);
    wasDone.current = done;
  }, [done]);

  // A quiet white strip under the black bar (revised 2026-11-15): the only thing that inverts is what changed. When rest is over,
  // "GO" becomes a black block (plus the buzz); the targets are plain numbers with the chosen one inverted, like the kg/lb switch.
  return (
    <div className="flex h-12 items-center gap-3 border-b border-[var(--divider)] bg-[var(--bg)] px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{done ? "Rest done" : "Rest"}</span>
        {done ? (
          <span className="bg-[var(--fg)] px-1.5 text-xl font-bold uppercase leading-7 tracking-[-0.01em] text-[var(--bg)]">Go</span>
        ) : (
          <time role="timer" aria-label="Rest remaining" className="text-xl font-bold leading-7 tracking-[-0.02em] tabular">
            {formatClock(Math.ceil(remainingMs / 1000) * 1000) /* countdowns round up: a fresh 2:00 reads 2:00 */}
          </time>
        )}
      </div>
      <div role="group" aria-label="Rest target" className="-mr-2 flex">
        {REST_TARGETS.map((t) => {
          const on = t === target;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              aria-label={`Rest ${formatClock(t * 1000)}`}
              onClick={() => setTarget(t)}
              className="press flex h-11 w-11 items-center justify-center"
            >
              <span className={`px-1 text-xs font-bold leading-5 tabular ${on ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)]"}`}>
                {formatClock(t * 1000)}
              </span>
            </button>
          );
        })}
      </div>
      <span role="status" className="sr-only">
        {done ? "Rest done. Go." : ""}
      </span>
    </div>
  );
}
