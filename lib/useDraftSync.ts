"use client";

import { useEffect, useRef, useState } from "react";

// Mirrors the workout in progress to the server a moment after each change (P1-01, DD-045), and again when the
// connection comes back. Returns false while the latest change has not reached the server; the phone still has it.
// `onSavedElsewhere` runs when the server says this workout was already saved (from another device).
export function useDraftSync(active: object, onSavedElsewhere: () => void) {
  const [synced, setSynced] = useState(true);
  const savedElsewhere = useRef(onSavedElsewhere);
  useEffect(() => {
    savedElsewhere.current = onSavedElsewhere;
  });

  useEffect(() => {
    let stale = false; // a newer change supersedes this push's answer
    const push = async () => {
      try {
        const res = await fetch("/api/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(active) });
        if (stale) return;
        if (res.status === 409) return savedElsewhere.current();
        setSynced(res.ok);
      } catch {
        if (!stale) setSynced(false);
      }
    };
    const t = setTimeout(push, 800); // one request per burst of taps, not per tap
    window.addEventListener("online", push);
    return () => {
      stale = true;
      clearTimeout(t);
      window.removeEventListener("online", push);
    };
  }, [active]);

  return synced;
}
