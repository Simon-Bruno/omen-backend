import Firecrawl from '@mendable/firecrawl-js';
import { getPageSpecificPrompt, type PageType } from './prompts';
import { brandIntelligenceSchema, type BrandIntelligenceData } from './types';
import { z } from 'zod';


export interface FirecrawlScrapeResult {
  success: boolean;
  data?: BrandIntelligenceData;
  screenshot?: string;
  html?: string;
  markdown?: string;
  error?: string;
}


export interface PageAnalysisResult {
  pageType: PageType;
  url: string;
  data?: BrandIntelligenceData;
  screenshot?: string;
  html?: string;
  markdown?: string;
  error?: string;
}

export class FirecrawlService {
  private firecrawl: Firecrawl;

  constructor() {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY environment variable is required');
    }
    this.firecrawl = new Firecrawl({ apiKey });
  }

  /**
   * Extract colors from screenshot using Gemini 2.0 Flash and overwrite brand colors
   */
  async extractColorsFromScreenshot(screenshot: string, brandData: BrandIntelligenceData): Promise<BrandIntelligenceData> {
    try {
      console.log(`[FIRECRAWL] Extracting colors from screenshot using Gemini 2.0 Flash`);
      
      // Convert screenshot URL to base64 if needed
      const base64Screenshot = await this.convertScreenshotToBase64(screenshot);
      if (!base64Screenshot) {
        console.warn('[FIRECRAWL] Failed to convert screenshot to base64, using original brand colors');
        return brandData;
      }

      // Use Gemini 2.0 Flash to analyze the screenshot
      const prompt = `Analyze this website screenshot and extract ONLY the colors that are actually visible in the UI. 

CRITICAL RULES:
- Only extract colors you can actually see in the screenshot
- Do NOT make up or hallucinate colors that aren't visible
- Focus only on the current visual state of the page
- Extract 3-4 main brand colors that are actually used

Extract these colors ONLY if they are visible:
1. Primary brand color (main buttons, links, key UI elements)
2. Secondary color (secondary buttons, highlights, accents)
3. Text color (main body text)
4. Background color (main page background)

If a color type is not visible in the screenshot, use null for that field.`;

      // Import AI SDK
      const { generateObject } = await import('ai');
      const { google } = await import('@ai-sdk/google');

      // Create schema for color extraction
      const colorSchema = z.object({
        primary: z.string().nullable().describe('Primary brand color (hex) - only if visible'),
        secondary: z.string().nullable().describe('Secondary color (hex) - only if visible'),
        text: z.string().nullable().describe('Text color (hex) - only if visible'),
        background: z.string().nullable().describe('Background color (hex) - only if visible')
      });

      const result = await generateObject({
        model: google('gemini-2.0-flash-exp'),
        schema: colorSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: "text", text: prompt },
              { type: "image", image: base64Screenshot }
            ]
          }
        ]
      });

      // Convert extracted colors to brand_colors format
      const extractedColors = result.object;
      console.log(extractedColors);
      const brandColors = [];
      
      if (extractedColors.primary) {
        brandColors.push({
          color: 'Primary',
          description: 'Main brand color used in buttons and key UI elements',
          usage_type: 'primary' as const,
          hex_code: extractedColors.primary
        });
      }
      
      if (extractedColors.secondary) {
        brandColors.push({
          color: 'Secondary',
          description: 'Secondary color used for accents and highlights',
          usage_type: 'secondary' as const,
          hex_code: extractedColors.secondary
        });
      }
      
      if (extractedColors.text) {
        brandColors.push({
          color: 'Text',
          description: 'Main text color used for body content',
          usage_type: 'tertiary' as const,
          hex_code: extractedColors.text
        });
      }
      
      if (extractedColors.background) {
        brandColors.push({
          color: 'Background',
          description: 'Main background color of the page',
          usage_type: 'accent' as const,
          hex_code: extractedColors.background
        });
      }

      // If we have at least 3 colors, overwrite the brand colors
      if (brandColors.length >= 3) {
        console.log(`[FIRECRAWL] Overwriting brand colors with ${brandColors.length} screenshot-based colors`);
        return {
          ...brandData,
          brand_colors: brandColors
        };
      } else {
        console.warn(`[FIRECRAWL] Only extracted ${brandColors.length} colors, keeping original brand colors`);
        return brandData;
      }
    } catch (error) {
      console.error('[FIRECRAWL] Failed to extract colors from screenshot:', error);
      return brandData; // Return original data if extraction fails
    }
  }

  /**
   * Convert screenshot URL to base64 data
   */
  async convertScreenshotToBase64(screenshot: string): Promise<string | undefined> {
    if (!screenshot) {
      return undefined;
    }

    if (screenshot.startsWith('http')) {
      // If it's a URL, fetch the image and convert to base64
      try {
        const response = await fetch(screenshot);
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        console.log(`[FIRECRAWL] Converted screenshot URL to base64 (${base64.length} chars)`);
        return base64;
      } catch (error) {
        console.warn(`[FIRECRAWL] Failed to fetch screenshot from URL: ${error}`);
        return undefined;
      }
    } else {
      // Assume it's already base64
      return screenshot;
    }
  }

  /**
   * Generate Shopify password authentication actions for Firecrawl
   * Currently only supports omen-mvp.myshopify.com with password 'reitri'
   */
  private getShopifyAuthActions(websiteUrl: string): any[] {
    // Check if this is the omen-mvp shop domain
    if (!websiteUrl.includes('omen-mvp.myshopify.com')) {
      return [];
    }

    console.log(`[FIRECRAWL] Detected omen-mvp domain, enabling authentication`);

    return [
      { "type": "wait", "milliseconds": 1000 },
      {
        "type": "executeJavascript",
        "script": `
          document.getElementById('password').value = 'reitri';
          document.querySelector('form').submit();
        `
      },
      { "type": "wait", "milliseconds": 2000 },
      { "type": "wait", "milliseconds": 5000 }
    ];
  }

  async analyzePage(websiteUrl: string, pageType: PageType): Promise<PageAnalysisResult> {
    try {
      console.log(`[FIRECRAWL] Starting ${pageType} page analysis for: ${websiteUrl}`);

      const pageSpecificPrompt = getPageSpecificPrompt(pageType);
      const authActions = this.getShopifyAuthActions(websiteUrl);

      const scrapeOptions: any = {
        onlyMainContent: true,
        removeBase64Images: true,
        excludeTags: ['script', 'style', 'audio', 'dialog', 'form', 'button', 'input', 'select', 'textarea', 'iframe', 'embed', 'object', 'canvas', 'svg', 'noscript', 'meta', 'link', 'title'],
        formats: [
          {
            type: "json",
            schema: brandIntelligenceSchema,
            prompt: pageSpecificPrompt
          },
          {
            type: "screenshot",
            fullPage: true,
            quality: 100
          },
          "html",
          "markdown"
        ]
      };

      // Add authentication actions if enabled
      if (authActions.length > 0) {
        scrapeOptions.actions = authActions;
        console.log(`[FIRECRAWL] Using Shopify authentication for: ${websiteUrl}`);
      }

      const result = await this.firecrawl.scrape(websiteUrl, scrapeOptions);

      console.log(`[FIRECRAWL] ${pageType} page analysis completed for: ${websiteUrl}`);

      // Handle screenshot data - convert URL to base64 if needed
      const screenshotData = result.screenshot ? await this.convertScreenshotToBase64(result.screenshot) : undefined;

      // Extract brand data
      let brandData = result.json as BrandIntelligenceData;

      // If we have a screenshot, use it to overwrite the colors
      if (screenshotData) {
        console.log(`[FIRECRAWL] Using screenshot-based color extraction for: ${websiteUrl}`);
        brandData = await this.extractColorsFromScreenshot(screenshotData, brandData);
      }

      return {
        pageType,
        url: websiteUrl,
        data: brandData,
        screenshot: screenshotData,
        html: result.html,
        markdown: (result as any).markdown
      };
    } catch (error) {
      console.error(`[FIRECRAWL] Error analyzing ${pageType} page ${websiteUrl}:`, error);
      return {
        pageType,
        url: websiteUrl,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }


  async scrapeWebsite(websiteUrl: string): Promise<FirecrawlScrapeResult> {
    try {
      console.log(`[FIRECRAWL] Starting scrape for: ${websiteUrl}`);

      const authActions = this.getShopifyAuthActions(websiteUrl);

      const scrapeOptions: any = {
        onlyMainContent: true,
        removeBase64Images: true,
        excludeTags: ['script', 'style', 'audio', 'dialog', 'form', 'button', 'input', 'select', 'textarea', 'iframe', 'embed', 'object', 'canvas', 'svg', 'noscript', 'meta', 'link', 'title'],
        formats: [
          {
            type: "json",
            schema: brandIntelligenceSchema,
            prompt: getPageSpecificPrompt('home')
          },
          {
            type: "screenshot",
            fullPage: true,
            quality: 100
          },
          "html"
        ]
      };

      // Add authentication actions if enabled
      if (authActions.length > 0) {
        scrapeOptions.actions = authActions;
        console.log(`[FIRECRAWL] Using Shopify authentication for: ${websiteUrl}`);
      }

      const result = await this.firecrawl.scrape(websiteUrl, scrapeOptions);

      console.log(`[FIRECRAWL] Scrape completed for: ${websiteUrl}`);

      // Handle screenshot data - convert URL to base64 if needed
      const screenshotData = result.screenshot ? await this.convertScreenshotToBase64(result.screenshot) : undefined;

      return {
        success: true,
        data: result.json as BrandIntelligenceData,
        screenshot: screenshotData,
        html: result.html
      };
    } catch (error) {
      console.error(`[FIRECRAWL] Error scraping ${websiteUrl}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }


}
