/*
  Warnings:

  - You are about to drop the column `experimentId` on the `analytics_events` table. All the data in the column will be lost.
  - You are about to drop the column `variantKey` on the `analytics_events` table. All the data in the column will be lost.
  - You are about to drop the column `viewId` on the `analytics_events` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."analytics_events" DROP CONSTRAINT "analytics_events_experimentId_fkey";

-- DropIndex
DROP INDEX "public"."analytics_events_experimentId_idx";

-- DropIndex
DROP INDEX "public"."analytics_events_experimentId_variantKey_eventType_idx";

-- AlterTable
ALTER TABLE "public"."analytics_events" DROP COLUMN "experimentId",
DROP COLUMN "variantKey",
DROP COLUMN "viewId",
ADD COLUMN     "assignedVariants" JSONB,
ADD COLUMN     "url" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "analytics_events_url_idx" ON "public"."analytics_events"("url");

-- CreateIndex
CREATE INDEX "analytics_events_userAgent_idx" ON "public"."analytics_events"("userAgent");

-- CreateIndex
CREATE INDEX "analytics_events_assignedVariants_idx" ON "public"."analytics_events" USING GIN ("assignedVariants");
