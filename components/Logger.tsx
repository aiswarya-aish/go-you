"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkoutStore } from "@/state/workoutStore";
import type { ExerciseInstance, SetEntry } from "@/domain/workout";
import type { ExerciseHistory } from "@/lib/history";
import { durationMinutes, formatLoad, formatNumber, fromKg, prFlags, sessionSummary, setProblem, toKg, type Unit } from "@/lib/lift";
import { sessionReport } from "@/lib/report";
import ExercisePicker from "@/components/ExercisePicker";
import NumberField from "@/components/NumberField";
import SetRow from "@/components/SetRow";
import StatGrid from "@/components/StatGrid";
import RestTimer from "@/components/RestTimer";
import { useNow } from "@/lib/useNow";
import { useDraftSync } from "@/lib/useDraftSync";
import { formatClock } from "@/lib/time";

export type Receipt = { duration: string; sets: number; volume: string; unit: Unit; prs: { name: string; gain: string }[] };

const minutes = (startedAt: string) => `${durationMinutes(Date.parse(startedAt), Date.now())}M`;
const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

export default function Logger({
  history,
  onSaved,
  onSavedElsewhere,
}: {
  history: ExerciseHistory;
  onSaved: (receipt: Receipt) => void;
  onSavedElsewhere: () => void;
}) {
  const router = useRouter();
  const active = useWorkoutStore((s) => s.activeWorkout)!;
  const unit = useWorkoutStore((s) => s.unit);
  const { setUnit, addExercise, endWorkout, removeSet, restoreSet, removeExercise, restoreExercise, moveExercise } = useWorkoutStore.getState();

  const [finishing, setFinishing] = useState(false);
  const sheetTitle = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // One undo for anything removed (a set or a whole exercise): what it says, and how to put it back.
  const [undo, setUndo] = useState<{ key: string; label: string; restore: () => void } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [lastLogged, setLastLogged] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null); // the exercise added or moved last, so its block can flash on arrival

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDiscard]);

  // Move focus into the sheet when it opens, so keyboard and screen-reader users land in it.
  useEffect(() => {
    if (finishing) sheetTitle.current?.focus({ preventScroll: true });
  }, [finishing]);

  const flags = new Map<string, boolean>();
  for (const ex of active.exercises) {
    const sets = active.sets.filter((s) => s.exerciseInstanceId === ex.id);
    prFlags(sets, history.bestE1rmKg[ex.exerciseId]).forEach((pr, i) => flags.set(sets[i].id, pr));
  }
  const report = sessionReport(active.exercises, active.sets, history.last, history.bestE1rmKg);
  // A PR is always a gain: a sliver under 0.05 shows as the smallest step (+0.1), never "+0".
  const gain = (kg: number) => `+${formatNumber(Math.max(0.1, fromKg(kg, unit)))}`;
  const volume = `${formatNumber(Math.round(fromKg(report.volumeKg, unit)))}`;
  // Rest counts from the newest set (sets are kept in time order).
  const lastSetAt = active.sets.at(-1)?.createdAt;
  useWakeLock();
  // Saved from another device while this one still had it open: let it go, say why, and show the fresh Train.
  const synced = useDraftSync(active, () => {
    onSavedElsewhere();
    endWorkout();
    router.refresh();
  });

  // The page lands on an exercise that was just added or moved, and its header flashes once (DD-043).
  function landOn(id: string, then?: () => void) {
    setLanded(id);
    const smooth = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const land = () => document.getElementById(`exercise-${id}`)?.scrollIntoView({ block: "start", behavior: smooth });
    requestAnimationFrame(() => {
      land();
      then?.();
    });
    // shortcut: a closing phone keyboard can cancel the first scroll, so it lands again once the screen has settled (350ms); no-op if already there.
    setTimeout(land, 350);
  }

  // A pick is felt (buzz) and seen (landing + flash); screen readers hear it from the picker.
  // Only a keyboard pick moves focus to its reps; a tap leaves the keyboard closed (DD-042).
  function handleAdd(exerciseId: string, label: string, viaKeyboard: boolean) {
    const id = addExercise(exerciseId, label);
    if (!id) return;
    buzz(8);
    landOn(id, () => viaKeyboard && document.getElementById(`reps-${id}`)?.focus({ preventScroll: true }));
  }

  function handleMove(id: string, by: -1 | 1) {
    moveExercise(id, by);
    landOn(id);
  }

  function handleRemoveExercise(id: string) {
    const removed = removeExercise(id);
    if (removed) setUndo({ key: id, label: `${removed.exercise.label} removed`, restore: () => restoreExercise(removed) });
  }

  function handleLogged(entry: SetEntry, pr: boolean) {
    setLastLogged(entry.id);
    setAnnounce(`Set logged, ${entry.reps} × ${formatLoad(entry.weight, entry.unit)}${pr ? ". Personal record." : ""}`);
    buzz(pr ? [0, 30, 40, 30] : 8);
  }

  function handleRemove(id: string) {
    const removed = removeSet(id);
    if (removed) setUndo({ key: id, label: "Set removed", restore: () => restoreSet(removed) });
  }

  async function save() {
    const w = useWorkoutStore.getState().activeWorkout;
    if (!w || saving) return;
    setSaving(true);
    setSaveError(null);
    const withSets = new Set(w.sets.map((s) => s.exerciseInstanceId));
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workout: { id: w.workout.id, startedAt: w.workout.startedAt, endedAt: new Date().toISOString() },
          // Exercises without a set are not part of the workout.
          exercises: w.exercises.filter((e) => withSets.has(e.id)).map((e, order) => ({ ...e, order })),
          sets: w.sets,
        }),
      });
      if (!res.ok) {
        const reason =
          res.status === 401
            ? "You are signed out. Log in again."
            : ((await res.json().catch(() => null))?.error ?? `Server error ${res.status}.`);
        throw new Error(reason);
      }
      onSaved({
        duration: minutes(w.workout.startedAt),
        sets: w.sets.length,
        volume,
        unit,
        prs: report.prs.map((p) => ({ name: p.name, gain: `${gain(p.gainKg)} ${unit.toUpperCase()}` })),
      });
      // Only clear the workout once the server has it.
      endWorkout();
      window.scrollTo(0, 0);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof TypeError ? "No connection." : e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* Workout bar (+ rest strip once a set is logged): where am I, how long, how much, and the way out. */}
      <div className="sticky top-0 z-30 -mx-4 md:mx-0">
        <div className="flex h-[var(--tap-lg)] items-center gap-3 bg-[var(--fg)] px-4 text-[var(--bg)]">
          <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-[0.08em]">{active.title ?? "Workout"}</span>
          {/* Shown only when something is wrong: the latest sets have not reached the server yet (they are safe on the phone). */}
          <span role="status" className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
            {synced ? "" : "Offline"}
            <span className="sr-only">{synced ? "" : ". Your sets are kept on this phone and sync when you are back online."}</span>
          </span>
          <WorkoutClock startedAt={active.workout.startedAt} />
          <span className="text-xs font-semibold tabular">
            {active.sets.length} {active.sets.length === 1 ? "SET" : "SETS"}
          </span>
          <button
            type="button"
            onClick={() => setFinishing(true)}
            className="press h-10 bg-[var(--bg)] px-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]"
          >
            Finish
          </button>
        </div>
        {lastSetAt && <RestTimer lastSetAt={lastSetAt} />}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="label">Workout in progress</h1>
        <div role="group" aria-label="Weight unit" className="grid grid-cols-2 border border-[var(--control)]">
          {(["kg", "lb"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={`press h-9 w-12 text-xs font-bold uppercase ${unit === u ? "bg-[var(--fg)] text-[var(--bg)]" : ""}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {active.exercises.map((ex, i) => (
          <ExerciseBlock
            key={ex.id}
            exercise={ex}
            sets={active.sets.filter((s) => s.exerciseInstanceId === ex.id)}
            flags={flags}
            last={history.last[ex.exerciseId]}
            bestKg={history.bestE1rmKg[ex.exerciseId]}
            unit={unit}
            lastLogged={lastLogged}
            arriving={ex.id === landed}
            first={i === 0}
            lastInList={i === active.exercises.length - 1}
            onLogged={handleLogged}
            onRemove={handleRemove}
            onMove={(by) => handleMove(ex.id, by)}
            onRemoveExercise={() => handleRemoveExercise(ex.id)}
          />
        ))}
      </div>

      <section className="border-t-2 border-[var(--fg)] pt-6">
        <ExercisePicker mine={history.mine} last={history.last} onAdd={handleAdd} />
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(var(--tap-lg)+env(safe-area-inset-bottom))] z-40 bg-[var(--fg)] text-[var(--bg)] md:bottom-0 md:left-[220px]">
          <div className="flex h-[var(--tap-lg)] items-center justify-between px-4">
            <span className="min-w-0 truncate pr-3 text-xs font-semibold uppercase tracking-[0.16em]">{undo.label}</span>
            <button
              type="button"
              onClick={() => {
                undo.restore();
                setUndo(null);
              }}
              className="press h-10 bg-[var(--bg)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-[var(--fg)]"
            >
              Undo
            </button>
          </div>
          <div key={undo.key} className="drain h-px bg-[var(--bg)]" />
        </div>
      )}

      {/* Finish sheet: the receipt before saving. Stays mounted so it leaves the way it came. */}
      <div
        aria-hidden={!finishing}
        onClick={() => setFinishing(false)}
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${finishing ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        inert={!finishing}
        data-open={finishing}
        onKeyDown={(e) => e.key === "Escape" && setFinishing(false)}
        className="sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col border-t-2 border-[var(--fg)] bg-[var(--bg)] md:left-[220px]"
      >
        {/* The report scrolls; the save actions below it never leave the thumb's reach. */}
        <div className="overflow-y-auto overscroll-contain px-4 pt-5 pb-6">
          <div className="mx-auto max-w-xl space-y-6">
            <h2 id="finish-title" ref={sheetTitle} tabIndex={-1} className="display text-3xl outline-none">
              Finish workout
            </h2>
            <StatGrid
              size="text-xl"
              items={[
                ["Time", minutes(active.workout.startedAt)],
                ["Sets", String(active.sets.length)],
                [`Vol ${unit}`, volume],
                ["PRs", String(report.prs.length)],
              ]}
            />

            {report.prs.length > 0 && (
              <section aria-labelledby="finish-prs" className="space-y-2">
                <h3 id="finish-prs" className="label">
                  New bests
                </h3>
                <ul className="space-y-px">
                  {report.prs.map((p, i) => (
                    <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 bg-[var(--fg)] px-4 py-3 text-[var(--bg)]">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold uppercase tracking-[-0.01em]">{p.name}</span>
                        <span className="mt-0.5 block text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
                          {p.set.reps} @ {formatLoad(p.set.weight, p.set.unit)}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-xl font-bold leading-none tracking-[-0.02em] tabular">{gain(p.gainKg)}</span>
                        <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{unit} est. 1RM</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--muted)]">Est. 1RM: the most you could lift once, worked out from the set.</p>
              </section>
            )}

            {report.lines.length > 0 && (
              <section aria-labelledby="finish-vs" className="space-y-2">
                <h3 id="finish-vs" className="label">
                  Vs last session
                </h3>
                <ul className="border-b border-[var(--divider)]">
                  {report.lines.map((l, i) => (
                    <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-[var(--divider)] py-3">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold uppercase tracking-[-0.01em]">{l.name}</span>
                        <span className="label mt-0.5 block">Top {l.today}</span>
                      </span>
                      <span className="text-right">
                        <span
                          className={`block text-base font-bold leading-none tabular ${l.change && l.change.pct > 0 ? "" : "text-[var(--muted)]"}`}
                        >
                          {!l.change ? "New" : l.change.pct === 0 ? "Same" : `${l.change.pct > 0 ? "+" : ""}${l.change.pct}%`}
                        </span>
                        <span className="label mt-1 block">{l.change ? l.change.by : "First time"}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--divider)] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-xl space-y-3">
            {saveError && (
              <div role="alert" className="border border-[var(--danger)] px-4 py-3 text-sm text-[var(--danger)]">
                Not saved. {saveError} Your sets are kept on this device.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setFinishing(false)} className="btn btn-lg">
                Keep going
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || active.sets.length === 0}
                aria-busy={saving}
                className="btn btn-primary btn-lg"
              >
                {saving ? "Saving…" : saveError ? "Retry" : "Save workout"}
              </button>
            </div>
            {active.sets.length === 0 && <p className="text-xs text-[var(--muted)]">Log at least one set to save.</p>}

            <button
              type="button"
              onClick={() => {
                if (!confirmDiscard) return setConfirmDiscard(true);
                // The server's copy goes too, so no other device offers to resume it (best effort: offline, it ages out after a day).
                fetch(`/api/draft?workout=${active.workout.id}`, { method: "DELETE" }).catch(() => {});
                endWorkout();
                window.scrollTo(0, 0);
              }}
              className="press label w-full py-2 text-center text-[var(--danger)]"
            >
              {confirmDiscard ? "Tap again to discard all sets" : "Discard workout"}
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}

function WorkoutClock({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return (
    <time className="text-sm font-semibold tabular" aria-label="Elapsed time">
      {formatClock(now - Date.parse(startedAt))}
    </time>
  );
}

// Keep the screen on during a workout (re-acquired when the page becomes visible again; ignored where unsupported).
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let closed = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock?.request("screen").then(
        // A lock that arrives after the screen closed is released straight away, so it can't leak.
        (l) => {
          if (closed) l.release().catch(() => {});
          else lock = l;
        },
        () => {},
      );
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}

function ExerciseBlock({
  exercise,
  sets,
  flags,
  last,
  bestKg,
  unit,
  lastLogged,
  arriving,
  first,
  lastInList,
  onLogged,
  onRemove,
  onMove,
  onRemoveExercise,
}: {
  exercise: ExerciseInstance;
  sets: SetEntry[];
  flags: Map<string, boolean>;
  last?: { reps: number; weight: number; unit: string }[];
  bestKg?: number;
  unit: Unit;
  lastLogged: string | null;
  arriving: boolean;
  first: boolean;
  lastInList: boolean;
  onLogged: (entry: SetEntry, pr: boolean) => void;
  onRemove: (id: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemoveExercise: () => void;
}) {
  const addSet = useWorkoutStore((s) => s.addSet);
  const setExerciseDone = useWorkoutStore((s) => s.setExerciseDone);
  const [tools, setTools] = useState(false);
  // Pre-fill from the last set today, else from last session (converted to the current unit).
  const seed = sets.at(-1) ?? last?.[0];
  const seedWeight = seed ? Math.round(fromKg(toKg(seed.weight, seed.unit), unit) * 2) / 2 : undefined;
  const [reps, setReps] = useState(seed ? String(seed.reps) : "");
  const [weight, setWeight] = useState(seedWeight != null ? String(seedWeight) : "");
  const [error, setError] = useState<string | null>(null);

  function log(e: React.FormEvent) {
    e.preventDefault();
    const problem = setProblem(reps, weight);
    setError(problem);
    if (problem) return;
    // Focus stays where it is: a tap on Log set never opens the keyboard, Enter in a field keeps typing there.
    const entry = addSet(exercise.id, Number(reps), Number(weight), unit);
    onLogged(entry, prFlags([...sets, entry], bestKg).at(-1)!);
  }

  return (
    <article id={`exercise-${exercise.id}`} className="scroll-mt-36 space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <header className="border-t-2 border-[var(--fg)] pt-2">
        {/* Full-bleed, so the arrival flash reads like the picker row that was tapped. */}
        <div className={`-mx-4 -mb-2 grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-2 md:mx-0 md:px-0 ${arriving ? "arrive" : ""}`}>
          <div className="min-w-0 space-y-1">
            <h2 id={`ex-${exercise.id}`} className="text-xl font-bold uppercase leading-tight tracking-[-0.01em]">
              {exercise.label}
            </h2>
            <p className="label">{last ? `Last · ${sessionSummary(last)}` : "First time"}</p>
          </div>
          {/* Order and removal are rare: one quiet control, so the block stays clean while logging. */}
          <button
            type="button"
            aria-expanded={tools}
            aria-controls={`tools-${exercise.id}`}
            aria-label={`${tools ? "Done" : "Edit"} ${exercise.label}`}
            onClick={() => setTools((t) => !t)}
            className="press label -mr-2 -mt-2 min-h-[var(--tap)] px-2 text-[var(--fg)]"
          >
            {tools ? "Done" : "Edit"}
          </button>
        </div>
      </header>

      {tools && (
        <div id={`tools-${exercise.id}`} role="group" aria-label={`Edit ${exercise.label}`} className="grid grid-cols-3 gap-px border border-[var(--control)] bg-[var(--control)]">
          {(
            [
              ["Move up", () => onMove(-1), first],
              ["Move down", () => onMove(1), lastInList],
              ["Remove", onRemoveExercise, false],
            ] as const
          ).map(([label, act, off]) => (
            <button
              key={label}
              type="button"
              disabled={off}
              onClick={act}
              className={`press h-11 bg-[var(--bg)] text-xs font-bold uppercase tracking-[0.12em] disabled:text-[var(--divider)] ${
                label === "Remove" ? "text-[var(--danger)]" : ""
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {sets.length > 0 && (
        <ol className="border-b border-[var(--divider)]">
          {sets.map((s, i) => (
            <SetRow key={s.id} set={s} index={i} isPr={!!flags.get(s.id)} isNew={s.id === lastLogged} onRemove={onRemove} />
          ))}
        </ol>
      )}

      {/* Done folds the inputs away (the sets stay, still editable); one quiet row brings them back. Saves a screen of
          scrolling per finished exercise. Adding a new exercise folds the earlier ones automatically. */}
      {exercise.done ? (
        <button
          type="button"
          onClick={() => setExerciseDone(exercise.id, false)}
          aria-label={`Log another set of ${exercise.label}`}
          className="press label -mt-2 flex min-h-[var(--tap)] w-full items-center text-[var(--fg)]"
        >
          + Another set
        </button>
      ) : (
        <form onSubmit={log} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField id={`reps-${exercise.id}`} label="Reps" value={reps} onChange={setReps} step={1} min={1} large />
            <NumberField
              id={`weight-${exercise.id}`}
              label={`Weight · ${unit}`}
              value={weight}
              onChange={setWeight}
              step={unit === "kg" ? 2.5 : 5}
              decimal
              large
            />
          </div>
          <div className={`grid gap-3 ${sets.length ? "grid-cols-[1fr_auto]" : ""}`}>
            <button type="submit" className="btn btn-primary btn-lg w-full">
              Log set
            </button>
            {sets.length > 0 && (
              <button
                type="button"
                onClick={() => setExerciseDone(exercise.id, true)}
                aria-label={`Done with ${exercise.label}, hide its inputs`}
                className="btn btn-lg px-5"
              >
                Done
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
        </form>
      )}
    </article>
  );
}
