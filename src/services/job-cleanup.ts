import { VariantJobDAL } from '@infra/dal';
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from './screenshot-storage';

export class JobCleanupService {
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    private readonly JOB_RETENTION_DAYS = 7; // Keep jobs for 7 days
    private screenshotStorage: ScreenshotStorageService;

    constructor(prisma: PrismaClient) {
        this.screenshotStorage = createScreenshotStorageService(prisma);
    }

    startCleanup(): void {
        if (this.cleanupInterval) {
            console.log('[JOB_CLEANUP] Cleanup already running');
            return;
        }

        console.log('[JOB_CLEANUP] Starting job cleanup service');
        
        // Run cleanup immediately
        this.runCleanup();
        
        // Schedule periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.runCleanup();
        }, this.CLEANUP_INTERVAL);
    }

    stopCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('[JOB_CLEANUP] Job cleanup service stopped');
        }
    }

    private async runCleanup(): Promise<void> {
        try {
            console.log('[JOB_CLEANUP] Running job cleanup...');
            const deletedCount = await VariantJobDAL.cleanupOldJobs(this.JOB_RETENTION_DAYS);
            console.log(`[JOB_CLEANUP] Cleaned up ${deletedCount} old variant jobs`);
            
            // Clean up expired screenshots
            console.log('[JOB_CLEANUP] Running screenshot cleanup...');
            const screenshotCount = await this.screenshotStorage.cleanupExpiredScreenshots();
            console.log(`[JOB_CLEANUP] Cleaned up ${screenshotCount} expired screenshots`);
        } catch (error) {
            console.error('[JOB_CLEANUP] Error during cleanup:', error);
        }
    }

    async cleanupNow(): Promise<number> {
        console.log('[JOB_CLEANUP] Running immediate cleanup...');
        return await VariantJobDAL.cleanupOldJobs(this.JOB_RETENTION_DAYS);
    }

    async cleanupScreenshots(): Promise<number> {
        console.log('[JOB_CLEANUP] Running screenshot cleanup...');
        return await this.screenshotStorage.cleanupExpiredScreenshots();
    }

    async getScreenshotStats(projectId: string): Promise<{
        totalScreenshots: number;
        totalSize: number;
        accessCount: number;
    }> {
        return await this.screenshotStorage.getScreenshotStats(projectId);
    }
}

export function createJobCleanupService(prisma: PrismaClient): JobCleanupService {
    return new JobCleanupService(prisma);
}
