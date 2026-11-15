"use client";

import { useRef, useState } from "react";

export type ChartPoint = { t: number; value: number; label: string; pr: boolean };

const W = 343;
const H = 172;
const PAD = { left: 34, right: 10, top: 10, bottom: 22 };

// Three evenly spaced, clean y ticks around the data: one step (a multiple of 5 kg / 10 lb) between them.
function ticks(lo: number, hi: number, unit: string) {
  const unitStep = unit === "lb" ? 10 : 5;
  const min = Math.floor(lo / unitStep) * unitStep;
  const step = Math.max(unitStep, Math.ceil((hi - min) / 2 / unitStep) * unitStep);
  return [min, min + step, min + 2 * step];
}

// Estimated 1RM per session (P2-02, DD-049). One series, so no legend: the heading names it.
// Black 2px line; dots only where they mean something (PR sessions, the latest); hairline grid; the readout above is the
// tooltip (it never gates: the PR and session lists below carry every value). Drag/tap across, or arrow keys, to inspect.
export default function LiftChart({ points, unit, summary }: { points: ChartPoint[]; unit: string; summary: string }) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  if (!points.length) return <p className="text-sm text-[var(--muted)]">No sessions in this range.</p>;

  const vals = points.map((p) => p.value);
  const [yMin, yMid, yMax] = ticks(Math.min(...vals), Math.max(...vals), unit);
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const x = (t: number) => (t1 === t0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join("");

  const shown = Math.min(active ?? Infinity, points.length - 1); // never past the end if the points shrink under it
  const at = points[shown];
  const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en");

  // The pointer finds the nearest session by x: the reader aims at a date, never at a 2px line.
  function track(clientX: number) {
    const box = svg.current!.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => Math.abs(x(p.t) - sx) < Math.abs(x(points[best].t) - sx) && (best = i));
    setActive(best);
  }

  return (
    <figure className="space-y-2">
      {/* The readout: value first, then when; the latest session until the reader points at another. */}
      <p aria-live="polite" className="flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none tracking-[-0.02em] tabular">{fmt(at.value)}</span>
        <span className="label">
          {unit} · {at.label}
          {at.pr ? " · PR" : ""}
        </span>
      </p>
      <div
        role="group"
        tabIndex={0}
        aria-label="Chart: use the arrow keys to read each session"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setActive(Math.max(0, Math.min(points.length - 1, shown + (e.key === "ArrowRight" ? 1 : -1))));
        }}
        className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--fg)]"
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label={summary}
          onPointerDown={(e) => track(e.clientX)}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons) && track(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          {[yMin, yMid, yMax].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--divider)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-[var(--muted)] text-[9px] font-semibold tabular">
                {v}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 6} className="fill-[var(--muted)] text-[9px] font-semibold uppercase tracking-[0.12em]">
            {points[0].label}
          </text>
          {points.length > 1 && (
            <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-[var(--muted)] text-[9px] font-semibold uppercase tracking-[0.12em]">
              {points.at(-1)!.label}
            </text>
          )}
          <line x1={x(at.t)} x2={x(at.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--fg)" strokeWidth={1} opacity={active === null ? 0 : 1} />
          <path d={path} fill="none" stroke="var(--fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) =>
            p.pr || i === points.length - 1 ? (
              <circle key={i} cx={x(p.t)} cy={y(p.value)} r={4} fill="var(--fg)" stroke="var(--bg)" strokeWidth={2} />
            ) : null,
          )}
          {/* The inspected session: hollow, so it reads as "here", not as another PR. */}
          {active !== null && <circle cx={x(at.t)} cy={y(at.value)} r={5} fill="var(--bg)" stroke="var(--fg)" strokeWidth={2} />}
        </svg>
      </div>
    </figure>
  );
}
