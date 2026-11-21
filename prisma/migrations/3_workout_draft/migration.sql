-- CreateTable
CREATE TABLE "WorkoutDraft" (
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutDraft_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "WorkoutDraft" ADD CONSTRAINT "WorkoutDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
