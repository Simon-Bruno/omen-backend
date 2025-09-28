// Brand Analysis Service
import type { CrawlResult } from '@features/crawler';
import { createPlaywrightCrawler } from '@features/crawler';
import type { BrandAnalysisResponse } from './types';
import { ScreenshotAnalyzer } from './screenshot-analyzer';
import { LanguageAnalyzer } from './language-analyzer';
import { UrlSelector } from './url-selector';
import { ProjectDAL } from '@infra/dal';
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { getServiceConfig } from '@infra/config/services';
import { simplifyHTML, getHtmlInfo } from '@shared/utils/html-simplifier';

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
  private screenshotStorage: ScreenshotStorageService;

  constructor(
    prisma: PrismaClient
  ) {
    this.screenshotAnalyzer = new ScreenshotAnalyzer();
    this.languageAnalyzer = new LanguageAnalyzer();
    // this.codeAnalyzer = new CodeAnalyzer(); // Disabled for now
    this.urlSelector = new UrlSelector();
    this.screenshotStorage = createScreenshotStorageService(prisma);
  }


  async analyzeProject(projectId: string, shopDomain: string): Promise<BrandAnalysisResult> {
    // Create a new crawler instance for this analysis to avoid conflicts
    const config = getServiceConfig();
    const crawler = createPlaywrightCrawler(config.crawler);
    
    try {
      console.log(`[BRAND_ANALYSIS] Starting analysis for project ${projectId}, shop: ${shopDomain}`);
      const baseUrl = `https://${shopDomain}`;

      // 1) Crawl homepage
      console.log(`[BRAND_ANALYSIS] Crawling homepage: ${baseUrl}`);
      const homeResult = await crawler.crawlPage(baseUrl, {
        viewport: { width: 1920, height: 1080 },
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

      const urlsWithTypes = this.urlSelector.getUrlsWithTypes(response);
      console.log(`[BRAND_ANALYSIS] Selected URLs to crawl:`, urlsWithTypes);

      // Check storage first for each URL
      const cachedScreenshots = new Map<string, string>();
      const urlsToCapture: Array<{ url: string, pageType: 'home' | 'pdp' | 'about' }> = [];

      for (const { url, pageType } of urlsWithTypes) {
        const cached = await this.screenshotStorage.getScreenshot(
          projectId,
          pageType,
          { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 80 }
        );

        if (cached) {
          cachedScreenshots.set(url, cached);
          console.log(`[BRAND_ANALYSIS] Using stored screenshot for ${pageType} page`);
        } else {
          urlsToCapture.push({ url, pageType });
        }
      }

      // Only capture screenshots for URLs not in cache
      let crawlResults: CrawlResult[] = [];
      if (urlsToCapture.length > 0) {
        console.log(`[BRAND_ANALYSIS] Capturing ${urlsToCapture.length} new screenshots`);
        try {
          crawlResults = await crawler.crawlMultiplePages(urlsToCapture.map(u => u.url), {
            viewport: { width: 1920, height: 1080 },
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
        } catch (crawlError) {
          console.error(`[BRAND_ANALYSIS] Error during screenshot capture:`, crawlError);
          // Continue with empty results - we'll still have the home page screenshot
          crawlResults = [];
        }

        // Store the new screenshots
        for (let i = 0; i < crawlResults.length; i++) {
          const result = crawlResults[i];
          const urlInfo = urlsToCapture[i];
          if (result.screenshot && urlInfo) {
            // Simplify HTML content before saving
            const simplifiedHtml = result.html ? simplifyHTML(result.html) : undefined;
            
            const screenshotId = await this.screenshotStorage.saveScreenshot(
              projectId,
              urlInfo.pageType,
              result.url,
              { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 80 },
              result.screenshot,
              simplifiedHtml
            );
            console.log(`[BRAND_ANALYSIS] Screenshot and HTML saved with ID: ${screenshotId} (${getHtmlInfo(simplifiedHtml)})`);
          }
        }
      }

      // Check for errors
      const errors = crawlResults.filter((result: CrawlResult) => result.error);
      if (errors.length > 0) {
        console.warn(`[BRAND_ANALYSIS] Crawl errors for project ${shopDomain}:`, errors.map((e: CrawlResult) => e.error));
      }

      console.log(`[BRAND_ANALYSIS] Crawl completed. ${crawlResults.length} pages crawled, ${errors.length} errors`);

      // Prepare data for analysis - combine cached and new screenshots
      const htmlContent = crawlResults.map((result: CrawlResult) => result.html);
      const screenshots = [
        ...cachedScreenshots.values(),
        ...crawlResults.map((result: CrawlResult) => result.screenshot).filter(s => s)
      ];
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
    } finally {
      // Clean up the crawler instance
      try {
        await crawler.close();
      } catch (cleanupError) {
        console.warn(`[BRAND_ANALYSIS] Error closing crawler:`, cleanupError);
      }
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
  prisma: PrismaClient
): BrandAnalysisService {
  return new BrandAnalysisServiceImpl(prisma);
}