-- CreateEnum
CREATE TYPE "public"."ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "public"."DiagnosticsStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'AGENT', 'TOOL', 'SYSTEM');

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."experiments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "dsl" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."diagnostics_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."DiagnosticsStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "pages" JSONB,

    CONSTRAINT "diagnostics_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "public"."SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_shopDomain_key" ON "public"."projects"("shopDomain");

-- CreateIndex
CREATE INDEX "experiments_projectId_status_createdAt_idx" ON "public"."experiments"("projectId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."experiments" ADD CONSTRAINT "experiments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."diagnostics_runs" ADD CONSTRAINT "diagnostics_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_sessions" ADD CONSTRAINT "chat_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
