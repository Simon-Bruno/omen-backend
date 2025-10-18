// Screenshot Storage Service - Refactored to use ScreenshotDAL
import { ScreenshotDAL, type ScreenshotOptions } from '@infra/dal/screenshot';

export type { ScreenshotOptions } from '@infra/dal/screenshot';

export interface ScreenshotStorageService {
  getScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<string | null>;

  getScreenshotWithHtml(
    projectId: string,
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<{ screenshot: string | null; html: string | null }>;

  saveScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    url: string,
    options: ScreenshotOptions,
    screenshotData: string,
    htmlContent?: string,
    markdownContent?: string,
    variantId?: string
  ): Promise<string>;

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
  async getScreenshot(
    projectId: string,
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<string | null> {
    try {
      const screenshotRecord = await ScreenshotDAL.getScreenshot(projectId, pageType, options);

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] No screenshot found for ${pageType} page`);
        return null;
      }

      // Update access tracking
      await ScreenshotDAL.updateAccessTracking(screenshotRecord.id);

      console.log(`[SCREENSHOT_STORAGE] Retrieved ${pageType} screenshot (${screenshotRecord.fileSize} bytes)`);
      return Buffer.from(screenshotRecord.data).toString('base64');
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error getting screenshot:', error);
      return null;
    }
  }

  async getScreenshotWithHtml(
    projectId: string,
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    options: ScreenshotOptions
  ): Promise<{ screenshot: string | null; html: string | null }> {
    try {
      const screenshotRecord = await ScreenshotDAL.getScreenshot(projectId, pageType, options);

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] No screenshot found for ${pageType} page`);
        return { screenshot: null, html: null };
      }

      // Update access tracking
      await ScreenshotDAL.updateAccessTracking(screenshotRecord.id);

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
    pageType: 'home' | 'pdp' | 'collection' | 'about' | 'other',
    url: string,
    options: ScreenshotOptions,
    screenshotData: string,
    htmlContent?: string,
    markdownContent?: string,
    variantId?: string
  ): Promise<string> {
    try {
      const result = await ScreenshotDAL.upsertScreenshot(
        projectId,
        pageType,
        url,
        options,
        screenshotData,
        htmlContent,
        markdownContent,
        variantId
      );

      const buffer = Buffer.from(screenshotData, 'base64');
      const htmlSize = htmlContent ? htmlContent.length : 0;
      const markdownSize = markdownContent ? markdownContent.length : 0;
      console.log(`[SCREENSHOT_STORAGE] Saved ${pageType} screenshot (${buffer.length} bytes, HTML: ${htmlSize} chars, Markdown: ${markdownSize} chars) with ID: ${result.id}`);
      return result.id;
    } catch (error) {
      console.error('[SCREENSHOT_STORAGE] Error saving screenshot:', error);
      throw error;
    }
  }

  async cleanupExpiredScreenshots(): Promise<number> {
    try {
      const count = await ScreenshotDAL.deleteExpired();
      console.log(`[SCREENSHOT_CACHE] Cleaned up ${count} expired screenshots`);
      return count;
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
      return await ScreenshotDAL.getProjectStats(projectId);
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
      const screenshotRecord = await ScreenshotDAL.getById(screenshotId);

      if (!screenshotRecord || !screenshotRecord.data) {
        console.log(`[SCREENSHOT_STORAGE] Screenshot not found: ${screenshotId}`);
        return null;
      }

      // Update access tracking
      await ScreenshotDAL.updateAccessTracking(screenshotId);

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

// Simplified factory function - no longer needs prisma parameter
export function createScreenshotStorageService(): ScreenshotStorageService {
  return new ScreenshotStorageServiceImpl();
}
