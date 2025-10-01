// Hypotheses Generation Service
// 
// HARDCODED ELEMENT FOCUS:
// To enable/disable hardcoded element focus, change the HARDCODE_ELEMENT_FOCUS flag in HypothesesGenerationServiceImpl
// When enabled, hypotheses will focus specifically on the TARGET_ELEMENT defined in the class
//
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { CrawlerService } from '@features/crawler';
import { z } from 'zod'
import { ProjectDAL, ExperimentDAL } from '@infra/dal'
import { getAIConfig } from '@shared/ai-config'
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { simplifyHTML, getHtmlInfo } from '@shared/utils/html-simplifier';
import { toReservedPayload } from '@features/conflict_guard';
import { STANDARD_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

export interface HypothesesGenerationService {
    generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult>;
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
    primary_outcome: z.string(), // This is the OEC, later add KPIs
    current_problem: z.string(), // 1 Sentence clear breakdown of the current problem
    why_it_works: z.array(z.object({
        reason: z.string() // Sentence of 5/7 words why this reason works
    })),
    baseline_performance: z.number(), // Baseline performance in percentage
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
    
    // Hardcoded element focus configuration - can be easily toggled
    private readonly HARDCODE_ELEMENT_FOCUS = true;
    private readonly TARGET_ELEMENT = {
        selector: 'a[href="/collections/all"].size-style.link',
        description: 'Shop all → button/link',
        html: '<a href="/collections/all" class="size-style link link--ARGpDamJzVW9Gd2JMa__button_nazDaa" style="--size-style-width: fit-content;--size-style-height: ;--size-style-width-mobile: fit-content; --size-style-width-mobile-min: fit-content;">Shop all →</a>'
    };

    constructor(crawler: CrawlerService, prisma: PrismaClient) {
        this.crawlerService = crawler;
        this.screenshotStorage = createScreenshotStorageService(prisma);
    }

    async generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult> {
        console.log(`[HYPOTHESES] Starting generation for URL: ${url}, Project: ${projectId}`);
        
        if (this.HARDCODE_ELEMENT_FOCUS) {
            console.log(`[HYPOTHESES] HARDCODED ELEMENT FOCUS ENABLED - Targeting: ${this.TARGET_ELEMENT.description}`);
            console.log(`[HYPOTHESES] Target selector: ${this.TARGET_ELEMENT.selector}`);
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
            STANDARD_SCREENSHOT_OPTIONS
        );

        let screenshot: string;
        if (cachedScreenshot) {
            console.log(`[HYPOTHESES] Using stored screenshot for ${pageType} page`);
            screenshot = cachedScreenshot;
        } else {
            console.log(`[HYPOTHESES] Taking new screenshot and HTML for ${url}`);
            const crawlResult = await this.crawlerService.crawlPage(url, {
                viewport: { width: 1920, height: 1080 },
                waitFor: 3000,
                screenshot: { fullPage: true, quality: 80 },
                authentication: { type: 'shopify_password', password: 'reitri', shopDomain: 'omen-mvp.myshopify.com' }
            });

            screenshot = crawlResult.screenshot || '';

            // Store the new screenshot and HTML
            if (crawlResult.html) {
                const simplifiedHtml = simplifyHTML(crawlResult.html);
                const screenshotId = await this.screenshotStorage.saveScreenshot(
                    projectId,
                    pageType,
                    url,
                    STANDARD_SCREENSHOT_OPTIONS,
                    screenshot,
                    simplifiedHtml
                );
                console.log(`[HYPOTHESES] Screenshot and HTML saved with ID: ${screenshotId} (${getHtmlInfo(simplifiedHtml)})`);
            } else {
                const screenshotId = await this.screenshotStorage.saveScreenshot(
                    projectId,
                    pageType,
                    url,
                    STANDARD_SCREENSHOT_OPTIONS,
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
                        { type: "text", text: this.buildHypothesesGenerationPrompt(reservedPayload) },
                        { type: "text", text: brandAnalysis },
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

    private buildHypothesesGenerationPrompt(reservedPayload?: any): string {
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

        const hardcodedElementSection = this.HARDCODE_ELEMENT_FOCUS ? `

**SPECIFIC ELEMENT FOCUS (HARDCODED):**
You MUST focus your hypothesis on this specific element:
- Element: ${this.TARGET_ELEMENT.description}
- CSS Selector: ${this.TARGET_ELEMENT.selector}
- HTML: ${this.TARGET_ELEMENT.html}

Your hypothesis should specifically address this element and suggest improvements to it. Look for this element in the screenshot and base your hypothesis on what you observe about its current state, visibility, styling, or positioning.
` : '';

        return `
You are an expert Conversion Rate Optimization (CRO) and UX/UI analyst. Your task is to analyze one or two screenshots of an e-commerce homepage or product detail page (PDP) from a Shopify store. Based on what you see, generate **one UI-focused hypothesis** that a merchant could test to improve conversions.

Your analysis must prioritize **clarity, testability, and accessibility**. You are not writing vague advice—you are producing **hypotheses that can be tested in A/B experiments** without requiring advanced CRO expertise.
${conflictSection}${hardcodedElementSection}

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
   * **primary_outcome:** The main metric that determines success (e.g., "Increase conversion rate", "Improve add-to-cart rate")
   * **current_problem:** One sentence describing the current UI issue or opportunity
   * **why_it_works:** Array of 2-3 reasons (5-7 words each) explaining why this change should work
   * **baseline_performance:** Current performance as a percentage (estimate based on typical e-commerce metrics)
   * **predicted_lift_range:** Expected improvement range with min and max values as decimals (e.g., 0.05 to 0.15 for 5-15% lift)

3. **Constraints:**

   * Produce **exactly 1 hypothesis** per set of screenshots.
   * Ensure recommendations are **UI-first** (not backend, pricing, or content strategy).
   * Handle edge cases gracefully:

     * If no CTA is visible, suggest adding one.
     * If multiple CTAs compete, suggest hierarchy improvements.
     * If screenshot quality is too poor to assess, return a fallback message: *"Unable to reliably analyze this screenshot."*

4. **Style Guidelines:**

   * Use plain, non-jargon language understandable to merchants.
   * Be concise but specific—merchants should see exactly what they could test.
   * Avoid over-promising; these are hypotheses, not guarantees.
   * For baseline_performance, use realistic e-commerce benchmarks (e.g., 2-5% for conversion rate)
   * For predicted_lift_range, be conservative but optimistic (typically 5-25% improvement)`;
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
}