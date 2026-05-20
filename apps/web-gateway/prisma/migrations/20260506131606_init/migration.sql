-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'COACH', 'ATHLETE');

-- CreateEnum
CREATE TYPE "SportType" AS ENUM ('RUNNING', 'CYCLING', 'SWIMMING', 'ROWING', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PLANNED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'BANNED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "RoleName" NOT NULL DEFAULT 'ATHLETE',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_blocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainingBlockId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sportType" "SportType" NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "distanceMeters" DOUBLE PRECISION,
    "elevationGainMeters" DOUBLE PRECISION,
    "avgHeartRate" INTEGER,
    "maxHeartRate" INTEGER,
    "avgPaceSecondsPerKm" DOUBLE PRECISION,
    "avgPowerWatts" INTEGER,
    "calories" INTEGER,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heart_rate_zones" (
    "id" SERIAL NOT NULL,
    "activityId" TEXT NOT NULL,
    "zoneNumber" INTEGER NOT NULL,
    "minBpm" INTEGER NOT NULL,
    "maxBpm" INTEGER NOT NULL,
    "timeInZoneSeconds" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "heart_rate_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_laps" (
    "id" SERIAL NOT NULL,
    "activityId" TEXT NOT NULL,
    "lapNumber" INTEGER NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "avgHeartRate" INTEGER,
    "avgPaceSecondsPerKm" DOUBLE PRECISION,
    "elevationGainMeters" DOUBLE PRECISION,

    CONSTRAINT "activity_laps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "training_blocks" ADD CONSTRAINT "training_blocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_trainingBlockId_fkey" FOREIGN KEY ("trainingBlockId") REFERENCES "training_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heart_rate_zones" ADD CONSTRAINT "heart_rate_zones_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
