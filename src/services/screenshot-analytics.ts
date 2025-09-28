// Screenshot Analytics Service
import { PrismaClient } from '@prisma/client';

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
  constructor(private prisma: PrismaClient) {}

  async getProjectScreenshotStats(projectId: string): Promise<{
    totalScreenshots: number;
    totalSize: number;
    cacheHitRate: number;
    screenshotsByType: Record<string, number>;
    averageSize: number;
    lastAccessed: Date | null;
  }> {
    try {
      const stats = await this.prisma.screenshot.aggregate({
        where: { projectId },
        _count: { id: true },
        _sum: { fileSize: true, accessCount: true },
        _max: { accessedAt: true }
      });

      const screenshotsByType = await this.prisma.screenshot.groupBy({
        by: ['pageType'],
        where: { projectId },
        _count: { id: true }
      });

      const totalScreenshots = stats._count.id || 0;
      const totalSize = stats._sum.fileSize || 0;
      const totalAccesses = stats._sum.accessCount || 0;

      return {
        totalScreenshots,
        totalSize,
        cacheHitRate: totalAccesses,
        screenshotsByType: screenshotsByType.reduce((acc, item) => {
          acc[item.pageType] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        averageSize: totalScreenshots > 0 ? totalSize / totalScreenshots : 0,
        lastAccessed: stats._max.accessedAt
      };
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
      const stats = await this.prisma.screenshot.aggregate({
        _count: { id: true },
        _sum: { fileSize: true, accessCount: true }
      });

      const projectCount = await this.prisma.screenshot.groupBy({
        by: ['projectId'],
        _count: { id: true }
      });

      const totalScreenshots = stats._count.id || 0;
      const totalSize = stats._sum.fileSize || 0;
      const totalProjects = projectCount.length;
      const totalAccesses = stats._sum.accessCount || 0;

      return {
        totalScreenshots,
        totalSize,
        totalProjects,
        averageScreenshotsPerProject: totalProjects > 0 ? totalScreenshots / totalProjects : 0,
        cacheHitRate: totalAccesses
      };
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
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const trends = await this.prisma.screenshot.groupBy({
        by: ['createdAt'],
        where: {
          projectId,
          createdAt: { gte: startDate }
        },
        _count: { id: true },
        _sum: { accessCount: true }
      });

      // Group by date and calculate trends
      const trendsByDate = new Map<string, { screenshots: number; cacheHits: number }>();
      
      for (const trend of trends) {
        const date = trend.createdAt.toISOString().split('T')[0];
        const existing = trendsByDate.get(date) || { screenshots: 0, cacheHits: 0 };
        trendsByDate.set(date, {
          screenshots: existing.screenshots + trend._count.id,
          cacheHits: existing.cacheHits + (trend._sum.accessCount || 0)
        });
      }

      // Fill in missing dates with zeros
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const trend = trendsByDate.get(dateStr) || { screenshots: 0, cacheHits: 0 };
        
        result.push({
          date: dateStr,
          screenshots: trend.screenshots,
          cacheHits: trend.cacheHits,
          cacheMisses: Math.max(0, trend.screenshots - trend.cacheHits)
        });
      }

      return result;
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
      const topUrls = await this.prisma.screenshot.findMany({
        where: { projectId },
        orderBy: { accessCount: 'desc' },
        take: limit,
        select: {
          url: true,
          pageType: true,
          accessCount: true,
          accessedAt: true,
          fileSize: true
        }
      });

      return topUrls.map(item => ({
        url: item.url,
        pageType: item.pageType,
        accessCount: item.accessCount,
        lastAccessed: item.accessedAt,
        fileSize: item.fileSize
      }));
    } catch (error) {
      console.error('[SCREENSHOT_ANALYTICS] Error getting top cached URLs:', error);
      return [];
    }
  }
}

// Factory function
export function createScreenshotAnalyticsService(prisma: PrismaClient): ScreenshotAnalyticsService {
  return new ScreenshotAnalyticsServiceImpl(prisma);
}
