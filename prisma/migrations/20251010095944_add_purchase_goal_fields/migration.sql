-- CreateTable
CREATE TABLE "public"."experiment_goals" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "selector" TEXT,
    "eventType" TEXT,
    "customJs" TEXT,
    "value" DOUBLE PRECISION,
    "valueSelector" TEXT,
    "itemCountSelector" TEXT,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiment_goals_experimentId_idx" ON "public"."experiment_goals"("experimentId");

-- AddForeignKey
ALTER TABLE "public"."experiment_goals" ADD CONSTRAINT "experiment_goals_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
