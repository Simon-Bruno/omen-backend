// Brand Analysis Service
import type { CrawlerService, CrawlResult } from '@features/crawler';
import type { DetailedBrandAnalysisResponse } from './types';
import { ScreenshotAnalyzer } from './screenshot-analyzer';
import { LanguageAnalyzer } from './language-analyzer';
import { CodeAnalyzer } from './code-analyzer';

export interface BrandAnalysisService {
  analyzeProject(shopDomain: string): Promise<BrandAnalysisResult>;
}

export interface BrandAnalysisResult {
  success: boolean;
  brandSummary?: DetailedBrandAnalysisResponse;
  error?: string;
}



export class BrandAnalysisServiceImpl implements BrandAnalysisService {
  private screenshotAnalyzer: ScreenshotAnalyzer;
  private languageAnalyzer: LanguageAnalyzer;
  private codeAnalyzer: CodeAnalyzer;

  constructor(
    private crawler: CrawlerService
  ) {
    this.screenshotAnalyzer = new ScreenshotAnalyzer();
    this.languageAnalyzer = new LanguageAnalyzer();
    this.codeAnalyzer = new CodeAnalyzer();
  }


  async analyzeProject(shopDomain: string): Promise<BrandAnalysisResult> {
    try {
      const baseUrl = `https://${shopDomain}`;

      // 1) Crawl homepage
      const homeResult = await this.crawler.crawlPage(baseUrl, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000,
        screenshot: { fullPage: true, quality: 80 }
      });

      let candidates = [baseUrl];
      try {
        // Determine URLs to crawl
        const regex = /href="((?:\/[a-zA-Z0-9]+)+)\/*"/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(homeResult.html)) !== null) {
          const path = m[1];
          candidates.push(`${baseUrl}${path}`);
        }
        console.log("Candidates:", candidates);
      } catch {
        candidates = this.buildCrawlUrls(shopDomain);
      }

      const response = this.codeAnalyzer

      const filteredCandidates = (['home', 'products', 'about'] as const)
        .map(k => response[k])
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

      // Prepare data for analysis
      const htmlContent = crawlResults.map((result: CrawlResult) => result.html);
      const screenshots = crawlResults.map((result: CrawlResult) => result.screenshot);
      // const urls = crawlResults.map((result: CrawlResult) => result.url);

      // Run separate analyses in parallel
      const [screenshotAnalysis, languageAnalysis] = await Promise.all([
        this.screenshotAnalyzer.analyzeScreenshots(screenshots),
        this.languageAnalyzer.analyzeLanguage(htmlContent),
        // this.codeAnalyzer.analyzeCode(htmlContent, urls)
      ]);

      // Simply combine the three analyzer results
      const detailedAnalysis = {
        screenshot: screenshotAnalysis,
        language: languageAnalysis,
        // code: codeAnalysis,
      };

      return {
        success: true,
        brandSummary: detailedAnalysis,
      };
    } catch (error) {
      console.error(`Detailed brand analysis failed for project ${shopDomain}:`, error);
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
  crawler: CrawlerService
): BrandAnalysisService {
  return new BrandAnalysisServiceImpl(crawler);
}