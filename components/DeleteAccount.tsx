"use client";

import { useEffect, useRef, useState } from "react";
import { logOut } from "@/components/SignOutButton";
import { useWorkoutStore } from "@/state/workoutStore";

// P3-07 (DD-057): the one action that can't be undone, so it gets more than a tap-again: a quiet trigger, then a block that says
// exactly what goes, with the safe choice first and filled. Escape or Keep account backs out. Rises in once (rare), like a sign-up step.
export default function DeleteAccount({ workouts }: { workouts: number }) {
  const [state, setState] = useState<"idle" | "confirm" | "deleting" | "error">("idle");
  const keep = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const backOut = useRef(false); // focus goes back to the trigger only when the user backed out, not on first render
  const open = state !== "idle";

  useEffect(() => {
    if (state === "confirm") keep.current?.focus();
    if (state === "idle" && backOut.current) {
      backOut.current = false;
      trigger.current?.focus();
    }
  }, [state]);

  function close() {
    backOut.current = true;
    setState("idle");
  }

  async function remove() {
    setState("deleting");
    const res = await fetch("/api/account", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setState("error");
    useWorkoutStore.getState().endWorkout(); // nothing of this account stays on the phone
    await logOut("/?deleted=1");
  }

  const what =
    workouts === 0
      ? "This deletes your account"
      : `This deletes your account and your ${workouts} ${workouts === 1 ? "workout" : "workouts"}, with every set and PR,`;

  return (
    <section aria-label="Delete account" className="border-t border-[var(--divider)] pt-3">
      {!open ? (
        <button
          ref={trigger}
          type="button"
          onClick={() => setState("confirm")}
          className="press label flex min-h-[var(--tap)] items-center text-[var(--danger)]"
        >
          Delete account
        </button>
      ) : (
        <div
          role="group"
          aria-labelledby="delete-title"
          aria-describedby="delete-what"
          onKeyDown={(e) => e.key === "Escape" && state !== "deleting" && close()}
          className="step space-y-4 border border-[var(--danger)] p-4"
        >
          <h2 id="delete-title" className="label text-[var(--danger)]">
            Delete account
          </h2>
          <p id="delete-what" className="text-pretty text-base leading-snug">
            {what} on every device. It can&apos;t be undone.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button ref={keep} type="button" onClick={close} disabled={state === "deleting"} className="btn btn-primary">
              Keep account
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={state === "deleting"}
              aria-busy={state === "deleting"}
              className="btn border-[var(--danger)] text-[var(--danger)]"
            >
              {state === "deleting" ? "Deleting…" : "Delete all"}
            </button>
          </div>
          {state === "error" && (
            <p role="alert" className="border border-red-600 px-4 py-3 text-sm text-red-700">
              Could not delete. Nothing was removed. Check your connection and try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
