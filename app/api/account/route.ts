export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workoutsTag } from "@/lib/stats";

// DELETE: P3-07, the account and everything in it, in one transaction (no cascades in the schema, so children go first).
// A second call (lost response, retry) finds nothing and is a 204 too. Rate-limit rows keyed by the email hash are left to expire
// (15 min to 1 h): they hold no data, and dropping them would let delete-and-sign-up reset the limits.
export async function DELETE() {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workout = { userId };
  await prisma.$transaction([
    prisma.setEntry.deleteMany({ where: { exerciseInstance: { workout } } }),
    prisma.exerciseInstance.deleteMany({ where: { workout } }),
    prisma.workout.deleteMany({ where: workout }),
    prisma.exercise.deleteMany({ where: { userId } }),
    prisma.workoutDraft.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
  revalidateTag(workoutsTag(userId), { expire: 0 });
  return new NextResponse(null, { status: 204 });
}
