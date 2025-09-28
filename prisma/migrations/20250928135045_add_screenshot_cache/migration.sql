-- CreateTable
CREATE TABLE "public"."screenshot_cache" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "viewportWidth" INTEGER NOT NULL,
    "viewportHeight" INTEGER NOT NULL,
    "fullPage" BOOLEAN NOT NULL,
    "quality" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "screenshot_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screenshot_cache_projectId_idx" ON "public"."screenshot_cache"("projectId");

-- CreateIndex
CREATE INDEX "screenshot_cache_expiresAt_idx" ON "public"."screenshot_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "screenshot_cache_pageType_idx" ON "public"."screenshot_cache"("pageType");

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_cache_projectId_url_viewportWidth_viewportHeight_key" ON "public"."screenshot_cache"("projectId", "url", "viewportWidth", "viewportHeight", "fullPage", "quality");

-- AddForeignKey
ALTER TABLE "public"."screenshot_cache" ADD CONSTRAINT "screenshot_cache_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
