export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { hashEmail, isEmail, normalizeEmail, passwordProblem, sealName } from "@/lib/account";
import { cleanName, nameProblem, pickCallSign } from "@/lib/name";
import { checkCode, CODE_ERRORS } from "@/lib/codes";

// POST {email, code, password, name?}: the last step. The code is checked again (the verify step proves nothing on its own), then the
// account is created, or its password replaced (a reset is the same flow), and the code is used up. The client signs in next.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown; password?: unknown; name?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  // P3-05: only a new account takes the name (a reset keeps the old one); none typed → a call sign.
  const name = cleanName(typeof body?.name === "string" ? body.name : "") || pickCallSign();
  const badName = nameProblem(name);
  if (badName) return NextResponse.json({ error: badName }, { status: 400 });

  const emailHash = hashEmail(email);
  const result = await checkCode(emailHash, code);
  if (result !== "ok") return NextResponse.json({ error: CODE_ERRORS[result], expired: result === "expired" }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.upsert({ where: { emailHash }, create: { id: crypto.randomUUID(), emailHash, passwordHash, name: sealName(email, name) }, update: { passwordHash } }),
    prisma.emailCode.deleteMany({ where: { emailHash } }),
    // The code just proved the email, so this email's wrong-password lock is lifted (a reset is the way out of it). The IP lock stays.
    prisma.rateLimit.deleteMany({ where: { key: `signin:email:${emailHash}` } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
