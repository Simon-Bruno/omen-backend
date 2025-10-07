// Playwright Web Crawler Service Implementation
import { chromium, Browser, Page } from 'playwright';
import type { CrawlerService, CrawlResult, CrawlOptions, CrawlerConfig } from './types';
import { createSmartScreenshotStrategy } from '@features/variant_generation/smart-screenshot-strategy';

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
    // Only create a new browser if one doesn't exist or is disconnected
    if (this.browser && this.browser.isConnected()) {
      return; // Browser is already running and connected
    }

    // Close existing browser if it exists but is disconnected
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.warn('[CRAWLER] Error closing disconnected browser:', error);
      }
    }

    this.browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/app/.chrome-for-testing/chrome-linux64/chrome',
      headless: this.config.headless,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-setuid-sandbox',
      ],
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async takePartialScreenshot(url: string, viewport: { width: number, height: number }, fullPage: boolean, authentication?: { type: 'shopify_password'; password: string, shopDomain: string }): Promise<string> {
    await this.initialize();

    // Handle both full URLs and domain-only formats
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
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

      // Handle cookie consent banners and popups
      await this.dismissCookieBanners(page);

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
      await page.close();
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

      // Handle cookie consent banners and popups
      await this.dismissCookieBanners(page);

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
    // Initialize browser once for all pages
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const results: CrawlResult[] = [];

    for (const url of urls) {
      // Check if browser is still connected before creating new page
      if (!this.browser || !this.browser.isConnected()) {
        console.warn(`[CRAWLER] Browser disconnected, reinitializing for ${url}`);
        await this.initialize();
        if (!this.browser) {
          throw new Error('Failed to reinitialize browser');
        }
      }

      let page;
      let retries = 0;
      const maxRetries = 2;
      
      while (retries <= maxRetries) {
        try {
          page = await this.browser.newPage();
          break; // Success, exit retry loop
        } catch (error) {
          retries++;
          console.warn(`[CRAWLER] Failed to create page for ${url} (attempt ${retries}/${maxRetries + 1}):`, error);
          
          if (retries > maxRetries) {
            console.error(`[CRAWLER] Max retries exceeded for ${url}`);
            results.push({
              url,
              html: '',
              screenshot: '',
              error: `Failed to create page after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
            break; // Exit retry loop and continue to next URL
          }
          
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try to reinitialize browser
          try {
            await this.initialize();
          } catch (initError) {
            console.error(`[CRAWLER] Failed to reinitialize browser:`, initError);
          }
        }
      }
      
      if (!page) {
        continue; // Skip this URL if we couldn't create a page
      }

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

        // Handle cookie consent banners and popups
        await this.dismissCookieBanners(page);

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

        results.push({
          url,
          html,
          screenshot: screenshot.toString('base64'),
          title,
          description: description || undefined,
        });
      } catch (error) {
        console.error(`[CRAWLER] Error crawling ${url}:`, error);
        results.push({
          url,
          html: '',
          screenshot: '',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      } finally {
        await page.close();
      }
    }

    return results;
  }

  /**
   * Dismiss common cookie consent banners and popups
   */
  private async dismissCookieBanners(page: Page): Promise<void> {
    try {
      console.log('[CRAWLER] Looking for cookie consent banners...');
      
      // Common cookie banner selectors and their corresponding accept/close buttons
      const cookieBannerSelectors = [
        // Generic cookie banners
        '[id*="cookie"]',
        '[class*="cookie"]',
        '[id*="consent"]',
        '[class*="consent"]',
        '[id*="gdpr"]',
        '[class*="gdpr"]',
        '[id*="privacy"]',
        '[class*="privacy"]',
        '[id*="banner"]',
        '[class*="banner"]',
        // Specific common selectors
        '.cookie-banner',
        '.cookie-notice',
        '.cookie-consent',
        '.gdpr-banner',
        '.privacy-banner',
        '.consent-banner',
        '#cookie-banner',
        '#cookie-notice',
        '#cookie-consent',
        '#gdpr-banner',
        '#privacy-banner',
        '#consent-banner',
        // Cookiebot
        '#CybotCookiebotDialog',
        // OneTrust
        '#onetrust-consent-sdk',
        // CookieYes
        '.cky-consent-container',
        // Cookiebot alternatives
        '.cc-window',
        '.cc-banner',
        // Generic popup/overlay selectors
        '[role="dialog"][aria-label*="cookie" i]',
        '[role="dialog"][aria-label*="consent" i]',
        '[role="dialog"][aria-label*="privacy" i]',
        '[role="dialog"][aria-label*="gdpr" i]',
      ];

      const acceptButtonSelectors = [
        // Generic accept buttons
        'button[class*="accept"]',
        'button[class*="agree"]',
        'button[class*="allow"]',
        'button[class*="consent"]',
        'button[id*="accept"]',
        'button[id*="agree"]',
        'button[id*="allow"]',
        'button[id*="consent"]',
        // Specific common selectors
        'button.accept-cookies',
        'button.accept-all',
        'button.agree-cookies',
        'button.allow-cookies',
        'button.consent-accept',
        'button.cookie-accept',
        'button.gdpr-accept',
        'button.privacy-accept',
        '#accept-cookies',
        '#accept-all',
        '#agree-cookies',
        '#allow-cookies',
        '#consent-accept',
        '#cookie-accept',
        '#gdpr-accept',
        '#privacy-accept',
        // Cookiebot
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#CybotCookiebotDialogBodyButtonAccept',
        // OneTrust
        '#onetrust-accept-btn-handler',
        // CookieYes
        '.cky-btn-accept',
        // Generic close/accept buttons
        'button[aria-label*="accept" i]',
        'button[aria-label*="agree" i]',
        'button[aria-label*="allow" i]',
        'button[aria-label*="consent" i]',
        'button[aria-label*="close" i]',
        // Text-based selectors
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Agree")',
        'button:has-text("Allow")',
        'button:has-text("Allow All")',
        'button:has-text("Consent")',
        'button:has-text("I Accept")',
        'button:has-text("I Agree")',
        'button:has-text("OK")',
        'button:has-text("Got it")',
        'button:has-text("Continue")',
        'button:has-text("Close")',
        'button:has-text("Dismiss")',
        // Links that might be accept buttons
        'a[class*="accept"]',
        'a[class*="agree"]',
        'a[class*="allow"]',
        'a[class*="consent"]',
        'a:has-text("Accept")',
        'a:has-text("Accept All")',
        'a:has-text("Agree")',
        'a:has-text("Allow")',
        'a:has-text("Allow All")',
        'a:has-text("I Accept")',
        'a:has-text("I Agree")',
        'a:has-text("OK")',
        'a:has-text("Got it")',
        'a:has-text("Continue")',
      ];

      // Wait a bit for cookie banners to load
      await page.waitForTimeout(1000);

      // Look for cookie banners
      let bannerFound = false;
      for (const bannerSelector of cookieBannerSelectors) {
        try {
          const banner = page.locator(bannerSelector).first();
          const isVisible = await banner.isVisible().catch(() => false);
          
          if (isVisible) {
            console.log(`[CRAWLER] Found cookie banner with selector: ${bannerSelector}`);
            bannerFound = true;
            
            // Try to find and click accept button within this banner
            let buttonClicked = false;
            for (const buttonSelector of acceptButtonSelectors) {
              try {
                const button = banner.locator(buttonSelector).first();
                const buttonVisible = await button.isVisible().catch(() => false);
                
                if (buttonVisible) {
                  console.log(`[CRAWLER] Clicking accept button: ${buttonSelector}`);
                  await button.click();
                  buttonClicked = true;
                  break;
                }
              } catch (buttonError) {
                // Continue to next button selector
                continue;
              }
            }
            
            // If no button found within the banner, try clicking the banner itself
            if (!buttonClicked) {
              try {
                console.log(`[CRAWLER] No accept button found, trying to click banner itself`);
                await banner.click();
                buttonClicked = true;
              } catch (clickError) {
                console.log(`[CRAWLER] Could not click banner: ${clickError}`);
              }
            }
            
            if (buttonClicked) {
              // Wait for banner to disappear
              await page.waitForTimeout(500);
              console.log(`[CRAWLER] Cookie banner dismissed`);
              break;
            }
          }
        } catch (error) {
          // Continue to next banner selector
          continue;
        }
      }

      if (!bannerFound) {
        console.log('[CRAWLER] No cookie banners found');
      }

      // Additional cleanup: remove any remaining cookie-related elements
      await page.evaluate(() => {
        const cookieSelectors = [
          '[id*="cookie"]',
          '[class*="cookie"]',
          '[id*="consent"]',
          '[class*="consent"]',
          '[id*="gdpr"]',
          '[class*="gdpr"]',
          '[id*="privacy"]',
          '[class*="privacy"]',
          '[id*="banner"]',
          '[class*="banner"]',
        ];
        
        cookieSelectors.forEach(selector => {
          try {
            document.querySelectorAll(selector).forEach(el => {
              const element = el as HTMLElement;
              if (element.style.position === 'fixed' || 
                  element.style.position === 'absolute' ||
                  element.classList.contains('fixed') ||
                  element.classList.contains('absolute')) {
                element.remove();
              }
            });
          } catch (e) {
            // Ignore errors
          }
        });
      });

    } catch (error) {
      console.warn('[CRAWLER] Error dismissing cookie banners:', error);
      // Don't throw - we still want to continue with the screenshot
    }
  }
}

// Factory function for easy instantiation
export function createPlaywrightCrawler(config?: CrawlerConfig): PlaywrightCrawlerService {
  return new PlaywrightCrawlerService(config);
}

