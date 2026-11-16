-- P3-01 verified accounts (DD-053). Non-destructive for workouts: old accounts keep their rows but lose the readable email and can no
-- longer sign in; they are removed by the launch wipe, which runs separately with the user's OK.
ALTER TABLE "User" DROP COLUMN "email";
ALTER TABLE "User" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "User_emailHash_key" ON "User"("emailHash");

CREATE TABLE "EmailCode" (
    "emailHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("emailHash")
);

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);
