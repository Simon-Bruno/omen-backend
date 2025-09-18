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

  private async handleShopifyPasswordAuth(page: import('playwright').Page, auth: { type: 'shopify_password'; password: string; shopDomain: string }): Promise<void> {
    try {
      // Check if we're on a Shopify password page by looking for the password input
      const passwordInput = await page.$('input[type="password"][id="password"][name="password"]');
      
      if (passwordInput) {
        console.log(`Detected Shopify password page for ${auth.shopDomain}, attempting to fill password`);
        
        // Fill in the password
        await passwordInput.fill(auth.password);
        
        // Find and click the submit button
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
          await submitButton.click();
          
          // Wait for navigation after form submission
          await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          
          console.log(`Successfully submitted password for ${auth.shopDomain}`);
        } else {
          console.warn(`Submit button not found for ${auth.shopDomain}`);
        }
      } else {
        console.log(`No password input found for ${auth.shopDomain}, proceeding without authentication`);
      }
    } catch (error) {
      console.error(`Error handling Shopify password authentication for ${auth.shopDomain}:`, error);
      // Don't throw the error, just log it and continue
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
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load', { timeout: 5000}).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 3000}).catch(() => {});

      // Handle Shopify password authentication if needed
      if (options.authentication?.type === 'shopify_password') {
        await this.handleShopifyPasswordAuth(page, options.authentication);
      }

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
