/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `projects` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."projects" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0Id_key" ON "public"."users"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "public"."chat_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_sessions_projectId_status_createdAt_idx" ON "public"."chat_sessions"("projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "diagnostics_runs_projectId_status_startedAt_idx" ON "public"."diagnostics_runs"("projectId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "diagnostics_runs_status_startedAt_idx" ON "public"."diagnostics_runs"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "projects_userId_key" ON "public"."projects"("userId");

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
