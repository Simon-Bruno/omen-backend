// Screenshot Storage Service
import { PrismaClient } from '@prisma/client';

// Constants for variant identification
const NON_VARIANT_ID = '__NON_VARIANT__';

export interface ScreenshotOptions {
  viewport: { width: number; height: number };
  fullPage: boolean;
  quality: number;
}

export interface ScreenshotStorageService {
  getScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<string | null>;
  
  getScreenshotWithHtml(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<{ screenshot: string | null; html: string | null }>;
  
  saveScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    url: string,
    options: ScreenshotOptions,
    screenshotData: string,
    htmlContent?: string,
    variantId?: string
  ): Promise<string>; // Return screenshot ID
  
  cleanupExpiredScreenshots(): Promise<number>;
  
  getScreenshotStats(projectId: string): Promise<{
    totalScreenshots: number;
    totalSize: number;
    accessCount: number;
  }>;
  
  getScreenshotById(screenshotId: string): Promise<{
    data: Buffer;
    contentType: string;
  } | null>;
}

export class ScreenshotStorageServiceImpl implements ScreenshotStorageService {
  private prisma: PrismaClient;
  private maxAge: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<string | null> {
    try {
      const screenshotRecord = await this.prisma.screenshot.findFirst({
        where: {
          projectId,
          pageType,
          variantId: NON_VARIANT_ID, // Only get non-variant screenshots
          viewportWidth: options.viewport.width,
          viewportHeight: options.viewport.height,
          fullPage: options.fullPage,
          quality: options.quality,
          expiresAt: { gt: new Date() }
        }
      });

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] No screenshot found for ${pageType} page`);
        return null;
      }

      // Update access tracking
      await this.prisma.screenshot.update({
        where: { id: screenshotRecord.id },
        data: { 
          accessedAt: new Date(),
          accessCount: { increment: 1 }
        }
      });

      console.log(`[SCREENSHOT_STORAGE] Retrieved ${pageType} screenshot (${screenshotRecord.fileSize} bytes)`);
      return Buffer.from(screenshotRecord.data).toString('base64');
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error getting screenshot:', error);
      return null;
    }
  }

  async getScreenshotWithHtml(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<{ screenshot: string | null; html: string | null }> {
    try {
      const screenshotRecord = await this.prisma.screenshot.findFirst({
        where: {
          projectId,
          pageType,
          variantId: NON_VARIANT_ID, // Only get non-variant screenshots
          viewportWidth: options.viewport.width,
          viewportHeight: options.viewport.height,
          fullPage: options.fullPage,
          quality: options.quality,
          expiresAt: { gt: new Date() }
        }
      });

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] No screenshot found for ${pageType} page`);
        return { screenshot: null, html: null };
      }

      // Update access tracking
      await this.prisma.screenshot.update({
        where: { id: screenshotRecord.id },
        data: { 
          accessedAt: new Date(),
          accessCount: { increment: 1 }
        }
      });

      const htmlSize = screenshotRecord.htmlContent ? screenshotRecord.htmlContent.length : 0;
      console.log(`[SCREENSHOT_STORAGE] Retrieved ${pageType} screenshot with HTML (${screenshotRecord.fileSize} bytes, HTML: ${htmlSize} chars)`);
      return {
        screenshot: Buffer.from(screenshotRecord.data).toString('base64'),
        html: screenshotRecord.htmlContent
      };
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error getting screenshot with HTML:', error);
      return { screenshot: null, html: null };
    }
  }

  async saveScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'about' | 'other',
    url: string,
    options: ScreenshotOptions,
    screenshotData: string,
    htmlContent?: string,
    variantId?: string
  ): Promise<string> {
    try {
      const buffer = Buffer.from(screenshotData, 'base64');
      const expiresAt = new Date(Date.now() + this.maxAge);

      const result = await this.prisma.screenshot.upsert({
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
          fileSize: buffer.length,
          expiresAt
        },
        update: {
          data: buffer,
          htmlContent: htmlContent || undefined,
          fileSize: buffer.length,
          expiresAt,
          accessedAt: new Date()
        }
      });

      const htmlSize = htmlContent ? htmlContent.length : 0;
      console.log(`[SCREENSHOT_STORAGE] Saved ${pageType} screenshot (${buffer.length} bytes, HTML: ${htmlSize} chars) with ID: ${result.id}`);
      return result.id;
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error saving screenshot:', error);
      throw error;
    }
  }

  async cleanupExpiredScreenshots(): Promise<number> {
    try {
      const result = await this.prisma.screenshot.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      
      console.log(`[SCREENSHOT_CACHE] Cleaned up ${result.count} expired screenshots`);
      return result.count;
    } catch (error) {
      console.error('[SCREENSHOT_CACHE] Error cleaning up screenshots:', error);
      return 0;
    }
  }

  async getScreenshotStats(projectId: string): Promise<{
    totalScreenshots: number;
    totalSize: number;
    accessCount: number;
  }> {
    try {
      const stats = await this.prisma.screenshot.aggregate({
        where: { projectId },
        _count: { id: true },
        _sum: { fileSize: true, accessCount: true }
      });

      return {
        totalScreenshots: stats._count.id || 0,
        totalSize: stats._sum.fileSize || 0,
        accessCount: stats._sum.accessCount || 0
      };
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error getting screenshot stats:', error);
      return {
        totalScreenshots: 0,
        totalSize: 0,
        accessCount: 0
      };
    }
  }

  async getScreenshotById(screenshotId: string): Promise<{
    data: Buffer;
    contentType: string;
  } | null> {
    try {
      const screenshotRecord = await this.prisma.screenshot.findUnique({
        where: { id: screenshotId }
      });

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] Screenshot not found: ${screenshotId}`);
        return null;
      }

      // Update access tracking
      await this.prisma.screenshot.update({
        where: { id: screenshotId },
        data: { 
          accessedAt: new Date(),
          accessCount: { increment: 1 }
        }
      });

      console.log(`[SCREENSHOT_STORAGE] Retrieved screenshot ${screenshotId} (${screenshotRecord.fileSize} bytes)`);
      return {
        data: Buffer.from(screenshotRecord.data),
        contentType: 'image/png'
      };
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error getting screenshot by ID:', error);
      return null;
    }
  }
}

// Factory function
export function createScreenshotStorageService(prisma: PrismaClient): ScreenshotStorageService {
  return new ScreenshotStorageServiceImpl(prisma);
}
