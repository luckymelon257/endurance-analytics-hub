-- CreateEnum
CREATE TYPE "BackfillMode" AS ENUM ('WINDOW_1Y', 'FULL');

-- CreateEnum
CREATE TYPE "BackfillStatus" AS ENUM ('QUEUED', 'RUNNING', 'RATE_LIMITED', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "backfill_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "BackfillMode" NOT NULL,
    "status" "BackfillStatus" NOT NULL DEFAULT 'QUEUED',
    "lastPageFetched" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "retryAfter" TIMESTAMP(3),
    "error" TEXT,
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "backfill_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backfill_jobs_userId_status_idx" ON "backfill_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "backfill_jobs_status_enqueuedAt_idx" ON "backfill_jobs"("status", "enqueuedAt");

-- CreateIndex
CREATE INDEX "activities_userId_startedAt_idx" ON "activities"("userId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "backfill_jobs" ADD CONSTRAINT "backfill_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
