"use client";

import { useRef, useState } from "react";

export type VolumeBar = { value: number; label: string; short: string; workouts: number };

// Volume per week or month on Stats (DD-058). One series, so no legend. Columns keep empty weeks as gaps; the last one is still
// running, so it is outlined, not filled. The readout above is the tooltip (the latest finished bucket until the reader picks
// another): tap or drag across, or arrow keys. Same pattern as LiftChart.
export default function VolumeChart({ bars, unit }: { bars: VolumeBar[]; unit: string }) {
  const [active, setActive] = useState(Math.max(0, bars.length - 2));
  const box = useRef<HTMLDivElement>(null);
  const shown = Math.min(active, bars.length - 1);
  const at = bars[shown];
  const max = Math.max(1, ...bars.map((b) => b.value));

  function track(clientX: number) {
    const r = box.current!.getBoundingClientRect();
    setActive(Math.max(0, Math.min(bars.length - 1, Math.floor(((clientX - r.left) / r.width) * bars.length))));
  }

  return (
    <figure>
      <p aria-live="polite" className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-[var(--muted)]">
          {at.label} · {at.workouts} {at.workouts === 1 ? "workout" : "workouts"}
        </span>
        <span className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular">
          {at.value.toLocaleString("en")}
          <span className="unit">{unit}</span>
        </span>
      </p>
      <div
        ref={box}
        role="group"
        tabIndex={0}
        aria-label="Volume chart: use the arrow keys to read each column"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive(Math.max(0, Math.min(bars.length - 1, shown + (e.key === "ArrowRight" ? 1 : -1))));
        }}
        onPointerDown={(e) => track(e.clientX)}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && track(e.clientX)}
        className="mt-3 flex h-[104px] touch-pan-y select-none items-end gap-[3px] border-b border-[var(--fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
      >
        {bars.map((b, i) => (
          <span
            key={i}
            className={`relative flex-1 ${i === bars.length - 1 ? "shadow-[inset_0_0_0_1.5px_var(--fg)]" : "bg-[var(--fg)]"}`}
            style={{ height: `${(b.value / max) * 100}%` }}
          >
            {/* The inspected column: a square under the axis, like the end mark on the lift sparklines. */}
            {i === shown && <span className="absolute -bottom-[9px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 bg-[var(--fg)]" />}
          </span>
        ))}
      </div>
      <p className="mt-3 flex justify-between text-[10px] font-semibold text-[var(--muted)] tabular">
        <span>{bars[0].short}</span>
        <span>{bars.at(-1)!.short}</span>
      </p>
    </figure>
  );
}
