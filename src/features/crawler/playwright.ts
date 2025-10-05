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
    // Create a completely isolated browser instance for this variant
    const isolatedBrowser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || '/app/.chrome-for-testing/chrome-linux64/chrome',
      headless: this.config.headless,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    // Handle both full URLs and domain-only formats
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }

    const page = await isolatedBrowser.newPage();

    try {
      // Set viewport
      await page.setViewportSize(viewport);

      // Navigate to page (refresh to ensure clean state)
      console.log(`[CRAWLER] Navigating to ${url} for variant: ${variant.target_selector || 'new_element'}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => { });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });

      // Handle Shopify password authentication if needed
      if (authentication?.type === 'shopify_password') {
        await this.handleShopifyPasswordAuth(page, authentication);
      }
      
      // Clear any previous variant code to ensure clean state
      await this.clearPreviousVariantCode(page);

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

      // Handle cookie consent banners and popups
      await this.dismissCookieBanners(page);

      // Apply variant code
      console.log(`[CRAWLER] Applying variant code for selector: ${variant.target_selector}`);
      console.log(`[CRAWLER] Variant details:`, {
        css_code: variant.css_code,
        html_code: variant.html_code,
        injection_method: variant.injection_method,
        target_selector: variant.target_selector,
        new_element_html: variant.new_element_html
      });
      await this.applyVariantCode(page, variant);

      // Wait a bit for any animations or dynamic content to settle
      await page.waitForTimeout(1000);
      
      // Simulate hover states only if the variant code includes hover CSS
      if (this.hasHoverStates(variant.css_code)) {
        await this.simulateHoverStates(page, variant.css_code);
      }
      
      // Smart screenshot strategy: Determine the best area to screenshot
      const html = await page.content();
      const screenshotStrategy = createSmartScreenshotStrategy(html, 'variant screenshot');
      const strategies = await screenshotStrategy.determineScreenshotStrategy(variant.target_selector);
      
      console.log(`[CRAWLER] Screenshot strategies:`, strategies.map(s => ({ type: s.type, confidence: s.confidence, description: s.description })));
      
      // Try each strategy until one works
      let screenshotTaken = false;
      for (const strategy of strategies) {
        try {
          console.log(`[CRAWLER] Trying strategy: ${strategy.type} (${strategy.confidence} confidence)`);
          
          switch (strategy.type) {
            case 'element':
              if (strategy.selector) {
                await this.scrollToElement(page, strategy.selector);
                screenshotTaken = true;
              }
              break;
              
            case 'section':
              if (strategy.selector) {
                await this.scrollToElement(page, strategy.selector);
                screenshotTaken = true;
              }
              break;
              
            case 'viewport':
              // Already at viewport, no scrolling needed
              screenshotTaken = true;
              break;
              
            case 'fullpage':
              // Will be handled by fullPage: true in screenshot options
              screenshotTaken = true;
              break;
          }
          
          if (screenshotTaken) {
            console.log(`[CRAWLER] Successfully applied strategy: ${strategy.type}`);
            break;
          }
        } catch (error) {
          console.warn(`[CRAWLER] Strategy ${strategy.type} failed:`, error);
          continue;
        }
      }
      
      if (!screenshotTaken) {
        console.warn(`[CRAWLER] All screenshot strategies failed, using default viewport`);
      }

      // Take screenshot based on the strategy
      let screenshot;
      const bestStrategy = strategies[0]; // Highest confidence strategy
      const useFullPage = bestStrategy?.type === 'fullpage';
      
      try {
        screenshot = await page.screenshot({
          type: 'png',
          fullPage: useFullPage,
          path: `variant-${Date.now()}-${useFullPage ? 'full' : 'partial'}.png`
        });
        console.log(`[CRAWLER] Screenshot taken for variant (${useFullPage ? 'full page' : 'viewport'}) using ${bestStrategy?.type} strategy`);
      } catch (screenshotError) {
        console.warn(`[CRAWLER] Screenshot failed:`, screenshotError);
        // Fallback to full page screenshot if partial fails
        screenshot = await page.screenshot({
          type: 'png',
          fullPage: true,
          path: `variant-${Date.now()}-fallback.png`
        });
        console.log(`[CRAWLER] Full page screenshot taken as fallback`);
      }
      
      return screenshot.toString('base64');

    } catch (error) {
      console.error(`[CRAWLER] Variant screenshot failed for ${url}:`, error);
      throw error;
    } finally {
      await page.close();
      await isolatedBrowser.close();
    }
  }

  /**
   * Clear any previous variant code from the page to ensure clean state
   */
  private async clearPreviousVariantCode(page: Page): Promise<void> {
    console.log(`[CRAWLER] Clearing previous variant code`);
    
    // Remove any previously injected CSS styles
    await page.evaluate(() => {
      // Remove any style elements with variant-specific classes or IDs
      const variantStyles = document.querySelectorAll('style[data-variant], style[id*="variant"], style[class*="variant"]');
      variantStyles.forEach(style => style.remove());
      
      // Remove any injected elements with variant-specific classes
      const variantElements = document.querySelectorAll('[data-variant], [id*="variant"], [class*="variant"]');
      variantElements.forEach(el => {
        // Only remove if it's not a native element
        if (el.tagName.toLowerCase().startsWith('variant-') || el.hasAttribute('data-variant')) {
          el.remove();
        }
      });
      
      // Clear any custom CSS variables or classes that might have been added
      const body = document.body;
      if (body) {
        // Remove variant-specific classes from body
        const classList = Array.from(body.classList);
        classList.forEach(className => {
          if (className.includes('variant-') || className.includes('ab-test')) {
            body.classList.remove(className);
          }
        });
      }
    });
  }

  /**
   * Check if the CSS code contains hover states
   */
  private hasHoverStates(cssCode: string): boolean {
    if (!cssCode || cssCode.trim().length === 0) {
      return false;
    }
    
    // Look for hover pseudo-classes in the CSS
    const hoverPatterns = [
      /:hover\s*\{/g,
      /:hover\s*>/g,
      /:hover\s*\+/g,
      /:hover\s*~/g,
      /:hover\s*\[/g
    ];
    
    return hoverPatterns.some(pattern => pattern.test(cssCode));
  }

  /**
   * Simulate hover states on specific elements that have hover CSS
   */
  private async simulateHoverStates(page: Page, cssCode: string): Promise<void> {
    try {
      console.log(`[CRAWLER] Simulating hover states for elements with hover CSS`);
      
      // Extract selectors that have hover states from the CSS
      const hoverSelectors = this.extractHoverSelectors(cssCode);
      
      if (hoverSelectors.length === 0) {
        console.log(`[CRAWLER] No hover selectors found in CSS, skipping hover simulation`);
        return;
      }
      
      console.log(`[CRAWLER] Found hover selectors:`, hoverSelectors);
      
      for (const selector of hoverSelectors) {
        try {
          const elements = page.locator(selector);
          const count = await elements.count();
          
          if (count > 0) {
            console.log(`[CRAWLER] Found ${count} elements matching ${selector}, simulating hover`);
            
            // Hover over the first few elements to trigger hover states
            const elementsToHover = Math.min(count, 3);
            for (let i = 0; i < elementsToHover; i++) {
              try {
                const element = elements.nth(i);
                await element.hover({ timeout: 2000 });
                await page.waitForTimeout(200); // Brief pause between hovers
              } catch (hoverError) {
                console.warn(`[CRAWLER] Failed to hover element ${i}:`, hoverError);
              }
            }
          } else {
            console.log(`[CRAWLER] No elements found for hover selector: ${selector}`);
          }
        } catch (error) {
          console.warn(`[CRAWLER] Failed to process hover selector ${selector}:`, error);
        }
      }
      
      // Wait for any hover animations to complete
      await page.waitForTimeout(500);
      console.log(`[CRAWLER] Hover simulation completed`);
      
    } catch (error) {
      console.warn(`[CRAWLER] Failed to simulate hover states:`, error);
    }
  }

  /**
   * Extract selectors that have hover states from CSS code
   */
  private extractHoverSelectors(cssCode: string): string[] {
    const selectors: string[] = [];
    
    // Find all CSS rules that contain :hover
    const hoverRulePattern = /([^{}]+):hover\s*\{[^{}]*\}/g;
    let match;
    
    while ((match = hoverRulePattern.exec(cssCode)) !== null) {
      const selectorText = match[1].trim();
      
      // Clean up the selector (remove :hover, whitespace, etc.)
      const cleanSelector = selectorText
        .replace(/:hover\s*$/, '') // Remove :hover at the end
        .replace(/\s*:hover\s*/, ' ') // Remove :hover in the middle
        .trim();
      
      if (cleanSelector && !selectors.includes(cleanSelector)) {
        selectors.push(cleanSelector);
      }
    }
    
    // Also look for nested hover selectors (e.g., .parent:hover .child)
    const nestedHoverPattern = /([^{}]+):hover\s+([^{}]+)\s*\{[^{}]*\}/g;
    while ((match = nestedHoverPattern.exec(cssCode)) !== null) {
      const parentSelector = match[1].trim();
      
      if (parentSelector && !selectors.includes(parentSelector)) {
        selectors.push(parentSelector);
      }
    }
    
    return selectors;
  }

  /**
   * Scroll to a specific element with smart positioning
   */
  private async scrollToElement(page: Page, selector: string): Promise<void> {
    try {
      const element = page.locator(selector).first();
      const elementExists = await element.count();
      
      if (elementExists > 0) {
        console.log(`[CRAWLER] Scrolling to element: ${selector}`);
        
        // Scroll to the element
        await element.scrollIntoViewIfNeeded({ timeout: 5000 });
        
        // Add padding for better context (scroll up a bit)
        await page.evaluate(() => {
          window.scrollBy(0, -100);
        });
        
        // Wait for any animations to settle
        await page.waitForTimeout(500);
        
        console.log(`[CRAWLER] Successfully scrolled to element`);
      } else {
        console.log(`[CRAWLER] Element not found: ${selector}`);
        throw new Error(`Element not found: ${selector}`);
      }
    } catch (error) {
      console.warn(`[CRAWLER] Failed to scroll to element ${selector}:`, error);
      throw error;
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
        console.log(`[CRAWLER] Injecting CSS: ${variant.css_code}`);
        await page.addStyleTag({ content: variant.css_code });
        console.log(`[CRAWLER] CSS injected successfully`);
      } else {
        console.log(`[CRAWLER] No CSS code to inject`);
      }

      // Apply HTML changes based on injection method
      switch (variant.injection_method) {
        case 'selector':
          if (variant.target_selector && variant.html_code) {
            // Validate that html_code doesn't contain JavaScript
            if (variant.html_code.includes('document.') || variant.html_code.includes('querySelector') || variant.html_code.includes('innerHTML =')) {
              console.warn(`[CRAWLER] Detected JavaScript code in html_code, skipping HTML injection: ${variant.html_code.substring(0, 100)}...`);
              break;
            }
            
            console.log(`[CRAWLER] Applying selector injection: ${variant.target_selector} with HTML: ${variant.html_code}`);
            try {
              await page.evaluate(({ selector, html }) => {
                const element = document.querySelector(selector);
                if (element) {
                  // Check if html_code contains HTML tags or is just text
                  if (html.includes('<') && html.includes('>')) {
                    // It's HTML content, use innerHTML
                    element.innerHTML = html;
                    console.log(`[CRAWLER] Successfully updated element innerHTML with HTML content`);
                  } else {
                    // It's plain text, use textContent or innerText
                    element.textContent = html;
                    console.log(`[CRAWLER] Successfully updated element textContent with plain text`);
                  }
                } else {
                  console.log(`[CRAWLER] Element not found with selector: ${selector}`);
                }
              }, { selector: variant.target_selector, html: variant.html_code });
              console.log(`[CRAWLER] Selector injection completed successfully`);
            } catch (selectorError) {
              console.warn(`[CRAWLER] Invalid selector in applyVariantCode: ${variant.target_selector}`, selectorError);
              // Try fallback selector
              const fallbackSelector = variant.target_selector
                .replace(/:contains\([^)]*\)/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (fallbackSelector && fallbackSelector !== variant.target_selector) {
                try {
                  await page.evaluate(({ selector, html }) => {
                    const element = document.querySelector(selector);
                    if (element) {
                      // Check if html_code contains HTML tags or is just text
                      if (html.includes('<') && html.includes('>')) {
                        element.innerHTML = html;
                      } else {
                        element.textContent = html;
                      }
                    }
                  }, { selector: fallbackSelector, html: variant.html_code });
                  console.log(`[CRAWLER] Successfully applied variant using fallback selector: ${fallbackSelector}`);
                } catch (fallbackError) {
                  console.error(`[CRAWLER] Both original and fallback selectors failed:`, fallbackError);
                }
              }
            }
          }
          break;

        case 'new_element':
          if (variant.new_element_html) {
            console.log(`[CRAWLER] Applying new_element injection with HTML: ${variant.new_element_html}`);
            await page.evaluate((html) => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = html;
              const newElement = tempDiv.firstElementChild;
              if (newElement) {
                document.body.appendChild(newElement);
                console.log(`[CRAWLER] Successfully added new element to body`);
              } else {
                console.log(`[CRAWLER] Failed to create new element from HTML`);
              }
            }, variant.new_element_html);
            console.log(`[CRAWLER] New element injection completed`);
          } else {
            console.log(`[CRAWLER] No new_element_html provided for new_element injection`);
          }
          break;

        case 'modify_existing':
          if (variant.target_selector && variant.html_code) {
            console.log(`[CRAWLER] Applying modify_existing injection: ${variant.target_selector} with HTML: ${variant.html_code}`);
            try {
              await page.evaluate(({ selector, html }) => {
                const element = document.querySelector(selector);
                if (element) {
                  // For modify_existing, we might want to append or prepend
                  element.insertAdjacentHTML('beforeend', html);
                  console.log(`[CRAWLER] Successfully modified existing element`);
                } else {
                  console.log(`[CRAWLER] Element not found for modify_existing: ${selector}`);
                }
              }, { selector: variant.target_selector, html: variant.html_code });
              console.log(`[CRAWLER] Modify existing injection completed successfully`);
            } catch (selectorError) {
              console.warn(`[CRAWLER] Invalid selector in modify_existing: ${variant.target_selector}`, selectorError);
              // Try fallback selector
              const fallbackSelector = variant.target_selector
                .replace(/:contains\([^)]*\)/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              
              if (fallbackSelector && fallbackSelector !== variant.target_selector) {
                try {
                  await page.evaluate(({ selector, html }) => {
                    const element = document.querySelector(selector);
                    if (element) {
                      element.insertAdjacentHTML('beforeend', html);
                    }
                  }, { selector: fallbackSelector, html: variant.html_code });
                  console.log(`[CRAWLER] Successfully applied modify_existing using fallback selector: ${fallbackSelector}`);
                } catch (fallbackError) {
                  console.error(`[CRAWLER] Both original and fallback selectors failed in modify_existing:`, fallbackError);
                }
              }
            }
          }
          break;
      }
    } catch (error) {
      console.error(`[CRAWLER] Failed to apply variant code:`, error);
      // Don't throw - we still want to take a screenshot even if code application fails
    }
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

