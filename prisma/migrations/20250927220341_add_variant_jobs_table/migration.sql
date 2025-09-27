-- CreateTable
CREATE TABLE "public"."variant_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "variant_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "variant_jobs_projectId_status_createdAt_idx" ON "public"."variant_jobs"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "variant_jobs_status_createdAt_idx" ON "public"."variant_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."variant_jobs" ADD CONSTRAINT "variant_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
