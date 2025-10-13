-- AddColumn
ALTER TABLE "analytics_events" ADD COLUMN "variantKey" TEXT;

-- CreateIndex
CREATE INDEX "analytics_events_experimentId_variantKey_eventType_idx" ON "analytics_events"("experimentId", "variantKey", "eventType");

-- Backfill existing data
UPDATE "analytics_events" 
SET "variantKey" = properties->>'variantKey'
WHERE properties ? 'variantKey' AND "variantKey" IS NULL;
