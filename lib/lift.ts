// Pure lifting maths + formatting, shared by server pages and the live logger.
import { LIBRARY } from "./exercises.ts"; // relative: also loaded by node's test runner

export type Unit = "kg" | "lb";
export const KG_PER_LB = 0.45359237;

export const toKg = (weight: number, unit: string) => (unit === "lb" ? weight * KG_PER_LB : weight);
export const fromKg = (kg: number, unit: string) => (unit === "lb" ? kg / KG_PER_LB : kg);

// Epley estimate of a one-rep max.
export const e1rmKg = (weight: number, reps: number, unit: string) => toKg(weight, unit) * (1 + reps / 30);

// One rule for logging and editing a set, matching what the server accepts (validate-workout.ts), so a save is never refused later.
export function setProblem(reps: string, weight: string): string | null {
  const r = Number(reps);
  const w = weight.trim() === "" ? NaN : Number(weight);
  if (!Number.isInteger(r) || r < 1 || r > 1000) return "Reps: a whole number from 1 to 1000.";
  if (!Number.isFinite(w) || w < 0 || w > 2000) return "Weight: 0 (bodyweight) up to 2000.";
  return null;
}

export const durationMinutes =(startMs: number, endMs: number) => Math.max(1, Math.round((endMs - startMs) / 60000));

// The lifter's saved name (P1-05), else the library's spelling ("pull_up" → "PULL-UP"), else the slug spelled out. Always caps.
export const exerciseName = (slug: string, saved?: string) =>
  (saved ?? LIBRARY.find((l) => l.id === slug)?.name ?? slug.replace(/_/g, " ")).toUpperCase();

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
export const formatNumber = (value: number) => (Math.abs(value) >= 1000 ? whole : number).format(value);

// "100 KG", or "BW" for a bodyweight set (0 load).
export const formatLoad = (weight: number, unit: string) => (weight === 0 ? "BW" : `${number.format(weight)} ${unit.toUpperCase()}`);

// Best set of a session, e.g. "3 × 8 @ 80 KG" (sets that share the top load are counted).
export function sessionSummary(sets: { reps: number; weight: number; unit: string }[]) {
  if (!sets.length) return "";
  const top = sets.reduce((a, b) => (toKg(b.weight, b.unit) > toKg(a.weight, a.unit) ? b : a));
  const same = sets.filter((s) => s.weight === top.weight && s.unit === top.unit && s.reps === top.reps).length;
  return `${same > 1 ? `${same} × ` : ""}${top.reps} @ ${formatLoad(top.weight, top.unit)}`;
}
