-- CreateTable
CREATE TABLE "public"."analytics_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "experimentId" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'exposure',
    "sessionId" TEXT NOT NULL,
    "viewId" TEXT,
    "properties" JSONB NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_projectId_eventType_idx" ON "public"."analytics_events"("projectId", "eventType");

-- CreateIndex
CREATE INDEX "analytics_events_eventType_timestamp_idx" ON "public"."analytics_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "analytics_events_sessionId_idx" ON "public"."analytics_events"("sessionId");

-- CreateIndex
CREATE INDEX "analytics_events_experimentId_idx" ON "public"."analytics_events"("experimentId");

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."analytics_events" ADD CONSTRAINT "analytics_events_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
