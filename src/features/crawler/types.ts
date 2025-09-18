// Web Crawler Service Types
export interface CrawlerService {
  crawlPage(url: string, options?: CrawlOptions): Promise<CrawlResult>;
  crawlMultiplePages(urls: string[], options?: CrawlOptions): Promise<CrawlResult[]>;
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
