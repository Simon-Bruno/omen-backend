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
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
      });
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
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

      // Set timeout
      const timeout = options.timeout || this.config.defaultTimeout!;
      page.setDefaultTimeout(timeout);

      // Navigate to page
      await page.goto(url, { waitUntil: 'networkidle' });

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
        quality: options.screenshot?.quality ?? 80,
      });

      // Extract links and images
      const links = await page.$$eval('a[href]', anchors => 
        anchors.map(anchor => anchor.getAttribute('href')).filter(Boolean) as string[]
      );
      
      const images = await page.$$eval('img[src]', imgs => 
        imgs.map(img => img.getAttribute('src')).filter(Boolean) as string[]
      );

      // Extract metadata
      const title = await page.title();
      const description = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);

      return {
        url,
        title,
        content: await page.textContent('body') || '',
        links,
        images,
        metadata: {
          description: description || undefined,
          screenshot: screenshot.toString('base64'),
        },
        timestamp: new Date(),
        html,
      };
    } catch (error) {
      return {
        url,
        title: '',
        content: '',
        links: [],
        images: [],
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        },
        timestamp: new Date(),
        html: '',
      };
    } finally {
      await page.close();
    }
  }

  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult[]> {
    // For now, just crawl the single page
    // TODO: Implement multi-page crawling with depth and page limits
    const result = await this.crawlPage(url, options);
    return [result];
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
          title: '',
          content: '',
          links: [],
          images: [],
          metadata: {},
          timestamp: new Date(),
          html: '',
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
