// Brand Analysis Service
import type { CrawlerService, CrawlResult } from '@features/crawler';
import type { BrandAnalysisResponse } from './types';
import { ScreenshotAnalyzer } from './screenshot-analyzer';
import { LanguageAnalyzer } from './language-analyzer';
import { UrlSelector } from './url-selector';
import { ProjectDAL } from '@infra/dal'

export interface BrandAnalysisService {
  analyzeProject(projectId: string, shopDomain: string): Promise<BrandAnalysisResult>;
}

export interface BrandAnalysisResult {
  success: boolean;
  brandSummary?: BrandAnalysisResponse;
  error?: string;
}



export class BrandAnalysisServiceImpl implements BrandAnalysisService {
  private screenshotAnalyzer: ScreenshotAnalyzer;
  private languageAnalyzer: LanguageAnalyzer;
  // private codeAnalyzer: CodeAnalyzer; // Disabled for now
  private urlSelector: UrlSelector;

  constructor(
    private crawler: CrawlerService
  ) {
    this.screenshotAnalyzer = new ScreenshotAnalyzer();
    this.languageAnalyzer = new LanguageAnalyzer();
    // this.codeAnalyzer = new CodeAnalyzer(); // Disabled for now
    this.urlSelector = new UrlSelector();
  }


  async analyzeProject(projectId: string, shopDomain: string): Promise<BrandAnalysisResult> {
    try {
      console.log(`[BRAND_ANALYSIS] Starting analysis for project ${projectId}, shop: ${shopDomain}`);
      const baseUrl = `https://${shopDomain}`;

      // 1) Crawl homepage
      console.log(`[BRAND_ANALYSIS] Crawling homepage: ${baseUrl}`);
      const homeResult = await this.crawler.crawlPage(baseUrl, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000,
        screenshot: { fullPage: true, quality: 80 },
        authentication: shopDomain === 'omen-mvp.myshopify.com' ? {
          type: 'shopify_password',
          password: 'reitri',
          shopDomain: shopDomain
        } : undefined
      });

      if (homeResult.error) {
        console.error(`[BRAND_ANALYSIS] Homepage crawl failed: ${homeResult.error}`);
        throw new Error(`Homepage crawl failed: ${homeResult.error}`);
      }

      let candidates = [baseUrl];
      try {
        // Determine URLs to crawl
        const regex = /href="((?:\/[a-zA-Z0-9?\-=]+)+)\/*"/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(homeResult.html)) !== null) {
          const path = m[1];
          candidates.push(`${baseUrl}${path}`);
        }
        console.log("Candidates:", candidates);
      } catch {
        candidates = this.buildCrawlUrls(shopDomain);
      }

      console.log(`[BRAND_ANALYSIS] Selecting URLs from ${candidates.length} candidates`);
      let response;
      try {
        response = await this.urlSelector.selectUrls(candidates);
        console.log(`[BRAND_ANALYSIS] URL selection completed:`, response);
      } catch (error) {
        console.error(`[BRAND_ANALYSIS] URL selection failed:`, error);
        throw new Error(`URL selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const filteredCandidates = (['home', 'pdp', 'about'] as const)
        .map(k => response[k])
        .filter((u): u is string => typeof u === 'string' && u.length > 0);

      console.log(`[BRAND_ANALYSIS] Selected URLs to crawl:`, filteredCandidates);
      // Crawl all pages
      console.log(`[BRAND_ANALYSIS] Starting multi-page crawl...`);
      const crawlResults = await this.crawler.crawlMultiplePages(filteredCandidates, {
        viewport: { width: 1280, height: 720 },
        waitFor: 3000, // Wait 3 seconds for dynamic content
        screenshot: {
          fullPage: true,
          quality: 80
        },
        authentication: shopDomain === 'omen-mvp.myshopify.com' ? {
          type: 'shopify_password',
          password: 'reitri',
          shopDomain: shopDomain
        } : undefined
      });

      // Check for errors
      const errors = crawlResults.filter((result: CrawlResult) => result.error);
      if (errors.length > 0) {
        console.warn(`[BRAND_ANALYSIS] Crawl errors for project ${shopDomain}:`, errors.map((e: CrawlResult) => e.error));
      }

      console.log(`[BRAND_ANALYSIS] Crawl completed. ${crawlResults.length} pages crawled, ${errors.length} errors`);

      // Prepare data for analysis
      const htmlContent = crawlResults.map((result: CrawlResult) => result.html);
      const screenshots = crawlResults.map((result: CrawlResult) => result.screenshot);
      // const urls = crawlResults.map((result: CrawlResult) => result.url);

      // Filter out empty screenshots and log the issue
      const validScreenshots = screenshots.filter(screenshot => screenshot && screenshot.trim() !== '');
      if (validScreenshots.length !== screenshots.length) {
        console.warn(`[BRAND_ANALYSIS] ${screenshots.length - validScreenshots.length} screenshots are empty or corrupted`);
      }

      // Run separate analyses in parallel
      console.log(`[BRAND_ANALYSIS] Starting analysis of ${validScreenshots.length} screenshots and ${htmlContent.length} HTML pages`);
      
      // Only add screenshot analysis if we have valid screenshots
      let screenshotAnalysis;
      if (validScreenshots.length > 0) {
        screenshotAnalysis = await this.screenshotAnalyzer.analyzeScreenshots(validScreenshots);
      } else {
        console.warn('[BRAND_ANALYSIS] No valid screenshots available, skipping screenshot analysis');
        // Add a placeholder for screenshot analysis
        screenshotAnalysis = {
          visualStyle: {
            overallAesthetic: 'Unable to analyze - no valid screenshots available',
            colorPalette: [],
            typography: 'Unable to analyze - no valid screenshots available',
            imagery: 'Unable to analyze - no valid screenshots available',
          },
          brandElements: {
            logo: 'Unable to analyze - no valid screenshots available',
            keyComponents: [],
            layout: 'Unable to analyze - no valid screenshots available',
          },
          brandPersonality: {
            adjectives: ['unknown'],
            targetAudience: 'Unable to analyze - no valid screenshots available',
          }
        };
      }

      // Run language analysis
      const languageAnalysis = await this.languageAnalyzer.analyzeLanguage(htmlContent);

      console.log(`[BRAND_ANALYSIS] Analysis completed, saving results...`);

      // Simply combine the three analyzer results
      const detailedAnalysis = {
        screenshot: screenshotAnalysis,
        language: languageAnalysis,
        // code: codeAnalysis,
      };

      await ProjectDAL.updateProjectBrandAnalysis(projectId, detailedAnalysis);
      console.log(`[BRAND_ANALYSIS] Brand analysis completed successfully for project ${projectId}`);
      
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