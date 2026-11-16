import { prisma } from "@/lib/prisma";

// One atomic statement per hit (no read-then-write race between server instances): a fixed window per key.
// Returns how long to wait when the key is over its limit, else 0. The time is passed in, never SQL now(): the column has no
// time zone, so now() would be read in the database session's zone and every window would look expired (seen locally).
export async function hit(key: string, limit: number, windowMs: number): Promise<number> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const [row] = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  return row.count > limit ? Math.max(1, row.resetAt.getTime() - Date.now()) : 0;
}

// Without counting: is any of these keys already at its limit? (Sign-in counts only failures, so it checks first.)
export async function atLimit(limits: Record<string, number>): Promise<boolean> {
  const rows = await prisma.rateLimit.findMany({ where: { key: { in: Object.keys(limits) }, resetAt: { gt: new Date() } } });
  return rows.some((r) => r.count >= limits[r.key]);
}

// "Wait 14 minutes", for messages.
export const waitText = (ms: number) => {
  const min = Math.ceil(ms / 60_000);
  return ms < 60_000 ? `${Math.ceil(ms / 1000)} seconds` : `${min} ${min === 1 ? "minute" : "minutes"}`;
};
