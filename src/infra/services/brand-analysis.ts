// Brand Analysis Service
import type { CrawlerService, CrawlResult } from '@features/crawler';
import type { LLMService, BrandAnalysisRequest, BrandAnalysisResponse } from '@features/llm';
import { ExtractNavLinksRequest } from '@features/llm/types';

export interface BrandAnalysisService {
  analyzeProject(shopDomain: string): Promise<BrandAnalysisResult>;
}

export interface BrandAnalysisResult {
  success: boolean;
  brandSummary?: BrandAnalysisResponse;
  pages?: Array<{
    url: string;
    screenshotUrl: string;
    title?: string;
    description?: string;
  }>;
  error?: string;
}

export class BrandAnalysisServiceImpl implements BrandAnalysisService {
  constructor(
    private crawler: CrawlerService,
    private llm: LLMService
  ) { }

  async analyzeProject(shopDomain: string): Promise<BrandAnalysisResult> {
    try {

      const baseUrl = `https://${shopDomain}`;

      // 1) Crawl homepage
      const homeResult = await this.crawler.crawlPage(baseUrl, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000,
        screenshot: { fullPage: true, quality: 80 }
      });
      
      var candidates = [baseUrl];
      try {
        // Determine URLs to crawl
        const regex = /href="((?:\/[a-zA-Z0-9]+)+)\/*"/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(homeResult.html)) !== null) {
          const path = m[1];
          candidates.push(`${baseUrl}${path}`);
        }
        console.log("Candidates:", candidates);
      }
      catch {
        candidates = this.buildCrawlUrls(shopDomain);
      }

      const response = {home: candidates[0], products: candidates[1], about: candidates[4]}; // await this.llm.extractNavLinks({ foundUrls: candidates });

      const filteredCandidates = (['home', 'products', 'about'] as const)
        .map(k => (response as any)[k])
        .filter((u): u is string => typeof u === 'string' && u.length > 0);

      console.log(filteredCandidates);
      // Crawl all pages
      const crawlResults = await this.crawler.crawlMultiplePages(filteredCandidates, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000, // Wait 3 seconds for dynamic content
        screenshot: {
          fullPage: true,
          quality: 80
        }
      });

      // Check for errors
      const errors = crawlResults.filter((result: CrawlResult) => result.error);
      if (errors.length > 0) {
        console.warn(`Crawl errors for project ${shopDomain}:`, errors.map((e: CrawlResult) => e.error));
      }

      // Prepare data for LLM analysis
      const analysisRequest: BrandAnalysisRequest = {
        pages: {
          html: crawlResults.map((result: CrawlResult) => result.html), 
          screenshot: crawlResults.map((result: CrawlResult) => result.screenshot), 
          urls: crawlResults.map((result: CrawlResult) => result.url),
        },
        shopDomain
      };

      // Perform brand analysis
      const brandSummary = await this.llm.analyzeBrand(analysisRequest);
      
      // Prepare page metadata
      const pages = crawlResults.map((result: CrawlResult) => ({
        url: result.url,
        screenshotUrl: `data:image/png;base64,${result.screenshot}`,
        title: result.title,
        description: result.description
      }));

      return {
        success: true,
        brandSummary,
        pages
      };
    } catch (error) {
      console.error(`Brand analysis failed for project ${shopDomain}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private buildCrawlUrls(shopDomain: string): string[] {
    const baseUrl = `https://${shopDomain}`;
    const urls = [baseUrl]; // Home page

    // For MVP, we'll try to find a product page by common patterns
    // In a real implementation, you might use Shopify API to get actual product URLs
    const commonProductPaths = [
      '/products',
      '/collections',
      '/collections/all',
      '/collections/featured'
    ];

    // Add common product page patterns
    commonProductPaths.forEach(path => {
      urls.push(`${baseUrl}${path}`);
    });

    return urls;
  }
}

// Factory function
export function createBrandAnalysisService(
  crawler: CrawlerService,
  llm: LLMService
): BrandAnalysisService {
  return new BrandAnalysisServiceImpl(crawler, llm);
}
