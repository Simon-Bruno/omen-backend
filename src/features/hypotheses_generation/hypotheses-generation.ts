// Hypotheses Generation Service
//
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { CrawlerService } from '@features/crawler';
import { z } from 'zod'
import { ProjectDAL, ExperimentDAL } from '@infra/dal'
import { getAIConfig } from '@shared/ai-config'
import type { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { simplifyHTML, getHtmlInfo } from '@shared/utils/html-simplifier';
import { toReservedPayload } from '@features/conflict_guard';
import { HIGH_QUALITY_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

export interface HypothesesGenerationService {
    generateHypotheses(url: string, projectId: string, userInput?: string): Promise<HypothesesGenerationResult>;
}

export interface HypothesesGenerationResult {
    hypothesesSchema: string;
}

// Factory function
export function createHypothesesGenerationService(
    crawler: CrawlerService,
    prisma: PrismaClient
): HypothesesGenerationService {
    return new HypothesesGenerationServiceImpl(crawler, prisma);
}

const hypothesisSchema = z.object({
    title: z.string(),
    description: z.string(), // 1 Sentence clear breakdown of the hypothesis
    primary_outcome: z.string().max(20, "Primary outcome must be concise"), // This is the OEC, keep it concise
    current_problem: z.string(), // 1 Sentence clear breakdown of the current problem
    why_it_works: z.array(z.object({
        reason: z.string() // Sentence of 5/7 words why this reason works
    })),
    baseline_performance: z.number(), // Baseline performance in percentage (realistic approximation)
    predicted_lift_range: z.object({
        min: z.number(), // Decimal
        max: z.number() // Decimal
    })
})

const hypothesesResponseSchema = z.object({
    hypotheses: z.array(hypothesisSchema)
});


export class HypothesesGenerationServiceImpl implements HypothesesGenerationService {
    private crawlerService: CrawlerService;
    private screenshotStorage: ScreenshotStorageService;

    constructor(crawler: CrawlerService, _prisma: PrismaClient) {
        this.crawlerService = crawler;
        this.screenshotStorage = createScreenshotStorageService();
    }

    async generateHypotheses(url: string, projectId: string, userInput?: string): Promise<HypothesesGenerationResult> {
        console.log(`[HYPOTHESES] Starting generation for URL: ${url}, Project: ${projectId}`);

        if (userInput) {
            console.log(`[HYPOTHESES] User provided input: "${userInput}"`);
        }

        const toDataUrl = (b64: string): string => {
            if (!b64) return '';
            if (b64.startsWith('data:')) return b64;
            return `data:image/png;base64,${b64}`;
        };

        // Check storage first
        const pageType = this.getPageType(url);
        const cachedScreenshot = await this.screenshotStorage.getScreenshot(
            projectId,
            pageType,
            HIGH_QUALITY_SCREENSHOT_OPTIONS
        );

        let screenshot: string;
        let htmlContent: string | undefined;
        
        if (cachedScreenshot) {
            console.log(`[HYPOTHESES] Using stored screenshot for ${pageType} page`);
            screenshot = cachedScreenshot;
            // Try to get cached HTML content
            const cachedData = await this.screenshotStorage.getScreenshotWithHtml(projectId, pageType, HIGH_QUALITY_SCREENSHOT_OPTIONS);
            htmlContent = cachedData?.html || undefined;
        } else {
            console.log(`[HYPOTHESES] Taking new screenshot and HTML for ${url}`);
            const crawlResult = await this.crawlerService.crawlPage(url, {
                viewport: { width: 1920, height: 1080 },
                waitFor: 3000,
                screenshot: { fullPage: true, quality: 80 },
                authentication: { type: 'shopify_password', password: 'reitri', shopDomain: 'omen-mvp.myshopify.com' }
            });

            screenshot = crawlResult.screenshot || '';
            htmlContent = crawlResult.html;

            // Store the new screenshot and HTML
            if (crawlResult.html) {
                const simplifiedHtml = simplifyHTML(crawlResult.html);
                const screenshotId = await this.screenshotStorage.saveScreenshot(
                    projectId,
                    pageType,
                    url,
                    HIGH_QUALITY_SCREENSHOT_OPTIONS,
                    screenshot,
                    simplifiedHtml
                );
                console.log(`[HYPOTHESES] Screenshot and HTML saved with ID: ${screenshotId} (${getHtmlInfo(simplifiedHtml)})`);
            } else {
                const screenshotId = await this.screenshotStorage.saveScreenshot(
                    projectId,
                    pageType,
                    url,
                    HIGH_QUALITY_SCREENSHOT_OPTIONS,
                    screenshot
                );
                console.log(`[HYPOTHESES] Screenshot saved with ID: ${screenshotId}`);
            }
        }

        console.log(`[HYPOTHESES] Screenshot ready, length: ${screenshot.length}`);

        console.log(`[HYPOTHESES] Fetching brand analysis for project: ${projectId}`);
        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);
        console.log(`[HYPOTHESES] Brand analysis result:`, brandAnalysis ? `length: ${brandAnalysis.length}` : 'null');

        if (!brandAnalysis) {
            console.warn(`[HYPOTHESES] No brand analysis found for project: ${projectId}`);
            throw new Error(`No brand analysis available for project ${projectId}. Please run brand analysis first.`);
        }

        // Get active experiment targets for conflict avoidance
        console.log(`[HYPOTHESES] Fetching active experiment targets for conflict checking`);
        const activeTargets = await ExperimentDAL.getActiveTargets(projectId);
        const reservedPayload = toReservedPayload(url, activeTargets);
        console.log(`[HYPOTHESES] Found ${activeTargets.length} active targets to avoid`);

        console.log(`[HYPOTHESES] Generating AI response with Google Gemini`);
        const aiConfig = getAIConfig();
        const result = await generateObject({
            model: google(aiConfig.model),
            schema: hypothesesResponseSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: this.buildHypothesesGenerationPrompt(reservedPayload, userInput) },
                        { type: "text", text: brandAnalysis },
                        { type: "text", text: htmlContent ? `HTML STRUCTURE:\n${this.cleanHtmlForAnalysis(htmlContent)}` : 'No HTML structure available' },
                        { type: "image", image: toDataUrl(screenshot) }
                    ]
                }
            ]
        });
        const response = result.object;
        console.log(`[HYPOTHESES] AI response generated: ${response.hypotheses.length} hypotheses`);
        return {
            hypothesesSchema: JSON.stringify(response)
        };

    }

    private buildHypothesesGenerationPrompt(reservedPayload?: any, userInput?: string): string {
        const hasReservedTargets = reservedPayload?.reserved_targets?.length > 0;

        const conflictSection = hasReservedTargets ? `

**IMPORTANT - ACTIVE EXPERIMENTS TO AVOID:**
The following elements are currently being tested in active experiments. DO NOT propose changes to these elements:
${JSON.stringify(reservedPayload.reserved_targets, null, 2)}

When generating hypotheses:
- Avoid any changes to the reserved targets listed above
- Focus on different page elements or sections
- If a primary CTA is reserved, suggest testing secondary elements
` : '';

        const userInputSection = userInput ? `

**USER PROVIDED HYPOTHESIS DIRECTION (MANDATORY - HIGHEST PRIORITY):**
The user has specifically requested to test the following:
"${userInput}"

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
1. Your hypothesis MUST directly address the user's specific request
2. If they mention "footer" - the hypothesis MUST focus on the footer
3. If they mention "CTA" or "call to action" - the hypothesis MUST include adding or improving CTAs
4. If they mention a specific element or area - that MUST be the focus of your hypothesis
5. DO NOT generate a generic hypothesis that ignores their input
6. Refine and structure their idea professionally while keeping their core intent
7. Make it specific, measurable, and aligned with CRO best practices
8. Incorporate brand analysis to strengthen the hypothesis
9. If conflicts exist with reserved targets, adapt while maintaining the user's core idea

The user's input is the HIGHEST PRIORITY - your hypothesis must clearly reflect what they asked for.
` : '';

        return `
You are an expert Conversion Rate Optimization (CRO) and UX/UI analyst. Your task is to analyze screenshots AND HTML structure of an e-commerce homepage or product detail page (PDP) from a Shopify store. Based on what you see, generate **one UI-focused hypothesis** that a merchant could test to improve conversions.

Your analysis must prioritize **clarity, testability, and accessibility**. Only suggest **hypotheses suitable for A/B testing by merchants** without requiring advanced CRO skills.

${conflictSection}${userInputSection}

**CRITICAL: Analyze the current state first**
Before suggesting any changes, carefully examine:
1. **Current HTML structure** - What elements already exist and how are they implemented?
2. **Existing interactions** - Are elements already clickable? Do they have hover states?
3. **Layout constraints** - Where would new elements fit? Would they break the design?
4. **Current user flow** - How do users currently navigate? What's already working?

**Temporary Focus Exclusions:**  
Do NOT focus your hypothesis on the homepage hero section or any main/above-the-fold CTA (e.g., primary "Shop now" button). Look for other UI opportunities.


---

**Detailed Requirements:**

1. **Input:**

    * The brand summary of this specific brand
    * 1-2 screenshots (desktop or mobile).
        * Assume screenshots may be imperfect (poor resolution, overlay banners, missing or duplicated CTAs, etc.).
   
2. **Output:**
   For each hypothesis, return a structured object with:

   * **title:** A concise, descriptive title for the hypothesis (e.g., "Improve CTA Button Visibility")
   * **description:** One clear sentence explaining the hypothesis and what change to test
   * **primary_outcome:** The main metric that determines success - keep it concise (e.g., "Click-through rate", "Conversion rate", "Add-to-cart rate")
   * **current_problem:** One sentence describing the current UI issue or opportunity
   * **why_it_works:** Array of 2-3 reasons (5-7 words each) explaining why this change should work
   * **baseline_performance:** Current performance as a percentage - use realistic e-commerce benchmarks based on the specific metric (e.g., 2-5% for conversion rate, 15-25% for click-through rate, 8-15% for add-to-cart rate)
   * **predicted_lift_range:** Expected improvement range with min and max values as decimals (e.g., 0.05 to 0.15 for 5-15% lift)

3. **Constraints:**

   * Produce **exactly 1 hypothesis** per set of screenshots, but return it as an array with one element.
   * Ensure recommendations are **UI-first** (not backend, pricing, or content strategy).
   * Handle edge cases gracefully:

     * If no CTA is visible, suggest adding one.
     * If multiple CTAs compete, suggest hierarchy improvements.
     * If screenshot quality is too poor to assess, return a fallback message: *"Unable to reliably analyze this screenshot."*

4. **Style Guidelines:**

   * Use plain, non-jargon language understandable to merchants.
   * Be concise but specific—merchants should see exactly what they could test.
   * Avoid over-promising; these are hypotheses, not guarantees.
   * For baseline_performance, use realistic e-commerce benchmarks based on the specific metric:
     - Conversion rate: 2-5% (typical e-commerce range)
     - Click-through rate: 15-25% (for buttons/links)
     - Add-to-cart rate: 8-15% (for product pages)
     - Email signup rate: 1-3% (for newsletter forms)
     - Bounce rate: 40-60% (higher is worse)
   * For predicted_lift_range, be conservative but optimistic (typically 5-25% improvement)
   * Primary outcome should be concise - use clear metric names like "Click-through rate", "Conversion rate", "Add-to-cart rate"

5. **Guardrails (critical):**
   * Do NOT propose adding new images, videos, or external assets; leverage existing assets and DOM structure.
   * Do NOT propose changing where links point (hrefs) or inventing new URLs; keep navigation targets unchanged.
   * If an idea would require new media or URL changes, explicitly call out that those parts should be skipped and focus the hypothesis on text, layout, style, hierarchy, visibility, or state changes.

**IMPORTANT JSON FORMAT:**
Return your response as a JSON object with a "hypotheses" array containing exactly 1 hypothesis object. The structure should be:
{
  "hypotheses": [
    {
      "title": "Your hypothesis title",
      "description": "Your hypothesis description",
      "primary_outcome": "Click-through rate",
      "current_problem": "Current problem description",
      "why_it_works": [
        {"reason": "First reason why it works"},
        {"reason": "Second reason why it works"}
      ],
      "baseline_performance": 15.5,
      "predicted_lift_range": {
        "min": 0.05,
        "max": 0.15
      }
    }
  ]
}`;
    }

    private getPageType(url: string): 'home' | 'pdp' | 'about' | 'other' {
        const urlLower = url.toLowerCase();

        // Check for product pages first
        if (urlLower.includes('/products/') || urlLower.includes('/collections/')) {
            return 'pdp';
        }

        // Check for about pages
        if (urlLower.includes('/about')) {
            return 'about';
        }

        // Check for home page - this should be the most common case
        // Home page is typically just the domain or domain with trailing slash
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;

        // If no path or just a trailing slash, it's the home page
        if (!pathname || pathname === '/' || pathname === '') {
            return 'home';
        }

        // If path is just common home page indicators
        if (pathname === '/home' || pathname === '/index' || pathname === '/index.html') {
            return 'home';
        }

        return 'other';
    }

    // Clean HTML for analysis - remove scripts, styles, and clean whitespace
    private cleanHtmlForAnalysis(html: string): string {
        try {
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);

            // Get cleaned HTML and clean up whitespace
            let cleaned = $.html();

            // Simple whitespace cleanup
            cleaned = cleaned
                .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
                .replace(/>\s+</g, '><')  // Remove spaces between tags
                .trim();

            return cleaned;
        } catch (_error) {
            // Fallback: simple whitespace cleanup
            return html
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .trim();
        }
    }
}