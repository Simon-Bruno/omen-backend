// Screenshot Analytics Service - Refactored to use ScreenshotDAL
import { ScreenshotDAL } from '@infra/dal/screenshot';

export interface ScreenshotAnalyticsService {
  getProjectScreenshotStats(projectId: string): Promise<{
    totalScreenshots: number;
    totalSize: number;
    cacheHitRate: number;
    screenshotsByType: Record<string, number>;
    averageSize: number;
    lastAccessed: Date | null;
  }>;

  getGlobalScreenshotStats(): Promise<{
    totalScreenshots: number;
    totalSize: number;
    totalProjects: number;
    averageScreenshotsPerProject: number;
    cacheHitRate: number;
  }>;

  getScreenshotUsageTrends(projectId: string, days: number): Promise<{
    date: string;
    screenshots: number;
    cacheHits: number;
    cacheMisses: number;
  }[]>;

  getTopCachedUrls(projectId: string, limit: number): Promise<{
    url: string;
    pageType: string;
    accessCount: number;
    lastAccessed: Date;
    fileSize: number;
  }[]>;
}

export class ScreenshotAnalyticsServiceImpl implements ScreenshotAnalyticsService {
  async getProjectScreenshotStats(projectId: string): Promise<{
    totalScreenshots: number;
    totalSize: number;
    cacheHitRate: number;
    screenshotsByType: Record<string, number>;
    averageSize: number;
    lastAccessed: Date | null;
  }> {
    try {
      return await ScreenshotDAL.getDetailedProjectStats(projectId);
    } catch (error) {
      console.error('[SCREENSHOT_ANALYTICS] Error getting project stats:', error);
      return {
        totalScreenshots: 0,
        totalSize: 0,
        cacheHitRate: 0,
        screenshotsByType: {},
        averageSize: 0,
        lastAccessed: null
      };
    }
  }

  async getGlobalScreenshotStats(): Promise<{
    totalScreenshots: number;
    totalSize: number;
    totalProjects: number;
    averageScreenshotsPerProject: number;
    cacheHitRate: number;
  }> {
    try {
      return await ScreenshotDAL.getGlobalStats();
    } catch (error) {
      console.error('[SCREENSHOT_ANALYTICS] Error getting global stats:', error);
      return {
        totalScreenshots: 0,
        totalSize: 0,
        totalProjects: 0,
        averageScreenshotsPerProject: 0,
        cacheHitRate: 0
      };
    }
  }

  async getScreenshotUsageTrends(projectId: string, days: number): Promise<{
    date: string;
    screenshots: number;
    cacheHits: number;
    cacheMisses: number;
  }[]> {
    try {
      return await ScreenshotDAL.getUsageTrends(projectId, days);
    } catch (error) {
      console.error('[SCREENSHOT_ANALYTICS] Error getting usage trends:', error);
      return [];
    }
  }

  async getTopCachedUrls(projectId: string, limit: number): Promise<{
    url: string;
    pageType: string;
    accessCount: number;
    lastAccessed: Date;
    fileSize: number;
  }[]> {
    try {
      return await ScreenshotDAL.getTopCachedUrls(projectId, limit);
    } catch (error) {
      console.error('[SCREENSHOT_ANALYTICS] Error getting top cached URLs:', error);
      return [];
    }
  }
}

// Simplified factory function - no longer needs prisma parameter
export function createScreenshotAnalyticsService(): ScreenshotAnalyticsService {
  return new ScreenshotAnalyticsServiceImpl();
}
