/*
  Warnings:

  - You are about to drop the `screenshot_cache` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."screenshot_cache" DROP CONSTRAINT "screenshot_cache_projectId_fkey";

-- DropTable
DROP TABLE "public"."screenshot_cache";

-- CreateTable
CREATE TABLE "public"."screenshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "viewportWidth" INTEGER NOT NULL,
    "viewportHeight" INTEGER NOT NULL,
    "fullPage" BOOLEAN NOT NULL,
    "quality" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screenshots_projectId_idx" ON "public"."screenshots"("projectId");

-- CreateIndex
CREATE INDEX "screenshots_expiresAt_idx" ON "public"."screenshots"("expiresAt");

-- CreateIndex
CREATE INDEX "screenshots_pageType_idx" ON "public"."screenshots"("pageType");

-- CreateIndex
CREATE UNIQUE INDEX "screenshots_projectId_pageType_viewportWidth_viewportHeight_key" ON "public"."screenshots"("projectId", "pageType", "viewportWidth", "viewportHeight", "fullPage", "quality");

-- AddForeignKey
ALTER TABLE "public"."screenshots" ADD CONSTRAINT "screenshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
