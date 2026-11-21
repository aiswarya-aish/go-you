export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateDraft, type DraftBody } from "@/lib/validate-workout";

const MAX_BYTES = 300_000; // a 50-exercise, 1000-set workout is well under this

// PUT: keep the server's copy of the workout in progress (P1-01, DD-045). Last write wins.
// 409 = this workout is already saved (from another device): the phone can let its copy go.
export async function PUT(req: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let body: DraftBody | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  const error = validateDraft(body, userId);
  if (error || !body) return NextResponse.json({ error: error ?? "Invalid body" }, { status: 400 });

  const workoutId = body.workout.id;
  if (await prisma.workout.count({ where: { id: workoutId, userId } })) {
    return NextResponse.json({ saved: true }, { status: 409 });
  }
  const data = body as unknown as Prisma.InputJsonValue; // the object as sent, stored whole
  await prisma.workoutDraft.upsert({
    where: { userId },
    create: { userId, workoutId, data, updatedAt: new Date() },
    update: { workoutId, data, updatedAt: new Date() },
  });
  return new NextResponse(null, { status: 204 });
}

// DELETE ?workout=<id>: drop the copy of that workout (discarded). A newer, different workout's draft is left alone.
export async function DELETE(req: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workoutId = new URL(req.url).searchParams.get("workout");
  if (!workoutId) return NextResponse.json({ error: "Missing workout" }, { status: 400 });
  await prisma.workoutDraft.deleteMany({ where: { userId, workoutId } });
  return new NextResponse(null, { status: 204 });
}
