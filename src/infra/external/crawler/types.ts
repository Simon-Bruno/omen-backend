export interface CrawlResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  images: string[];
  metadata: Record<string, any>;
  timestamp: Date;
  html: string;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  delay?: number;
  userAgent?: string;
  timeout?: number;
  followRedirects?: boolean;
  includeImages?: boolean;
  includeLinks?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  waitFor?: number;
  screenshot?: {
    fullPage?: boolean;
    quality?: number;
  };
}

export interface CrawlerConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  timeout?: number;
  defaultViewport?: {
    width: number;
    height: number;
  };
  defaultTimeout?: number;
  defaultWaitFor?: number;
}

export interface CrawlerService {
  crawl(url: string, options?: CrawlOptions): Promise<CrawlResult[]>;
  close(): Promise<void>;
}
