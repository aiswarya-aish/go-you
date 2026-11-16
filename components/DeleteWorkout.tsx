"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// P2-04: one quiet CTA at the foot of a saved workout. The first tap arms it, the second deletes (no dialog), like discarding
// a live workout; left alone it disarms after 3 s. Errors keep the workout and say so.
export default function DeleteWorkout({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "armed" | "deleting" | "error">("idle");
  useEffect(() => {
    if (state !== "armed") return;
    const t = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(t);
  }, [state]);

  async function onTap() {
    if (state !== "armed") return setState("armed");
    setState("deleting");
    const res = await fetch(`/api/workouts?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setState("error");
    router.replace("/app/log"); // replace: Back must not land on a workout that no longer exists
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onTap}
        disabled={state === "deleting"}
        aria-busy={state === "deleting"}
        className="press label flex min-h-[var(--tap)] w-full items-center justify-center text-[var(--danger)] disabled:text-[var(--muted)]"
      >
        {state === "armed" ? "Tap again to delete this workout" : state === "deleting" ? "Deleting…" : "Delete workout"}
      </button>
      {state === "error" && (
        <p role="alert" className="border border-red-600 px-4 py-3 text-sm text-red-700">
          Could not delete. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
