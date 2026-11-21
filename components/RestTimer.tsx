"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkoutStore } from "@/state/workoutStore";
import { useNow } from "@/lib/useNow";
import { formatClock } from "@/lib/time";
import { formatLoad, type Unit } from "@/lib/lift";
import { PR_LABEL, prGain, type Pr } from "@/lib/prs";
import { REST_SCREEN_DELAY, REST_TARGETS, endedLive, isAway, restPhase, restState } from "@/lib/rest";

export type LoggedSet = { id: string; createdAt: string; name: string; number: number; reps: number; weight: number; unit: Unit; pr: Pr | null };

const clock = (ms: number) => formatClock(Math.ceil(ms / 1000) * 1000); // countdowns round up: a fresh 2:00 reads 2:00

// Rest between sets (DD-060, replaces the DD-038/047 strip). After Log set, a black full-screen rest drops out of the workout
// bar: the set just logged, a huge countdown, the four lengths, Skip. Put away, the countdown lives in the bar's title slot and
// brings the screen back. When rest runs out on screen it flips white: GO. Nothing below the bar ever moves.
// Renders the bar's title slot; the screen itself is portalled to <body> (the sticky bar's stacking context sits under the tab bar).
export default function RestTimer({ title, last, onUndo }: { title: string; last?: LoggedSet; onUndo: (id: string) => void }) {
  const target = useWorkoutStore((s) => s.restTarget);
  const setTarget = useWorkoutStore((s) => s.setRestTarget);
  const awayAt = useWorkoutStore((s) => s.restAwayAt);
  const putAway = useWorkoutStore((s) => s.putRestAway);
  const unit = useWorkoutStore((s) => s.unit);

  const lastMs = last ? Date.parse(last.createdAt) : 0;
  const now = useNow(1000, last ? lastMs + target * 1000 : 0); // ticks only while resting
  const { remainingMs, done } = restState(lastMs, now, target);

  // The screen waits a beat after Log set. A set already older than that (reload, resume) shows at once.
  const [shownId, setShownId] = useState<string | null>(null);
  useEffect(() => {
    if (!last) return;
    const wait = REST_SCREEN_DELAY - (Date.now() - Date.parse(last.createdAt));
    const t = setTimeout(() => setShownId(last.id), Math.max(0, wait));
    return () => clearTimeout(t);
  }, [last?.id, last?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const [goId, setGoId] = useState<string | null>(null);
  const away = !last || isAway(last.createdAt, awayAt);
  const phase = last ? restPhase({ done, away, shown: shownId === last.id, go: goId === last.id }) : "off";
  const open = phase === "screen" || phase === "go";

  // Rest running out in front of someone buzzes once, and with the screen up turns it into GO (worked out while rendering:
  // React's "adjust state on a change"). Only a change this screen saw, live (lib/rest endedLive): a reload that is already
  // done, or a locked phone waking long after the end, stays quiet.
  const [seen, setSeen] = useState({ id: last?.id, done, phase, target });
  const [buzzes, setBuzzes] = useState(0);
  if (seen.id !== last?.id || seen.done !== done || seen.phase !== phase || seen.target !== target) {
    if (last && seen.id === last.id && done && !seen.done && endedLive(now, lastMs + target * 1000, target !== seen.target)) {
      setBuzzes((n) => n + 1);
      if (seen.phase === "screen") setGoId(last.id);
    }
    setSeen({ id: last?.id, done, phase, target });
  }
  useEffect(() => {
    if (buzzes && document.visibilityState === "visible") navigator.vibrate?.([0, 200, 100, 200]);
  }, [buzzes]);

  function close() {
    if (last) putAway(last.createdAt);
    setGoId(null);
  }

  // GO lifts itself away after 3 s; a tap does it sooner.
  useEffect(() => {
    if (phase !== "go") return;
    const t = setTimeout(close, 3000);
    return () => clearTimeout(t);
  }, [phase, last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus moves into the screen while it is up and goes back where it was (a desktop user typing reps keeps typing).
  const panel = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      panel.current?.focus({ preventScroll: true });
    } else if (returnTo.current) {
      if (returnTo.current.isConnected) returnTo.current.focus({ preventScroll: true });
      returnTo.current = null;
    }
  }, [open]);

  // Android paints its status bar with theme-color: black while the screen is up, white again after.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta || !open) return;
    const was = meta.content;
    meta.content = phase === "go" ? "#ffffff" : "#000000";
    return () => {
      meta.content = was;
    };
  }, [open, phase]);

  // Drag up to put it away: follows the finger 1:1, resists downward, and a flick is enough (Emil: velocity > 0.11 px/ms).
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (drag.current || !e.isPrimary || (e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.dragging = "true";
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.dy = e.clientY - d.y;
    const h = e.currentTarget.offsetHeight;
    const y = d.dy < 0 ? d.dy : (d.dy * h * 0.55) / (h + 0.55 * d.dy); // rubber band past the bottom
    e.currentTarget.style.transform = `translateY(${y}px)`;
  }
  function onPointerEnd(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const el = e.currentTarget;
    delete el.dataset.dragging;
    el.style.transform = ""; // the transition runs from where the finger left it
    const velocity = -d.dy / (performance.now() - d.t);
    if (e.type === "pointerup" && (d.dy < -96 || (d.dy < -16 && velocity > 0.11))) close();
    else if (e.type === "pointerup" && phase === "go" && Math.abs(d.dy) < 10) close(); // a tap on GO
  }

  const rest = clock(remainingMs);
  const gain = last?.pr ? prGain(last.pr, unit) : null;

  return (
    <>
      {phase === "bar" ? (
        <button
          type="button"
          onClick={() => {
            if (!last) return;
            putAway(new Date(lastMs - 1).toISOString()); // older sets stay away, this one comes back
            setShownId(last.id);
          }}
          aria-label={`Rest, ${rest} left. Show the rest timer`}
          className="press -my-2 -ml-4 flex min-w-0 flex-1 items-center gap-2 self-stretch py-2 pl-4 text-left"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Rest</span>
          <span className="text-xl font-bold leading-none tracking-[-0.02em] tabular">{rest}</span>
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-[0.08em]">{title}</span>
      )}

      {last &&
        typeof document !== "undefined" &&
        createPortal(
          <section
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={phase === "go" ? "Rest done" : "Rest"}
            tabIndex={-1}
            inert={!open}
            data-open={open}
            data-go={phase === "go"}
            onKeyDown={(e) => e.key === "Escape" && close()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className="rest-screen fixed inset-0 z-50 flex touch-none select-none flex-col px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)] outline-none md:left-[220px]"
          >
            {phase === "go" ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Rest done</p>
                <div className="flex flex-1 flex-col justify-center">
                  <p className="rest-digits">Go</p>
                </div>
                <p className="label flex h-[var(--tap-lg)] items-center justify-center text-[var(--muted)]">Tap to continue</p>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">
                  <span>Rest</span>
                  <span>Set {last.number} logged</span>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold uppercase leading-tight tracking-[-0.01em]">{last.name}</p>
                    <p className="mt-0.5 text-base font-semibold tabular">
                      {last.reps} × {formatLoad(last.weight, last.unit)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onUndo(last.id);
                    }}
                    aria-label={`Undo set ${last.number}, ${last.name}`}
                    className="press -mr-2 -mt-1 h-11 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  >
                    <span className="border-b border-current pb-0.5">Undo</span>
                  </button>
                </div>
                {last.pr && gain && (
                  <p className="mt-3 self-start bg-[var(--bg)] px-2 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]">
                    {PR_LABEL[last.pr.kind]} · {gain.value} {gain.what}
                  </p>
                )}

                <div className="flex flex-1 flex-col justify-center">
                  <time role="timer" aria-label="Rest left" className="rest-digits">
                    {rest}
                  </time>
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60">of {formatClock(target * 1000)}</p>
                </div>

                <div role="group" aria-label="Rest length" className="grid grid-cols-4 gap-px border border-[var(--bg)] bg-[var(--bg)]">
                  {REST_TARGETS.map((t) => {
                    const on = t === target;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Rest ${formatClock(t * 1000)}`}
                        onClick={() => setTarget(t)}
                        className={`press h-[var(--tap-lg)] text-base font-bold tabular ${on ? "bg-[var(--bg)] text-[var(--fg)]" : "bg-[var(--fg)] text-[var(--bg)]"}`}
                      >
                        {formatClock(t * 1000)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="press mt-2 h-11 self-center px-4 text-[10px] font-semibold uppercase tracking-[0.16em]"
                >
                  <span className="border-b border-current pb-0.5">Skip rest</span>
                </button>
                {/* The edge you lift it by: the screen came down from the bar, so it goes back up. */}
                <div aria-hidden className="mx-auto mb-2 mt-1 h-[3px] w-10 bg-current opacity-30" />
              </>
            )}
            <span role="status" className="sr-only">
              {phase === "go" ? "Rest done. Go." : ""}
            </span>
          </section>,
          document.body,
        )}
    </>
  );
}
