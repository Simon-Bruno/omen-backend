/**
 * Brand Analysis Synthesis
 * Combines insights from multiple pages into a cohesive brand intelligence report
 */

import { BrandIntelligenceData } from './types';
import { PageType } from '@shared/page-types';
import { getSynthesisPrompt } from './prompts';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { getAIConfig } from '@shared/ai-config';
import { brandIntelligenceSchema } from './types';

export interface PageAnalysisResult {
  pageType: PageType | string;
  url: string;
  data?: BrandIntelligenceData;
  error?: string;
  html?: string;
  markdown?: string;
}

/**
 * Synthesize brand analyses from multiple pages into a unified report
 * @param pageResults Array of analysis results from different pages
 * @returns Synthesized brand intelligence data
 */
export async function synthesizePageAnalyses(
  pageResults: PageAnalysisResult[]
): Promise<BrandIntelligenceData> {
  console.log(`[SYNTHESIS] Starting synthesis of ${pageResults.length} page analyses`);

  // Filter out failed analyses
  const validResults = pageResults.filter(result => result.data && !result.error);

  if (validResults.length === 0) {
    throw new Error('No valid page analyses available for synthesis');
  }

  // If only homepage is available, return it directly
  if (validResults.length === 1 && validResults[0].pageType === PageType.HOME) {
    console.log(`[SYNTHESIS] Only homepage analysis available, returning directly`);
    return validResults[0].data!;
  }

  console.log(`[SYNTHESIS] Synthesizing ${validResults.length} valid page analyses`);

  // Generate synthesis prompt
  const prompt = getSynthesisPrompt(validResults);

  // Use AI to synthesize the results
  const aiConfig = getAIConfig();
  const result = await generateObject({
    model: google(aiConfig.model),
    schema: brandIntelligenceSchema,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  console.log(`[SYNTHESIS] Synthesis completed successfully`);
  return result.object as BrandIntelligenceData;
}

/**
 * Analyze additional pages beyond the homepage
 * @param urlsWithTypes URLs to analyze with their page types
 * @param baseUrl Base URL of the website
 * @param firecrawlService Service for page analysis
 * @param homeResult Homepage analysis result
 * @param projectId Project ID for storage
 * @param screenshotStorage Screenshot storage service
 * @returns Array of analysis results including homepage
 */
export async function analyzeAdditionalPages(
  urlsWithTypes: Array<{ url: string; pageType: PageType }>,
  _baseUrl: string,
  firecrawlService: any,
  homeResult: PageAnalysisResult,
  projectId: string,
  screenshotStorage: any
): Promise<PageAnalysisResult[]> {
  console.log(`[SYNTHESIS] Analyzing ${urlsWithTypes.length} additional pages`);

  const pageResults: PageAnalysisResult[] = [homeResult];

  // Analyze each additional page
  for (const { url, pageType } of urlsWithTypes) {
    if (pageType === PageType.HOME) continue; // Skip homepage as we already have it

    try {
      console.log(`[SYNTHESIS] Analyzing ${pageType} page: ${url}`);

      // Analyze the page
      const result = await firecrawlService.analyzePage(url, pageType);

      if (result.error || !result.data) {
        console.error(`[SYNTHESIS] Failed to analyze ${pageType} page: ${result.error}`);
        pageResults.push({
          pageType,
          url,
          error: result.error || 'Unknown error'
        });
      } else {
        console.log(`[SYNTHESIS] Successfully analyzed ${pageType} page`);

        // Store screenshot if available
        if (result.screenshot) {
          try {
            await screenshotStorage.saveScreenshot(
              projectId,
              pageType as 'home' | 'pdp' | 'collection' | 'about' | 'other',
              url,
              { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 100 },
              result.screenshot,
              result.html,
              result.markdown
            );
            console.log(`[SYNTHESIS] Screenshot saved for ${pageType} page`);
          } catch (error) {
            console.error(`[SYNTHESIS] Failed to save screenshot for ${pageType}:`, error);
          }
        }

        pageResults.push({
          pageType,
          url,
          data: result.data,
          html: result.html,
          markdown: result.markdown
        });
      }
    } catch (error) {
      console.error(`[SYNTHESIS] Error analyzing ${pageType} page:`, error);
      pageResults.push({
        pageType,
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return pageResults;
}

/**
 * Merge brand colors from multiple analyses
 * Removes duplicates and prioritizes homepage colors
 */
export function mergeBrandColors(
  pageResults: PageAnalysisResult[]
): Array<{ color: string; description: string; usage_type: string; hex_code: string }> {
  const colorMap = new Map<string, any>();

  // Process results with homepage first (higher priority)
  const sortedResults = [...pageResults].sort((a, b) => {
    if (a.pageType === PageType.HOME) return -1;
    if (b.pageType === PageType.HOME) return 1;
    return 0;
  });

  for (const result of sortedResults) {
    if (!result.data?.brand_colors) continue;

    for (const color of result.data.brand_colors) {
      const key = color.hex_code.toLowerCase();
      if (!colorMap.has(key)) {
        colorMap.set(key, color);
      }
    }
  }

  return Array.from(colorMap.values());
}

/**
 * Calculate weighted average of trait scores
 * Gives more weight to homepage analysis
 */
export function calculateWeightedTraitScores(
  pageResults: PageAnalysisResult[]
): Record<string, { score: number; explanation: string }> {
  const weights: Record<string, number> = {
    [PageType.HOME]: 0.6,
    [PageType.PDP]: 0.2,
    [PageType.ABOUT]: 0.1,
    [PageType.COLLECTION]: 0.05,
    [PageType.OTHER]: 0.05
  };

  const traits = ['premium', 'energetic', 'innovator', 'social_proof', 'curated', 'serious'];
  const weightedScores: Record<string, { totalScore: number; totalWeight: number; explanations: string[] }> = {};

  // Initialize trait scores
  for (const trait of traits) {
    weightedScores[trait] = { totalScore: 0, totalWeight: 0, explanations: [] };
  }

  // Calculate weighted scores
  for (const result of pageResults) {
    if (!result.data?.brand_trait_scores) continue;

    const pageWeight = weights[result.pageType as string] || weights[PageType.OTHER];

    for (const trait of traits) {
      const traitData = result.data.brand_trait_scores[trait as keyof typeof result.data.brand_trait_scores];
      if (traitData && typeof traitData.score === 'number') {
        weightedScores[trait].totalScore += traitData.score * pageWeight;
        weightedScores[trait].totalWeight += pageWeight;
        if (traitData.explanation) {
          weightedScores[trait].explanations.push(
            `${String(result.pageType).toUpperCase()}: ${traitData.explanation}`
          );
        }
      }
    }
  }

  // Calculate final scores
  const finalScores: Record<string, { score: number; explanation: string }> = {};
  for (const trait of traits) {
    const data = weightedScores[trait];
    if (data.totalWeight > 0) {
      finalScores[trait] = {
        score: Math.round(data.totalScore / data.totalWeight),
        explanation: data.explanations.join(' | ')
      };
    }
  }

  return finalScores;
}