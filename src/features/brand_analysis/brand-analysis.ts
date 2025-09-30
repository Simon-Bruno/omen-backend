// Brand Analysis Functions - Firecrawl Implementation with URL Selection
import type { BrandIntelligenceData } from './types';
import { synthesisSchema } from './types';
import { ProjectDAL } from '@infra/dal';
import { FirecrawlService } from './firecrawl-service';
import { UrlSelector } from './url-selector';
import { getSynthesisPrompt, type PageType } from './prompts';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getAIConfig } from '@shared/ai-config';
import { extractUrlsFromHtml } from '@shared/utils/url-utils';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { PrismaClient } from '@prisma/client';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';


export async function analyzeProject(projectId: string, shopDomain: string): Promise<BrandIntelligenceData> {
  // Initialize Prisma client and screenshot storage service
  const prisma = new PrismaClient();
  const screenshotStorage = createScreenshotStorageService(prisma);
  
  try {
    console.log(`[BRAND_ANALYSIS] Starting Firecrawl analysis for project ${projectId}, shop: ${shopDomain}`);

    const baseUrl = `https://${shopDomain}`;
    const firecrawlService = new FirecrawlService();

    // Step 1: Analyze the homepage
    console.log(`[BRAND_ANALYSIS] Step 1: Analyzing homepage: ${baseUrl}`);
    const homeResult = await firecrawlService.analyzePage(baseUrl, 'home');

    if (homeResult.error || !homeResult.data) {
      console.error(`[BRAND_ANALYSIS] Homepage analysis failed: ${homeResult.error}`);
      throw new Error(`Homepage analysis failed: ${homeResult.error}`);
    }

    console.log(`[BRAND_ANALYSIS] Homepage analysis completed successfully`);

    // Store homepage screenshot
    await storeScreenshot(projectId, 'home', baseUrl, homeResult.screenshot, homeResult.html, screenshotStorage);

    // Step 2: Extract URLs from homepage HTML
    const candidates = await extractUrlsFromHtml(homeResult.html || '', baseUrl);

    // Step 3: Select URLs for additional analysis
    console.log(`[BRAND_ANALYSIS] Step 3: Selecting URLs from ${candidates.length} candidates`);
    const response = await selectUrlsForAnalysis(candidates);
    const urlSelector = new UrlSelector();
    const urlsWithTypes = urlSelector.getUrlsWithTypes(response);
    console.log(`[BRAND_ANALYSIS] Selected URLs to analyze:`, urlsWithTypes);

    // Check if we have additional pages to analyze
    const hasAdditionalPages = urlsWithTypes.some(url => url.pageType !== 'home');
    
    let finalBrandIntelligence: BrandIntelligenceData;
    
    if (hasAdditionalPages) {
      // Step 4: Analyze additional pages
      const pageResults = await analyzeAdditionalPages(urlsWithTypes, baseUrl, firecrawlService, homeResult, projectId, screenshotStorage);

      // Step 5: Synthesize results from all pages
      console.log(`[BRAND_ANALYSIS] Step 5: Synthesizing results from ${pageResults.length} pages`);
      finalBrandIntelligence = await synthesizePageAnalyses(pageResults);
    } else {
      // Only homepage available, use it directly without synthesis
      console.log(`[BRAND_ANALYSIS] Only homepage available, using homepage data directly`);
      finalBrandIntelligence = homeResult.data;
    }

    // Store the analysis results
    await ProjectDAL.updateProjectBrandAnalysis(projectId, finalBrandIntelligence);
    console.log(`[BRAND_ANALYSIS] Brand analysis completed successfully for project ${projectId}`);

    return finalBrandIntelligence;
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Brand analysis failed for project ${shopDomain}:`, error);
    throw error;
  } finally {
    // Clean up Prisma client
    await prisma.$disconnect();
  }
}

// Helper function to store screenshots
async function storeScreenshot(
  projectId: string,
  pageType: 'home' | 'pdp' | 'about',
  url: string,
  screenshot: string | undefined,
  html: string | undefined,
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
      html
    );
    console.log(`[BRAND_ANALYSIS] ${pageType} page screenshot saved successfully`);
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Failed to save ${pageType} page screenshot:`, error);
  }
}

// ********************************************************
// HELPER FUNCTIONS
// ********************************************************
async function selectUrlsForAnalysis(candidates: string[]): Promise<{ home: string; pdp: string; about: string }> {
  const urlSelector = new UrlSelector();
  try {
    const response = await urlSelector.selectUrls(candidates);
    console.log(`[BRAND_ANALYSIS] URL selection completed:`, response);
    return response;
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] URL selection failed:`, error);
    // Fallback to homepage-only if URL selection fails and we have candidates
    if (candidates.length > 0) {
      console.log(`[BRAND_ANALYSIS] Falling back to homepage-only analysis: ${candidates[0]}`);
      return { home: candidates[0], pdp: '', about: '' };
    }
    throw new Error('No URLs available for analysis');
  }
}

// Helper function to analyze additional pages
async function analyzeAdditionalPages(
  urlsWithTypes: Array<{ url: string; pageType: PageType }>,
  baseUrl: string,
  firecrawlService: FirecrawlService,
  homeResult: { pageType: PageType; url: string; data?: BrandIntelligenceData; error?: string },
  projectId: string,
  screenshotStorage: ScreenshotStorageService
): Promise<Array<{ pageType: PageType; url: string; data?: BrandIntelligenceData; error?: string }>> {
  const pageResults = [homeResult]; // Start with homepage

  for (const { url, pageType } of urlsWithTypes) {
    if (url === baseUrl) continue; // Skip homepage as we already have it

    console.log(`[BRAND_ANALYSIS] Analyzing ${pageType} page: ${url}`);

    try {
      const pageResult = await firecrawlService.analyzePage(url, pageType);
      pageResults.push(pageResult);
      console.log(`[BRAND_ANALYSIS] ${pageType} page analysis completed for: ${url}`);

      // Store screenshot for additional pages
      await storeScreenshot(projectId, pageType, url, pageResult.screenshot, pageResult.html, screenshotStorage);
    } catch (urlError) {
      console.warn(`[BRAND_ANALYSIS] Error analyzing ${pageType} page ${url}:`, urlError);
    }
  }

  return pageResults;
}

// Helper function to synthesize page analyses
async function synthesizePageAnalyses(pageResults: Array<{ pageType: PageType; url: string; data?: BrandIntelligenceData; error?: string }>): Promise<BrandIntelligenceData> {
  try {
    console.log(`[BRAND_ANALYSIS] Synthesizing results from ${pageResults.length} pages`);

    const synthesisPrompt = getSynthesisPrompt(pageResults);
    const aiConfig = getAIConfig();

    const result = await generateObject({
      model: google(aiConfig.model),
      schema: synthesisSchema,
      messages: [
        {
          role: 'system',
          content: synthesisPrompt
        }
      ]
    });

    console.log(`[BRAND_ANALYSIS] Synthesis completed successfully`);
    return result.object as BrandIntelligenceData;
  } catch (error) {
    console.error(`[BRAND_ANALYSIS] Synthesis failed:`, error);
    // Fallback to homepage data if synthesis fails
    const homePageResult = pageResults.find(result => result.pageType === 'home' && result.data);
    if (homePageResult?.data) {
      console.log(`[BRAND_ANALYSIS] Using homepage data as fallback`);
      return homePageResult.data;
    }
    throw new Error(`Synthesis failed and no fallback data available: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
