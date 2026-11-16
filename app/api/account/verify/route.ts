export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { hashEmail, isEmail, normalizeEmail } from "@/lib/account";
import { checkCode, CODE_ERRORS } from "@/lib/codes";

// POST {email, code}: is the code right? The code stays live for the password step, which checks it again.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!isEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const result = await checkCode(hashEmail(email), code);
  if (result !== "ok") return NextResponse.json({ error: CODE_ERRORS[result], expired: result === "expired" }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
