// Brand Analysis Service
import type { CrawlerService, CrawlResult } from '@features/crawler';
import type { BrandAnalysisRequest, BrandAnalysisResponse } from './types';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { getAIConfig, AI_CONFIGS } from '@shared/ai-config';

export interface BrandAnalysisService {
  analyzeProject(shopDomain: string): Promise<BrandAnalysisResult>;
}

export interface BrandAnalysisResult {
  success: boolean;
  brandSummary?: BrandAnalysisResponse;
  error?: string;
}

const brandAnalysisSchema = z.object({
  colors: z.array(z.string()).max(6),
  fonts: z.array(z.string()).max(2),
  components: z.array(z.string()),
  voice: z.object({
    tone: z.string(),
    personality: z.string(),
    keyPhrases: z.array(z.string())
  }).optional(),
  designSystem: z.object({
    layout: z.string(),
    spacing: z.string(),
    typography: z.string(),
    colorScheme: z.string()
  }),
  brandPersonality: z.object({
    adjectives: z.array(z.string()),
    values: z.array(z.string()),
    targetAudience: z.string()
  }),
  recommendations: z.object({
    strengths: z.array(z.string()),
    opportunities: z.array(z.string())
  })
});

export class BrandAnalysisServiceImpl implements BrandAnalysisService {
  private aiConfig: ReturnType<typeof getAIConfig>;

  constructor(
    private crawler: CrawlerService
  ) {
    this.aiConfig = getAIConfig();
  }

  async analyzeBrand(request: BrandAnalysisRequest): Promise<BrandAnalysisResponse> {
    // Ensure screenshots are proper data URLs
    const toDataUrl = (b64: string): string => {
      if (!b64) return '';
      if (b64.startsWith('data:')) return b64;
      // Default to PNG
      return `data:image/png;base64,${b64}`;
    };

    const splitHtml = request.pages.html.map(html => html.split("</nav>")[1].split("footer")[0]);

    let regexFinds: string[] = [];
    const regex = /(?:<(?:p|h5|h6)[^>]*>(.+)<\/(?:p|h5|h6|\/)>.*)+/g;
    let m: RegExpExecArray | null;
    splitHtml.forEach((element) => {
      while ((m = regex.exec(element)) !== null) {
        const result = m[1];
        regexFinds.push(result);
      }
    });

    regexFinds = regexFinds.filter(item => item.length > 20 && !item.includes("cart") && !item.includes("EUR"));

    const prompt = this.buildBrandAnalysisPrompt(regexFinds.join("\n"));
    try {
      const result = await generateObject({
        model: openai(this.aiConfig.model),
        schema: brandAnalysisSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image', image: toDataUrl(request.pages.screenshot[0]) },
              { type: 'image', image: toDataUrl(request.pages.screenshot[1]) },
              { type: 'image', image: toDataUrl(request.pages.screenshot[2]) }
            ]
          }
        ],
        ...AI_CONFIGS.STRUCTURED_OUTPUT
      });

      return result.object;
    } catch (error) {
      throw new Error(`Failed to generate brand analysis: ${error}`);
    }
  }

  private buildBrandAnalysisPrompt(additionalInfo: string): string {
    return `
# Brand Analysis Request
Please analyze the attached images and provided context for this e-commerce store and provide a comprehensive brand analysis in the following JSON format:
Keep in mind that there might be notification popups about newsletters or cookies on the site, ignore these as much as possible except when looking at the global style of the site.
{
  "colors": ["color1", "color2", "color3", "color4", "color5", "color6"],
  "fonts": ["font1", "font2"],
  "components": ["Hero", "CTA", "Trust", "Reviews", "Navigation", "Footer"],
  "voice": {
    "tone": "professional|casual|friendly|authoritative",
    "personality": "description of brand personality",
    "keyPhrases": ["phrase1", "phrase2", "phrase3"]
  },
  "designSystem": {
    "layout": "description of layout approach",
    "spacing": "description of spacing patterns",
    "typography": "description of typography hierarchy",
    "colorScheme": "description of color usage"
  },
  "brandPersonality": {
    "adjectives": ["adjective1", "adjective2", "adjective3"],
    "values": ["value1", "value2", "value3"],
    "targetAudience": "description of target audience"
  },
  "recommendations": {
    "strengths": ["strength1", "strength2", "strength3"],
    "opportunities": ["opportunity1", "opportunity2", "opportunity3"]
  }
}

Focus on:
- Visual design elements and consistency
- Brand voice and messaging
- User experience patterns
- Target audience alignment
- Areas for improvement
- Strengths to build upon

Provide specific, actionable insights based on the provided content and screenshots.

The provided pages, which are a Home page, Products page and About page, of which you can find screenshots attached.
Use the provided images to get a good sense of the brand colors and brand looks.
Below you will find the context regarding the quotes and motivation of this brand:

${additionalInfo}
    `.trim();
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

      const response = { home: candidates[0], products: candidates[1], about: candidates[4] };
      //TODO: Replace with LLM call to choose candidates

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
      const brandSummary = await this.analyzeBrand(analysisRequest);

      return {
        success: true,
        brandSummary,
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
  crawler: CrawlerService
): BrandAnalysisService {
  return new BrandAnalysisServiceImpl(crawler);
}