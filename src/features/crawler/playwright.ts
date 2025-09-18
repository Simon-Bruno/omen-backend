// Playwright Web Crawler Service Implementation
import { chromium, Browser } from 'playwright';
import type { CrawlerService, CrawlResult, CrawlOptions, CrawlerConfig } from './types';

export class PlaywrightCrawlerService implements CrawlerService {
  private browser: Browser | null = null;
  private config: CrawlerConfig;

  constructor(config: CrawlerConfig = {}) {
    this.config = {
      headless: true,
      defaultViewport: { width: 1280, height: 720 },
      defaultTimeout: 30000,
      defaultWaitFor: 2000,
      ...config
    };
  }

  async initialize(): Promise<void> {
    //if (!this.browser) {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-setuid-sandbox',
      ],
    });
    //}
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async takePartialScreenshot(url: string, viewport: { width: number, height: number }, fullPage: bool): Promise<string> {
    await this.initialize();

    if (!url.startsWith("https://")) {
      url = `https://${url}`;
    }

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      // Set viewport
      await page.setViewportSize(viewport);

      // Navigate to page
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

      await page.setExtraHTTPHeaders({
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
      });

      const lazyImagesLocator = page.locator('img[loading="lazy"]:visible');
      const lazyImages = await lazyImagesLocator.all();
      for (const lazyImage of lazyImages) {
        await lazyImage.scrollIntoViewIfNeeded();
      }

      page.evaluate((_) => window.scrollTo(0, 0), 0);
      await page.evaluate(() => {
        const selectors = ['.needsClick', '.needsclick'];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => (el as HTMLElement).remove());
        }
      });

      // Take screenshot
      return (await page.screenshot({
        type: 'png',
        fullPage: fullPage,
        path: `ss-${viewport.height}.png`
      })).toString('base64');
    }
    catch (error) {
      console.error(`Detailed brand analysis failed for project ${url}:`, error);
    }
    finally {
      await this.close();
    }

    return '';
  }

  async crawlPage(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();

    try {
      // Set viewport
      const viewport = options.viewport || this.config.defaultViewport!;
      await page.setViewportSize(viewport);

      // Set user agent if provided
      if (options.userAgent) {
        await page.setExtraHTTPHeaders({
          'User-Agent': options.userAgent
        });
      }

      const lazyImagesLocator = page.locator('img[loading="lazy"]:visible');
      const lazyImages = await lazyImagesLocator.all();
      for (const lazyImage of lazyImages) {
        await lazyImage.scrollIntoViewIfNeeded();
      }

      page.evaluate((_) => window.scrollTo(0, 0), 0);
      await page.evaluate(() => {
        const selectors = ['.needsClick', '.needsclick'];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => (el as HTMLElement).remove());
        }
      });

      // Set timeout
      const timeout = options.timeout || this.config.defaultTimeout!;
      page.setDefaultTimeout(timeout);

      // Navigate to page
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => { });
      // Wait additional time if specified
      const waitFor = options.waitFor || this.config.defaultWaitFor!;
      if (waitFor > 0) {
        await page.waitForTimeout(waitFor);
      }

      // Extract HTML content
      const html = await page.content();
      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: options.screenshot?.fullPage ?? true,
        // quality: options.screenshot?.quality ?? 80,
      });

      // Extract metadata
      const title = await page.title();
      const description = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);

      return {
        url,
        html,
        screenshot: screenshot.toString('base64'),
        title,
        description: description || undefined,
      };
    } catch (error) {
      console.error(error);
      return {
        url,
        html: '',
        screenshot: '',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    } finally {
      await page.close();
    }
  }

  async crawlMultiplePages(urls: string[], options: CrawlOptions = {}): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    for (const url of urls) {
      try {
        const result = await this.crawlPage(url, options);
        results.push(result);
      } catch (error) {
        results.push({
          url,
          html: '',
          screenshot: '',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return results;
  }
}

// Factory function for easy instantiation
export function createPlaywrightCrawler(config?: CrawlerConfig): PlaywrightCrawlerService {
  return new PlaywrightCrawlerService(config);
}
