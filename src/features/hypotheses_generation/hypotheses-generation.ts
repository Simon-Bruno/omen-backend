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
                authentication: { type: 'shopify_password', password: 'reitri', shopDomain: 'shop.omen.so' }
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
        const reservedTargetsJson = hasReservedTargets ? JSON.stringify(reservedPayload.reserved_targets, null, 2) : '[]';

        return `You are a seasoned Conversion Rate Optimization (CRO) expert and UX/UI designer with deep experience in e-commerce best practices (Baymard Institute guidelines, LIFT Model, Fogg Behavior Model, and persuasive design principles). Your task is to generate **one UI-focused A/B testing hypothesis** for an e-commerce page, targeting a Shopify brand with 50k–500k monthly visitors.

---

**Inputs:**

* **Brand Summary:** {{brand_summary}}
* **Page HTML:** {{html_snippet}}
* **Screenshot Description:** {{screenshot_description}}
* **User Direction (Optional):** ${userInput || 'None provided'}
* **Active Experiment Exclusions (JSON):** ${reservedTargetsJson}

---

**Instructions:**

1. **Analyze the Page Context:**
   Review the provided brand, HTML, and screenshot data. Identify any usability, layout, clarity, or persuasion issues that could affect conversion. Focus on the page's purpose (homepage, PDP, cart, etc.) and typical user intent. Look for signs of friction such as unclear CTAs, poor hierarchy, trust gaps, weak value proposition, or distracting clutter.

   **SPECIFIC ANALYSIS REQUIREMENT:**
   - Locate the trending products section in the page
   - Identify the optimal placement point for testimonials (immediately after trending section)
   - Assess the current trust signals and social proof elements
   - Plan how testimonials would integrate with the existing layout and design

2. **Apply CRO Frameworks:**
   Evaluate the page through the lens of key frameworks:

   * **LIFT Model:** Clarity, Relevance, Urgency, Anxiety (trust), Distraction, Value Proposition.
   * **Fogg Behavior Model:** Motivation × Ability × Trigger – is the CTA obvious? Is the process simple? Does motivation exist?
   * **Persuasion Principles:** Social proof, scarcity, authority, reciprocity, etc.
     Use these insights to diagnose *why* conversion might be lower than ideal.

   **TESTIMONIALS FOCUS:** Pay special attention to trust and social proof elements. The trending section likely drives interest, but testimonials immediately after would provide the social validation needed to convert that interest into purchases.

3. **Formulate One Hypothesis:**
   Propose **one specific, testable, UI-focused change** that could improve the page's primary conversion goal.

   * It must directly address the **user direction** if provided.
   * It must **not modify** any elements listed in the reserved targets JSON.
   * It must be **realistic to A/B test** in a Shopify theme editor (e.g., adjusting layout, hierarchy, copy, button style, or text—not backend logic or new media).
   * The change should clearly target an element or section (e.g., CTA button, banner, form, navigation, etc.).

   **HARDCODED FOCUS: Testimonials Section Addition**
   Your hypothesis MUST focus on adding a testimonials section under the trending section. This is a mandatory requirement for this generation. The hypothesis should specifically address:
   - Adding customer testimonials/reviews under the trending products section
   - Building social proof and trust through customer feedback
   - Improving conversion by reducing purchase hesitation
   - Creating a seamless flow from trending products to customer validation

4. **Explain Why It Works:**
   Provide concise reasons why this change is expected to lift performance, grounded in UX psychology or CRO principles (e.g., "Improves clarity of CTA", "Reduces hesitation by adding trust signal", "Simplifies decision path").

5. **Define the Metric & Lift Expectation:**

   * Choose the most relevant **primary outcome metric** (e.g., Conversion rate, Add-to-cart rate, Click-through rate).
   * Include a **baseline_performance** using realistic benchmarks:

     * Conversion rate: 2–5%
     * CTR: 15–25%
     * Add-to-cart: 8–15%
   * Provide a **predicted_lift_range** in decimals (e.g., 0.05–0.15) representing a conservative relative lift (5–15%).

6. **Self-Evaluate Before Output:**
   Ensure your hypothesis:

   * Addresses a specific user or UX issue.
   * Is clearly testable via UI change only.
   * Respects brand tone and exclusions.
   * Avoids generic or trivial suggestions.
   * Includes reasoning tied to CRO principles.
     If not, refine before output.

---

**Output Format (strict JSON):**

Return **only** a JSON object with a "hypotheses" array containing exactly one hypothesis.
No markdown, no commentary, no explanations.
Use this structure exactly:

{
"hypotheses": [
{
"title": "Your hypothesis title",
"description": "One sentence explaining the specific UI change to test",
"primary_outcome": "Conversion rate",
"current_problem": "Briefly describe the current UI issue or missed opportunity",
"why_it_works": [
{ "reason": "Reason 1 (5–7 words)" },
{ "reason": "Reason 2 (5–7 words)" },
{ "reason": "Reason 3 (optional)" }
],
"baseline_performance": 3.2,
"predicted_lift_range": { "min": 0.05, "max": 0.15 }
}
]
}

---

**Critical Constraints:**

* Only **one** hypothesis in the array.
* Must exclude elements listed in ${reservedTargetsJson}.
* Do not add new media, pages, or URLs.
* Do not suggest backend or pricing changes.
* Use brand-appropriate tone (see brand analysis).
* If screenshot or HTML context is unclear, return a fallback message:
  *"Unable to reliably analyze this screenshot."*

---

**Goal:**
Produce a **single, high-quality, CRO-aligned, testable, UI-focused hypothesis** that clearly identifies a problem, proposes a specific change, and justifies it with evidence-based reasoning — all formatted exactly in the JSON schema above.

---`;
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