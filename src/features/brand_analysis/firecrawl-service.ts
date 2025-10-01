import Firecrawl from '@mendable/firecrawl-js';
import { getPageSpecificPrompt, type PageType } from './prompts';
import { brandIntelligenceSchema, type BrandIntelligenceData } from './types';


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
   * Convert screenshot URL to base64 data
   */
  private async convertScreenshotToBase64(screenshot: string): Promise<string | undefined> {
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

      return {
        pageType,
        url: websiteUrl,
        data: result.json as BrandIntelligenceData,
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
