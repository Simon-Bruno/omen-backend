// Screenshot Data Access Layer
import { prisma } from '@infra/prisma';

// Constants for variant identification
const NON_VARIANT_ID = '__NON_VARIANT__';

export interface ScreenshotOptions {
  viewport: { width: number; height: number };
  fullPage: boolean;
  quality: number;
}

export class ScreenshotDAL {
  /**
   * Get screenshot by ID
   */
  static async getById(screenshotId: string) {
    return await prisma.screenshot.findUnique({
      where: { id: screenshotId }
    });
  }

  /**
   * Get screenshot for project and page type
   */
  static async getScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    options: ScreenshotOptions
  ) {
    return await prisma.screenshot.findFirst({
      where: {
        projectId,
        pageType,
        variantId: NON_VARIANT_ID,
        viewportWidth: options.viewport.width,
        viewportHeight: options.viewport.height,
        fullPage: options.fullPage,
        quality: options.quality,
        expiresAt: { gt: new Date() }
      }
    });
  }

  /**
   * Save or update screenshot
   */
  static async upsertScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    url: string,
    options: ScreenshotOptions,
    screenshotData: string,
    htmlContent?: string,
    markdownContent?: string,
    variantId?: string,
    maxAge: number = 24 * 60 * 60 * 1000
  ) {
    const buffer = Buffer.from(screenshotData, 'base64');
    const expiresAt = new Date(Date.now() + maxAge);

    return await prisma.screenshot.upsert({
      where: {
        projectId_pageType_variantId_viewportWidth_viewportHeight_fullPage_quality: {
          projectId,
          pageType,
          variantId: variantId ?? NON_VARIANT_ID,
          viewportWidth: options.viewport.width,
          viewportHeight: options.viewport.height,
          fullPage: options.fullPage,
          quality: options.quality
        }
      },
      create: {
        projectId,
        url,
        pageType,
        variantId: variantId ?? NON_VARIANT_ID,
        viewportWidth: options.viewport.width,
        viewportHeight: options.viewport.height,
        fullPage: options.fullPage,
        quality: options.quality,
        data: buffer,
        htmlContent: htmlContent || null,
        markdownContent: markdownContent || null,
        fileSize: buffer.length,
        expiresAt
      },
      update: {
        data: buffer,
        htmlContent: htmlContent || undefined,
        markdownContent: markdownContent || undefined,
        fileSize: buffer.length,
        expiresAt,
        accessedAt: new Date()
      }
    });
  }

  /**
   * Update screenshot access tracking
   */
  static async updateAccessTracking(screenshotId: string) {
    return await prisma.screenshot.update({
      where: { id: screenshotId },
      data: {
        accessedAt: new Date(),
        accessCount: { increment: 1 }
      }
    });
  }

  /**
   * Delete expired screenshots
   */
  static async deleteExpired() {
    const result = await prisma.screenshot.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    return result.count;
  }

  /**
   * Get screenshot statistics for a project
   */
  static async getProjectStats(projectId: string) {
    const stats = await prisma.screenshot.aggregate({
      where: { projectId },
      _count: { id: true },
      _sum: { fileSize: true, accessCount: true }
    });

    return {
      totalScreenshots: stats._count.id || 0,
      totalSize: stats._sum.fileSize || 0,
      accessCount: stats._sum.accessCount || 0
    };
  }

  /**
   * Get detailed project screenshot stats with breakdown by type
   */
  static async getDetailedProjectStats(projectId: string) {
    const stats = await prisma.screenshot.aggregate({
      where: { projectId },
      _count: { id: true },
      _sum: { fileSize: true, accessCount: true },
      _max: { accessedAt: true }
    });

    const screenshotsByType = await prisma.screenshot.groupBy({
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
  }

  /**
   * Get global screenshot statistics
   */
  static async getGlobalStats() {
    const stats = await prisma.screenshot.aggregate({
      _count: { id: true },
      _sum: { fileSize: true, accessCount: true }
    });

    const projectCount = await prisma.screenshot.groupBy({
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
  }

  /**
   * Get screenshot usage trends over time
   */
  static async getUsageTrends(projectId: string, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await prisma.screenshot.groupBy({
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
  }

  /**
   * Get top cached URLs by access count
   */
  static async getTopCachedUrls(projectId: string, limit: number) {
    const topUrls = await prisma.screenshot.findMany({
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
  }
}
