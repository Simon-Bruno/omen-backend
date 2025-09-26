// Screenshot Storage Service
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ScreenshotStorageService {
  saveScreenshot(base64Data: string, variantLabel: string, experimentId?: string): Promise<string>;
  getScreenshotUrl(filename: string): string;
  deleteScreenshot(filename: string): Promise<void>;
}

export class ScreenshotStorageServiceImpl implements ScreenshotStorageService {
  private screenshotsDir: string;

  constructor() {
    this.screenshotsDir = path.join(process.cwd(), 'screenshots');
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await fs.access(this.screenshotsDir);
    } catch {
      await fs.mkdir(this.screenshotsDir, { recursive: true });
    }
  }

  async saveScreenshot(base64Data: string, variantLabel: string, experimentId?: string): Promise<string> {
    try {
      // Clean variant label for filename
      const cleanLabel = variantLabel.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
      const timestamp = Date.now();
      const uuid = randomUUID().substring(0, 8);
      
      // Create filename with optional experiment ID
      const experimentPrefix = experimentId ? `${experimentId}_` : '';
      const filename = `${experimentPrefix}${cleanLabel}_${timestamp}_${uuid}.png`;
      const filePath = path.join(this.screenshotsDir, filename);

      // Convert base64 to buffer and save
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.writeFile(filePath, buffer);

      console.log(`[SCREENSHOT_STORAGE] Saved screenshot: ${filename}`);
      return filename;
    } catch (error) {
      console.error(`[SCREENSHOT_STORAGE] Failed to save screenshot:`, error);
      throw new Error(`Failed to save screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getScreenshotUrl(filename: string): string {
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return `${baseUrl}/api/screenshots/${filename}`;
  }

  async deleteScreenshot(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.screenshotsDir, filename);
      await fs.unlink(filePath);
      console.log(`[SCREENSHOT_STORAGE] Deleted screenshot: ${filename}`);
    } catch (error) {
      console.error(`[SCREENSHOT_STORAGE] Failed to delete screenshot ${filename}:`, error);
      // Don't throw - file might not exist
    }
  }

  async getScreenshotPath(filename: string): Promise<string> {
    const filePath = path.join(this.screenshotsDir, filename);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new Error(`Screenshot not found: ${filename}`);
    }
  }
}

// Factory function
export function createScreenshotStorageService(): ScreenshotStorageService {
  return new ScreenshotStorageServiceImpl();
}
