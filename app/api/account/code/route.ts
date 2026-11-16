export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clientIp,
  hashEmail,
  hashIp,
  isEmail,
  newCode,
  normalizeEmail,
  RESEND_MS,
} from "@/lib/account";
import { codeRow } from "@/lib/codes";
import { hit, waitText } from "@/lib/rate-limit";
import { sendCode } from "@/lib/mail";

// POST {email}: email a 6-digit code (sign-up and password reset are one flow, DD-053). The answer never says whether an account
// exists. Limits: one code per 30 s per email, 3 per 15 min per email, 10 per hour per IP (Gmail's daily cap and strangers' inboxes).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email =
    typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  if (!isEmail(email))
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );

  const emailHash = hashEmail(email);
  const last = await prisma.emailCode.findUnique({
    where: { emailHash },
    select: { createdAt: true },
  });
  const since = last ? Date.now() - last.createdAt.getTime() : Infinity;
  const wait =
    (since < RESEND_MS ? RESEND_MS - since : 0) ||
    (await hit(`code:email:${emailHash}`, 3, 15 * 60_000)) ||
    (await hit(
      `code:ip:${hashIp(clientIp((n) => req.headers.get(n)))}`,
      10,
      60 * 60_000,
    ));
  if (wait) {
    return NextResponse.json(
      {
        error: `Too many codes. Try again in ${waitText(wait)}.`,
        retryAfter: wait,
      },
      { status: 429 },
    );
  }

  const code = newCode();
  const row = codeRow(emailHash, code);
  await prisma.emailCode.upsert({
    where: { emailHash },
    create: row,
    update: row,
  });
  try {
    await sendCode(email, code);
  } catch (e) {
    console.error("[mail]", e);
    await prisma.emailCode.deleteMany({ where: { emailHash } });
    return NextResponse.json(
      { error: "Could not send the email. Try again in a minute." },
      { status: 502 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
