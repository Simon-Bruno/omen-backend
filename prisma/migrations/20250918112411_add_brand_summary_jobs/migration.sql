-- CreateEnum
CREATE TYPE "public"."BrandSummaryJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."brand_summary_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."BrandSummaryJobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "brand_summary_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_summary_jobs_projectId_status_createdAt_idx" ON "public"."brand_summary_jobs"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "brand_summary_jobs_status_createdAt_idx" ON "public"."brand_summary_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."brand_summary_jobs" ADD CONSTRAINT "brand_summary_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
