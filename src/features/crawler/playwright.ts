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

  async takePartialScreenshot(url: string, viewport: { width: number, height: number }, fullPage: boolean, authentication?: { type: 'shopify_password'; password: string, shopDomain: string }): Promise<string> {
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

      // Handle Shopify password authentication if needed
      if (authentication?.type === 'shopify_password') {
        await this.handleShopifyPasswordAuth(page, authentication);
      }


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
      console.error(`[CRAWLER] Screenshot failed for ${url}:`, error);
      console.error(`[CRAWLER] Error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error; // Re-throw to let caller handle
    }
    finally {
      await this.close();
    }

    return '';
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
          await page.waitForLoadState('load', { timeout: 10000 }).catch(() => { });
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

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
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => { });

      // Handle Shopify password authentication if needed
      if (options.authentication?.type === 'shopify_password') {
        await this.handleShopifyPasswordAuth(page, options.authentication);
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

  /**
   * Apply variant code to a page and take a screenshot
   */
  async takeVariantScreenshot(
    url: string, 
    variant: {
      css_code: string;
      html_code: string;
      injection_method: 'selector' | 'new_element' | 'modify_existing';
      target_selector?: string;
      new_element_html?: string;
    },
    viewport: { width: number, height: number } = { width: 1920, height: 1080 },
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<string> {
    // Always initialize fresh browser for each variant to avoid state issues
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

      // Handle Shopify password authentication if needed
      if (authentication?.type === 'shopify_password') {
        await this.handleShopifyPasswordAuth(page, authentication);
      }

      await page.setExtraHTTPHeaders({
        'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
      });

      // Load lazy images
      const lazyImagesLocator = page.locator('img[loading="lazy"]:visible');
      const lazyImages = await lazyImagesLocator.all();
      for (const lazyImage of lazyImages) {
        await lazyImage.scrollIntoViewIfNeeded();
      }

      // Scroll to top
      await page.evaluate(() => window.scrollTo(0, 0));
      
      // Remove any existing overlay elements
      await page.evaluate(() => {
        const selectors = ['.needsClick', '.needsclick'];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => (el as HTMLElement).remove());
        }
      });

      // Apply variant code
      console.log(`[CRAWLER] Applying variant code for selector: ${variant.target_selector}`);
      await this.applyVariantCode(page, variant);

      // Wait a bit for any animations or dynamic content to settle
      await page.waitForTimeout(1000);
      
      // Debug: Check if element exists after applying code
      if (variant.target_selector) {
        const elementExists = await page.locator(variant.target_selector).count();
        console.log(`[CRAWLER] Element count for selector '${variant.target_selector}': ${elementExists}`);
      }

      // Take screenshot (viewport only, not full page)
      return (await page.screenshot({
        type: 'png',
        fullPage: false, // Regular browser viewport
        path: `variant-${Date.now()}.png`
      })).toString('base64');

    } catch (error) {
      console.error(`[CRAWLER] Variant screenshot failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
    }
  }

  /**
   * Apply variant code to the page
   */
  private async applyVariantCode(
    page: import('playwright').Page, 
    variant: {
      css_code: string;
      html_code: string;
      injection_method: 'selector' | 'new_element' | 'modify_existing';
      target_selector?: string;
      new_element_html?: string;
    }
  ): Promise<void> {
    try {
      // Inject CSS
      if (variant.css_code) {
        await page.addStyleTag({ content: variant.css_code });
      }

      // Apply HTML changes based on injection method
      switch (variant.injection_method) {
        case 'selector':
          if (variant.target_selector && variant.html_code) {
            await page.evaluate(({ selector, html }) => {
              const element = document.querySelector(selector);
              if (element) {
                element.innerHTML = html;
              }
            }, { selector: variant.target_selector, html: variant.html_code });
          }
          break;

        case 'new_element':
          if (variant.new_element_html) {
            await page.evaluate((html) => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              const newElement = tempDiv.firstElementChild;
              if (newElement) {
                document.body.appendChild(newElement);
              }
            }, variant.new_element_html);
          }
          break;

        case 'modify_existing':
          if (variant.target_selector && variant.html_code) {
            await page.evaluate(({ selector, html }) => {
              const element = document.querySelector(selector);
              if (element) {
                // For modify_existing, we might want to append or prepend
                element.insertAdjacentHTML('beforeend', html);
              }
            }, { selector: variant.target_selector, html: variant.html_code });
          }
          break;
      }
    } catch (error) {
      console.error(`[CRAWLER] Failed to apply variant code:`, error);
      // Don't throw - we still want to take a screenshot even if code application fails
    }
  }
}

// Factory function for easy instantiation
export function createPlaywrightCrawler(config?: CrawlerConfig): PlaywrightCrawlerService {
  return new PlaywrightCrawlerService(config);
}
