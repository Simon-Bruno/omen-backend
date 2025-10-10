-- AlterTable
ALTER TABLE "public"."experiment_goals" ADD COLUMN     "targetUrls" TEXT[],
ADD COLUMN     "targeting" JSONB;
