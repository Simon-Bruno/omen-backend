-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('DRAFT', 'PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'AGENT', 'TOOL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."InjectPosition" AS ENUM ('INNER', 'OUTER', 'BEFORE', 'AFTER');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "brandAnalysis" JSONB,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experiments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "minDays" INTEGER NOT NULL,
    "minSessionsPerVariant" INTEGER NOT NULL,
    "oec" TEXT NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."brand_summary_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "progress" INTEGER DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "public"."JobStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "brand_summary_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experiment_hypotheses" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "primaryKpi" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experiment_traffic" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "percentage" DECIMAL(5,4) NOT NULL,

    CONSTRAINT "experiment_traffic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experiment_variants" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "selector" TEXT,
    "html" TEXT NOT NULL,
    "css" TEXT,
    "position" "public"."InjectPosition" NOT NULL,

    CONSTRAINT "experiment_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0Id_key" ON "public"."users"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_shopDomain_key" ON "public"."projects"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "projects_userId_key" ON "public"."projects"("userId");

-- CreateIndex
CREATE INDEX "experiments_projectId_status_idx" ON "public"."experiments"("projectId", "status");

-- CreateIndex
CREATE INDEX "chat_messages_projectId_createdAt_idx" ON "public"."chat_messages"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "brand_summary_jobs_projectId_status_createdAt_idx" ON "public"."brand_summary_jobs"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "brand_summary_jobs_status_createdAt_idx" ON "public"."brand_summary_jobs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_hypotheses_experimentId_key" ON "public"."experiment_hypotheses"("experimentId");

-- CreateIndex
CREATE INDEX "experiment_traffic_experimentId_idx" ON "public"."experiment_traffic"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_traffic_experimentId_variantId_key" ON "public"."experiment_traffic"("experimentId", "variantId");

-- CreateIndex
CREATE INDEX "experiment_variants_experimentId_idx" ON "public"."experiment_variants"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_variants_experimentId_variantId_key" ON "public"."experiment_variants"("experimentId", "variantId");

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experiments" ADD CONSTRAINT "experiments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."brand_summary_jobs" ADD CONSTRAINT "brand_summary_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experiment_hypotheses" ADD CONSTRAINT "experiment_hypotheses_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experiment_traffic" ADD CONSTRAINT "experiment_traffic_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."experiment_variants" ADD CONSTRAINT "experiment_variants_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

