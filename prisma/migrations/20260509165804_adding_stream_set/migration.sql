-- CreateTable
CREATE TABLE "activity_stream_sets" (
    "Id" TEXT NOT NULL,
    "streams" JSONB NOT NULL,
    "activityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_stream_sets_pkey" PRIMARY KEY ("Id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_stream_sets_activityId_key" ON "activity_stream_sets"("activityId");

-- AddForeignKey
ALTER TABLE "activity_stream_sets" ADD CONSTRAINT "activity_stream_sets_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
