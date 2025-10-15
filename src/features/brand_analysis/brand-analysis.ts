// Brand Analysis Functions - Firecrawl Implementation with URL Selection
import type { BrandIntelligenceData } from './types';
import { ProjectDAL } from '@infra/dal';
import { FirecrawlService } from './firecrawl-service';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';
import { UrlSelector, extractUrlsFromHtml } from './url-selector';
import { synthesizePageAnalyses, analyzeAdditionalPages, PageAnalysisResult } from './synthesis';
import { PageType } from '@shared/page-types';


export async function analyzeProject(projectId: string, shopDomain: string): Promise<BrandIntelligenceData> {
  // Initialize screenshot storage service
  const screenshotStorage = createScreenshotStorageService();

  try {
    console.log(`[BRAND_ANALYSIS] Starting Firecrawl analysis for project ${projectId}, shop: ${shopDomain}`);

    // Handle both Shopify domains (e.g., "shop.myshopify.com") and full URLs (e.g., "https://example.com")
    const baseUrl = shopDomain.startsWith('http://') || shopDomain.startsWith('https://')
      ? shopDomain
      : `https://${shopDomain}`;
    const firecrawlService = new FirecrawlService();

    // Step 1: Analyze the homepage
    console.log(`[BRAND_ANALYSIS] Step 1: Analyzing homepage: ${baseUrl}`);
    const homeResult = await firecrawlService.analyzePage(baseUrl, 'home');

    if (homeResult.error || !homeResult.data) {
      console.error(`[BRAND_ANALYSIS] Homepage analysis failed: ${homeResult.error}`);
      throw new Error(`Homepage analysis failed: ${homeResult.error}`);
    }

    console.log(`[BRAND_ANALYSIS] Homepage analysis completed successfully`);

    // Store homepage screenshot (with HTML and markdown)
    await storeScreenshot(projectId, 'home', baseUrl, homeResult.screenshot, homeResult.html, homeResult.markdown, screenshotStorage);

    // Step 2: Extract URLs from homepage HTML
    const candidates = await extractUrlsFromHtml(homeResult.html || '', baseUrl);
    console.log(`[BRAND_ANALYSIS] Step 2: Extracted ${candidates.length} URLs from homepage`);

    // Step 3: Select URLs for additional analysis
    console.log(`[BRAND_ANALYSIS] Step 3: Selecting URLs from ${candidates.length} candidates`);
    const urlSelector = new UrlSelector();
    const selectedUrls = await urlSelector.selectUrls(candidates);
    const urlsWithTypes = urlSelector.getUrlsWithTypes(selectedUrls);
    console.log(`[BRAND_ANALYSIS] Selected ${urlsWithTypes.length} URLs to analyze:`, urlsWithTypes.map(u => `${u.pageType}: ${u.url}`));

    // Check if we have additional pages to analyze
    const hasAdditionalPages = urlsWithTypes.some(url => url.pageType !== PageType.HOME);

    let finalBrandIntelligence: BrandIntelligenceData;

    // Prepare home result in the expected format
    const homePageResult: PageAnalysisResult = {
      pageType: PageType.HOME,
      url: baseUrl,
      data: homeResult.data,
      html: homeResult.html,
      markdown: homeResult.markdown
    };

    let pageResults: PageAnalysisResult[] = [homePageResult];

    if (hasAdditionalPages) {
      // Step 4: Analyze additional pages
      pageResults = await analyzeAdditionalPages(urlsWithTypes, baseUrl, firecrawlService, homePageResult, projectId, screenshotStorage);

      // Step 5: Synthesize results from all pages
      console.log(`[BRAND_ANALYSIS] Step 5: Synthesizing results from ${pageResults.length} pages`);
      finalBrandIntelligence = await synthesizePageAnalyses(pageResults);
    } else {
      // Only homepage available, use it directly without synthesis
      console.log(`[BRAND_ANALYSIS] Only homepage available, using homepage data directly`);
      finalBrandIntelligence = homeResult.data;
    }

    // Store the analysis results without sources (sources are now in screenshots table)
    await ProjectDAL.updateProjectBrandAnalysis(projectId, finalBrandIntelligence);
    console.log(`[BRAND_ANALYSIS] Brand analysis completed successfully for project ${projectId}`);

    return finalBrandIntelligence;
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Brand analysis failed for project ${shopDomain}:`, error);
    throw error;
  }
}

// Helper function to store screenshots
async function storeScreenshot(
  projectId: string,
  pageType: string,
  url: string,
  screenshot: string | undefined,
  html: string | undefined,
  markdown: string | undefined,
  screenshotStorage: ScreenshotStorageService
): Promise<void> {
  if (!screenshot) {
    console.log(`[BRAND_ANALYSIS] No screenshot available for ${pageType} page: ${url}`);
    return;
  }

  try {
    await screenshotStorage.saveScreenshot(
          projectId,
          pageType as 'home' | 'pdp' | 'about' | 'other',
      url,
      HIGH_QUALITY_SCREENSHOT_OPTIONS,
      screenshot,
      html,
      markdown
    );
    console.log(`[BRAND_ANALYSIS] ${pageType} page screenshot saved successfully`);
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Failed to save ${pageType} page screenshot:`, error);
  }
}

