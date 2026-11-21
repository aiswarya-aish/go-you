import { prisma } from "@/lib/prisma";
import { CODE_TRIES, CODE_TTL_MS, hashCode } from "@/lib/account";

export type CodeCheck = "ok" | "wrong" | "expired";
export const CODE_ERRORS = {
  wrong: "That code is not right. Check the email and try again.",
  expired: "That code has expired or was tried too often. Send a new one.",
} as const;

// Checks a typed code against the live one: 5 wrong tries, then the code is dead. Each check first takes a try slot in one atomic
// statement, so guesses sent all at once cannot all be compared before any is counted. A right code hands its slot back.
export async function checkCode(emailHash: string, code: string): Promise<CodeCheck> {
  const [slot] = await prisma.$queryRaw<{ codeHash: string }[]>`
    UPDATE "EmailCode" SET "attempts" = "attempts" + 1
    WHERE "emailHash" = ${emailHash} AND "attempts" < ${CODE_TRIES} AND "expiresAt" > ${new Date()}
    RETURNING "codeHash"`;
  if (!slot) return "expired";
  if (!/^\d{6}$/.test(code) || slot.codeHash !== hashCode(emailHash, code)) return "wrong";
  await prisma.emailCode.updateMany({ where: { emailHash }, data: { attempts: { decrement: 1 } } });
  return "ok";
}

export const codeRow = (emailHash: string, code: string) => {
  const now = Date.now();
  return { emailHash, codeHash: hashCode(emailHash, code), attempts: 0, createdAt: new Date(now), expiresAt: new Date(now + CODE_TTL_MS) };
};
