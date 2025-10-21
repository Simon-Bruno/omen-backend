/*
  Warnings:

  - You are about to drop the column `itemCountSelector` on the `experiment_goals` table. All the data in the column will be lost.
  - You are about to drop the column `targeting` on the `experiment_goals` table. All the data in the column will be lost.
  - The `targetUrls` column on the `experiment_goals` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."experiment_goals" DROP COLUMN "itemCountSelector",
DROP COLUMN "targeting",
ADD COLUMN     "dataLayerEvent" TEXT,
ADD COLUMN     "existsInControl" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "existsInVariant" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'primary',
DROP COLUMN "targetUrls",
ADD COLUMN     "targetUrls" JSONB;

-- CreateIndex
CREATE INDEX "experiment_goals_experimentId_role_idx" ON "public"."experiment_goals"("experimentId", "role");
