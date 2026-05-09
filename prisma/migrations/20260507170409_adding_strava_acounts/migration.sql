/*
  Warnings:

  - A unique constraint covering the columns `[userId,externalId]` on the table `activities` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "strava_accounts" (
    "id" BIGINT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "athleteFirstName" TEXT,
    "athleteLastName" TEXT,
    "profilePictureUrl" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_accounts_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "strava_accounts_id_key" ON "strava_accounts"("id");

-- CreateIndex
CREATE UNIQUE INDEX "activities_userId_externalId_key" ON "activities"("userId", "externalId");

-- AddForeignKey
ALTER TABLE "strava_accounts" ADD CONSTRAINT "strava_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
