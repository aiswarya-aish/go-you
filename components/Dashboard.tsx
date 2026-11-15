"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useWorkoutStore, type ActiveWorkout } from "@/state/workoutStore";
import { useGoals } from "@/lib/goals";
import type { ProgramTemplate } from "@/lib/templates";
import type { ExerciseHistory } from "@/lib/history";
import Logger, { type Receipt } from "@/components/Logger";
import SegmentedBar from "@/components/SegmentedBar";

export default function Dashboard({
  userId,
  weeklyCount,
  monthlyCount,
  history,
  templates,
  draft,
}: {
  userId: string;
  weeklyCount: number;
  monthlyCount: number;
  history: ExerciseHistory;
  templates: ProgramTemplate[]; // earned routines; empty until unlocked (DD-037)
  draft: ActiveWorkout | null; // an unfinished workout kept on the server (P1-01)
}) {
  const stored = useWorkoutStore((s) => s.activeWorkout);
  const endedId = useWorkoutStore((s) => s.endedId);
  const startWorkout = useWorkoutStore((s) => s.startWorkout);
  // Until the phone's own copy is loaded, an offer to resume could be wrong (this device may have the workout itself).
  const hydrated = useSyncExternalStore(
    (cb) => useWorkoutStore.persist.onFinishHydration(cb),
    () => useWorkoutStore.persist.hasHydrated(),
    () => false,
  );
  // A workout left on this device by another account is not shown.
  const activeWorkout = stored?.workout.userId === userId ? stored : null;
  const goals = useGoals();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [declined, setDeclined] = useState(false);
  const [savedElsewhere, setSavedElsewhere] = useState(false);

  if (activeWorkout) return <Logger history={history} onSaved={setReceipt} onSavedElsewhere={() => setSavedElsewhere(true)} />;

  const resumable =
    hydrated && !declined && draft?.workout.userId === userId && draft.workout.id !== endedId && draft.sets.length > 0 ? draft : null;

  function startFromTemplate(template: ProgramTemplate) {
    startWorkout(userId, template.name);
    const { addExercise } = useWorkoutStore.getState();
    template.exercises.forEach((ex) => addExercise(ex.exerciseId, ex.label));
    window.scrollTo(0, 0);
  }

  return (
    <section className="space-y-10">
      {receipt && <SavedReceipt receipt={receipt} onDismiss={() => setReceipt(null)} />}
      {/* The workout left this screen because another device saved it: one plain line, so it never just vanishes. */}
      {savedElsewhere && (
        <p role="status" className="border-l-2 border-[var(--fg)] pl-3 text-sm">
          That workout was saved on another device. It is in Log.
        </p>
      )}
      {resumable && (
        <ResumeCard
          draft={resumable}
          onResume={() => {
            useWorkoutStore.getState().resumeWorkout(resumable);
            window.scrollTo(0, 0);
          }}
          onDiscard={() => {
            setDeclined(true);
            fetch(`/api/draft?workout=${resumable.workout.id}`, { method: "DELETE" }).catch(() => {});
          }}
        />
      )}

      <header className="space-y-2">
        <p className="label">No active workout</p>
        <h1 className="display text-5xl">Train</h1>
      </header>

      <button type="button" className="btn btn-primary btn-lg w-full" onClick={() => startWorkout(userId)}>
        Start blank
      </button>

      <section aria-labelledby="goals" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="goals" className="label">
            Goals
          </h2>
          <Link href="/app/settings" className="label text-[var(--fg)] underline underline-offset-4">
            Edit
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-px border border-[var(--divider)] bg-[var(--divider)]">
          <GoalCell label="Weekly goal" count={weeklyCount} target={goals.weeklyWorkoutTarget} />
          <GoalCell label="Monthly goal" count={monthlyCount} target={goals.monthlyWorkoutTarget} />
        </div>
      </section>

      {templates.length > 0 && (
        <section aria-labelledby="routines" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="routines" className="label">
              Your routines
            </h2>
            <span className="label">From your sessions</span>
          </div>
          <ul className="border-b border-[var(--divider)]">
            {templates.map((t) => (
              <li key={t.id} className="border-t border-[var(--divider)]">
                <button
                  type="button"
                  onClick={() => startFromTemplate(t)}
                  aria-label={`Start ${t.name}`}
                  className="press grid w-full grid-cols-[1fr_auto] items-center gap-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-lg font-bold leading-tight tracking-[-0.01em]">{t.name}</span>
                    <span className="label mt-1 block">
                      {t.exercises.length} EX · Done {t.timesDone}×
                    </span>
                    <span className="mt-1 block truncate text-xs text-[var(--muted)]">{t.exercises.map((e) => e.label).join(" / ")}</span>
                  </span>
                  <span className="label text-[var(--fg)]">Start →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function GoalCell({ label, count, target }: { label: string; count: number; target: number }) {
  return (
    <div className="space-y-3 bg-[var(--bg)] p-4">
      <div className="label">{label}</div>
      <div className="text-4xl font-bold leading-none tracking-[-0.02em] tabular">
        {count}
        <span className="text-base font-semibold text-[var(--muted)]"> / {target}</span>
      </div>
      <SegmentedBar count={count} target={target} />
    </div>
  );
}

// An unfinished workout found on the server (another device, or this one after its storage was cleared). Ruled, not inverted:
// it is a question, not a result. Discard needs a second tap, like discarding a live workout.
function ResumeCard({ draft, onResume, onDiscard }: { draft: ActiveWorkout; onResume: () => void; onDiscard: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  const started = new Date(draft.workout.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const ex = draft.exercises.length;
  const sets = draft.sets.length;

  return (
    <section aria-labelledby="resume" className="space-y-4 border-2 border-[var(--fg)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="resume" className="label whitespace-nowrap text-[var(--fg)]">
          Unfinished workout
        </h2>
        <span className="label whitespace-nowrap tabular">{started}</span>
      </div>
      <p className="text-3xl font-bold leading-none tracking-[-0.02em] tabular">
        {ex} EX · {sets} {sets === 1 ? "SET" : "SETS"}
      </p>
      <p className="truncate text-sm text-[var(--muted)]">{draft.exercises.map((e) => e.label.toUpperCase()).join(" / ")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => (confirm ? onDiscard() : setConfirm(true))} className="btn btn-lg">
          {confirm ? "Tap again" : "Discard"}
        </button>
        <button type="button" onClick={onResume} className="btn btn-primary btn-lg">
          Resume
        </button>
      </div>
    </section>
  );
}

// The peak-end moment: what you just did, in one inverted block.
function SavedReceipt({ receipt, onDismiss }: { receipt: Receipt; onDismiss: () => void }) {
  return (
    <section role="status" className="space-y-4 bg-[var(--fg)] p-5 text-[var(--bg)]">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em]">Workout saved</p>
        <button type="button" onClick={onDismiss} className="press label text-[var(--bg)] underline underline-offset-4">
          Dismiss
        </button>
      </div>
      <dl className="grid grid-cols-[auto_auto_1fr] gap-x-6 gap-y-4">
        {[
          ["Time", receipt.duration],
          ["Sets", String(receipt.sets)],
          [`Volume ${receipt.unit}`, receipt.volume],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{k}</dt>
            <dd className="text-3xl font-bold leading-none tracking-[-0.02em] tabular">{v}</dd>
          </div>
        ))}
      </dl>
      {/* The peak of the session: each new best, with how far it moved the estimated max. Rises in once, in order. */}
      {receipt.prs.length > 0 && (
        <div>
          <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
            {receipt.prs.length === 1 ? "New best" : `${receipt.prs.length} new bests`}
          </p>
          <ul>
            {receipt.prs.map((p, i) => (
              <li
                key={i}
                style={{ "--i": i } as React.CSSProperties}
                className="rise flex items-baseline justify-between gap-3 border-t border-[var(--muted)] py-2"
              >
                <span className="truncate text-base font-bold uppercase tracking-[-0.01em]">{p.name}</span>
                <span className="shrink-0 text-sm font-bold tabular">
                  {p.value} <span className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{p.what}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
