import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { workoutsTag } from "@/lib/stats";
import { exerciseName, KG_PER_LB } from "@/lib/lift";
import { buildTemplates, TEMPLATE_UNLOCK_SESSIONS, type ProgramTemplate } from "@/lib/templates";
import { bestsFrom, type Bests } from "@/lib/prs";

export type LastSet = { reps: number; weight: number; unit: string };
export type ExerciseHistory = {
  last: Record<string, LastSet[]>; // sets from the most recent session of each exercise
  bests: Record<string, Bests>; // all-time heaviest + rep frontier per exercise (PR kinds, DD-048)
  mine: { id: string; name: string }[]; // every exercise the lifter has logged, most recent first, by their saved name
};

// slug → the lifter's saved name (P1-05). Pages hand it to exerciseName().
async function loadNames(userId: string): Promise<Record<string, string>> {
  // Names only dress up slugs: if the table is missing (deploy before `migrate deploy`), pages still render with spelled-out slugs.
  const rows = await prisma.exercise.findMany({ where: { userId }, select: { id: true, name: true } }).catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export const getExerciseNames = (userId: string) =>
  unstable_cache(() => loadNames(userId), ["names", userId], { tags: [workoutsTag(userId)], revalidate: 3600 })();

// Bests per exercise (heaviest + rep frontier, DD-048), optionally only from workouts that started before `before`.
// One row per exercise and weight (in kg) with the most reps done at it; the frontier is built in JS.
export async function bestsByExercise(userId: string, before?: Date): Promise<Record<string, Bests>> {
  const rows = await prisma.$queryRaw<{ exerciseId: string; kg: number; reps: number }[]>`
    SELECT ei."exerciseId",
           CASE WHEN s.unit = 'lb' THEN s.weight * ${KG_PER_LB} ELSE s.weight END AS kg,
           MAX(s.reps) AS reps
    FROM "SetEntry" s
    JOIN "ExerciseInstance" ei ON ei.id = s."exerciseInstanceId"
    JOIN "Workout" w ON w.id = ei."workoutId"
    WHERE w."userId" = ${userId} ${before ? Prisma.sql`AND w."startedAt" < ${before}` : Prisma.empty}
    GROUP BY 1, 2`;
  const byExercise = new Map<string, { kg: number; reps: number }[]>();
  for (const r of rows) (byExercise.get(r.exerciseId) ?? byExercise.set(r.exerciseId, []).get(r.exerciseId)!).push({ kg: Number(r.kg), reps: Number(r.reps) });
  return Object.fromEntries([...byExercise].map(([id, list]) => [id, bestsFrom(list)]));
}

async function load(userId: string): Promise<ExerciseHistory> {
  const [recent, bests, names] = await Promise.all([
    // shortcut: only the last 150 exercise entries are scanned for "last session"; older-only exercises show no LAST line.
    prisma.exerciseInstance.findMany({
      where: { workout: { userId } },
      orderBy: [{ workout: { startedAt: "desc" } }, { order: "desc" }], // newest session, last exercise first
      take: 150,
      relationLoadStrategy: "join",
      select: { exerciseId: true, sets: { orderBy: { createdAt: "asc" }, select: { reps: true, weight: true, unit: true } } },
    }),
    bestsByExercise(userId),
    loadNames(userId),
  ]);

  const last: ExerciseHistory["last"] = {};
  for (const ex of recent) if (!last[ex.exerciseId] && ex.sets.length) last[ex.exerciseId] = ex.sets;
  // Recent first (the order of `last`), then the rest of the lifter's exercises.
  const mine = [...new Set([...Object.keys(last), ...Object.keys(bests)])].map((id) => ({
    id,
    name: names[id] ?? exerciseName(id),
  }));
  return { last, bests, mine };
}

export const getExerciseHistory = (userId: string) =>
  unstable_cache(() => load(userId), ["history", userId], { tags: [workoutsTag(userId)], revalidate: 3600 })();

export type TemplateProgress = { sessions: number; templates: ProgramTemplate[] };

async function loadTemplates(userId: string): Promise<TemplateProgress> {
  const [sessions, recent, names] = await Promise.all([
    prisma.workout.count({ where: { userId } }),
    // shortcut: routines are looked for in the last 60 sessions only.
    prisma.workout.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 60,
      relationLoadStrategy: "join",
      select: { exercises: { orderBy: { order: "asc" }, select: { exerciseId: true } } },
    }),
    loadNames(userId),
  ]);
  const unlocked = sessions >= TEMPLATE_UNLOCK_SESSIONS;
  return { sessions, templates: unlocked ? buildTemplates(recent.map((w) => w.exercises.map((e) => e.exerciseId)), 4, names) : [] };
}

// Session count + earned templates (empty until unlocked). Cached per user, cleared on every save.
export const getTemplateProgress = (userId: string) =>
  unstable_cache(() => loadTemplates(userId), ["templates", userId], { tags: [workoutsTag(userId)], revalidate: 3600 })();
