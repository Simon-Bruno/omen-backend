// Web Crawler Service Types
export interface CrawlerService {
  crawlPage(url: string, options?: CrawlOptions): Promise<CrawlResult>;
  crawlMultiplePages(urls: string[], options?: CrawlOptions): Promise<CrawlResult[]>;
  takePartialScreenshot(url: string, viewport: { width: number, height: number }, fullPage: boolean, authentication?: { type: 'shopify_password'; password: string, shopDomain: string }): Promise<string>;
  takeVariantScreenshot(
    url: string, 
    variant: {
      css_code: string;
      html_code: string;
      injection_method: 'selector' | 'new_element' | 'modify_existing';
      target_selector?: string;
      new_element_html?: string;
    },
    viewport?: { width: number, height: number },
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<string>;
  analyzeDOM(
    url: string,
    viewport?: { width: number, height: number },
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<{
    injectionPoints: Array<{
      type: string;
      selector: string;
      confidence: number;
      description: string;
      boundingBox: { x: number; y: number; width: number; height: number };
      alternativeSelectors: string[];
    }>;
    pageStructure: {
      hasHeader: boolean;
      hasFooter: boolean;
      hasSidebar: boolean;
      mainContentSelector?: string;
      navigationSelectors: string[];
      ctaButtons: string[];
      formElements: string[];
    };
  }>;
}

export interface CrawlResult {
  url: string;
  html: string;
  screenshot: string; // base64 encoded screenshot
  title?: string;
  description?: string;
  error?: string;
}

export interface CrawlOptions {
  viewport?: {
    width: number;
    height: number;
  };
  waitFor?: number; // milliseconds to wait after page load
  timeout?: number; // page load timeout
  userAgent?: string;
  screenshot?: {
    fullPage?: boolean;
    quality?: number;
  };
  authentication?: {
    type: 'shopify_password';
    password: string;
    shopDomain: string;
  };
}

export interface CrawlerConfig {
  headless?: boolean;
  defaultViewport?: {
    width: number;
    height: number;
  };
  defaultTimeout?: number;
  defaultWaitFor?: number;
}
