// Brand Analysis Service
import type { CrawlerService, CrawlResult } from '@features/crawler';
import type { LLMService, BrandAnalysisRequest, BrandAnalysisResponse } from '@features/llm';

export interface BrandAnalysisService {
  analyzeProject(projectId: string, shopDomain: string): Promise<BrandAnalysisResult>;
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
  ) {}

  async analyzeProject(projectId: string, shopDomain: string): Promise<BrandAnalysisResult> {
    try {
      // Determine URLs to crawl
      const urls = this.buildCrawlUrls(shopDomain);
      
      // Crawl all pages
      const crawlResults = await this.crawler.crawlMultiplePages(urls, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000, // Wait 3 seconds for dynamic content
        screenshot: {
          fullPage: true,
          quality: 80
        }
      });

      // Separate home page and product pages
      const homePageResult = crawlResults[0];
      const productPageResults = crawlResults.slice(1);

      // Check for errors
      const errors = crawlResults.filter((result: CrawlResult) => result.error);
      if (errors.length > 0) {
        console.warn(`Crawl errors for project ${projectId}:`, errors.map((e: CrawlResult) => e.error));
      }

      // Prepare data for LLM analysis
      const analysisRequest: BrandAnalysisRequest = {
        htmlContent: {
          homePage: homePageResult.html,
          productPages: productPageResults.map((result: CrawlResult) => result.html)
        },
        screenshots: {
          homePage: homePageResult.screenshot,
          productPages: productPageResults.map((result: CrawlResult) => result.screenshot)
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
      console.error(`Brand analysis failed for project ${projectId}:`, error);
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
