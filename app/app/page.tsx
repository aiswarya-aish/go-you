import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExerciseHistory, getTemplateProgress } from "@/lib/history";
import { dayIn, monthStart, safeTimeZone, TZ_COOKIE, weekStart } from "@/lib/time";
import Dashboard from "@/components/Dashboard";
import type { ActiveWorkout } from "@/state/workoutStore";

export const metadata: Metadata = { title: "Train" };

export default async function DashboardPage() {
  const [session, jar] = await Promise.all([getServerSession(authOptions), cookies()]);
  const userId = session!.user.id; // app/app/layout.tsx already redirects when signed out
  const day = dayIn(safeTimeZone(jar.get(TZ_COOKIE)?.value));

  const today = day(new Date());
  const from = [weekStart(today), monthStart(today)].sort()[0];
  const [recent, history, progress, drafts] = await Promise.all([
    // Only this week's and month's start times (one day of margin for time-zone offsets), not the whole history.
    prisma.workout.findMany({
      where: { userId, startedAt: { gte: new Date(Date.parse(`${from}T00:00:00Z`) - 86400000) } },
      select: { startedAt: true },
    }),
    getExerciseHistory(userId),
    getTemplateProgress(userId),
    // An unfinished workout from the last day that was never saved (P1-01): offered to resume when this device has none.
    // Tolerates a missing table, so a deploy before `migrate deploy` still renders Train.
    prisma.$queryRaw<{ data: ActiveWorkout }[]>`
      SELECT d.data FROM "WorkoutDraft" d
      WHERE d."userId" = ${userId} AND d."updatedAt" > now() - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM "Workout" w WHERE w.id = d."workoutId")`.catch(() => []),
  ]);
  const days = recent.map((w) => day(w.startedAt)).filter((d) => d >= from);

  return (
    <Dashboard
      userId={userId}
      weeklyCount={days.filter((d) => d >= weekStart(today)).length}
      monthlyCount={days.filter((d) => d >= monthStart(today)).length}
      history={history}
      templates={progress.templates}
      draft={drafts[0]?.data ?? null}
    />
  );
}
