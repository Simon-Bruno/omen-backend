// Brand Analysis Functions - Firecrawl Implementation with URL Selection
import type { BrandIntelligenceData } from './types';
import { ProjectDAL } from '@infra/dal';
import { FirecrawlService } from './firecrawl-service';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';
import { DesignSystemService } from '@features/design_system/design-system-service';


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
    // const candidates = await extractUrlsFromHtml(homeResult.html || '', baseUrl);

    // Step 3: Select URLs for additional analysis
    // console.log(`[BRAND_ANALYSIS] Step 3: Selecting URLs from ${candidates.length} candidates`);
    // const response = await selectUrlsForAnalysis(candidates);
    // const urlSelector = new UrlSelector();
    // const urlsWithTypes = urlSelector.getUrlsWithTypes(response);
    // console.log(`[BRAND_ANALYSIS] Selected URLs to analyze:`, urlsWithTypes);

    // Check if we have additional pages to analyze
    // const hasAdditionalPages = urlsWithTypes.some(url => url.pageType !== 'home');
    
    let finalBrandIntelligence: BrandIntelligenceData;
    
    // let pageResults: Array<{ pageType: PageType; url: string; data?: BrandIntelligenceData; error?: string; html?: string; markdown?: string }> = [homeResult];
    // if (hasAdditionalPages) {
    //   // Step 4: Analyze additional pages
    //   pageResults = await analyzeAdditionalPages(urlsWithTypes, baseUrl, firecrawlService, homeResult, projectId, screenshotStorage);

    //   // Step 5: Synthesize results from all pages
    //   console.log(`[BRAND_ANALYSIS] Step 5: Synthesizing results from ${pageResults.length} pages`);
    //   finalBrandIntelligence = await synthesizePageAnalyses(pageResults);
    // } else {
      // Only homepage available, use it directly without synthesis
      console.log(`[BRAND_ANALYSIS] Only homepage available, using homepage data directly`);
      finalBrandIntelligence = homeResult.data;
    // }

    // Store the analysis results without sources (sources are now in screenshots table)
    await ProjectDAL.updateProjectBrandAnalysis(projectId, finalBrandIntelligence);
    console.log(`[BRAND_ANALYSIS] Brand analysis completed successfully for project ${projectId}`);

    // Step 6: Extract design system separately (parallel to brand analysis)
    console.log(`[BRAND_ANALYSIS] Step 6: Extracting design system for: ${baseUrl}`);
    try {
      const designSystemService = new DesignSystemService();
      const designSystemResult = await designSystemService.extractAndSaveDesignSystem(projectId, baseUrl);
      
      if (designSystemResult.success) {
        console.log(`[BRAND_ANALYSIS] Design system extracted and saved successfully for project ${projectId}`);
      } else {
        console.warn(`[BRAND_ANALYSIS] Design system extraction failed for project ${projectId}: ${designSystemResult.error}`);
      }
    } catch (error) {
      console.error(`[BRAND_ANALYSIS] Design system extraction failed for project ${projectId}:`, error);
      // Don't fail the entire brand analysis if design system extraction fails
    }

    return finalBrandIntelligence;
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Brand analysis failed for project ${shopDomain}:`, error);
    throw error;
  }
}

// Helper function to store screenshots
async function storeScreenshot(
  projectId: string,
  pageType: 'home' | 'pdp' | 'about',
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
          pageType,
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

