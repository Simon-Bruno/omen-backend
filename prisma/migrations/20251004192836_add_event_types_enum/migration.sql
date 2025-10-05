/*
  Warnings:

  - The `eventType` column on the `analytics_events` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('EXPOSURE', 'PAGEVIEW', 'CONVERSION', 'CUSTOM');

-- AlterTable
ALTER TABLE "public"."analytics_events" DROP COLUMN "eventType",
ADD COLUMN     "eventType" "public"."EventType" NOT NULL DEFAULT 'EXPOSURE';

-- CreateIndex
CREATE INDEX "analytics_events_projectId_eventType_idx" ON "public"."analytics_events"("projectId", "eventType");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_timestamp_idx" ON "public"."analytics_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_eventType_idx" ON "public"."analytics_events"("sessionId", "eventType");
