// Hypotheses Generation Service
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { CrawlerService } from '@features/crawler';
import { z } from 'zod'
import { ProjectDAL } from '@infra/dal'

export interface HypothesesGenerationService {
    generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult>;
}

export interface HypothesesGenerationResult {
    hypothesesSchema: string;
}

// Factory function
export function createHypothesesGenerationService(
    crawler: CrawlerService
  ): HypothesesGenerationService {
    return new HypothesesGenerationServiceImpl(crawler);
  }

const hypothesisSchema = z.object({
    hypothesis: z.string(),
    rationale: z.string(),
    measurable_tests: z.string(),
    success_metrics: z.string(),
    oec: z.string(),
    accessibility_check: z.string()
});

const hypothesesResponseSchema = z.object({
    hypotheses: hypothesisSchema.array()
});


export class HypothesesGenerationServiceImpl implements HypothesesGenerationService {
    private crawlerService: CrawlerService;
    constructor(crawler: CrawlerService) {
        this.crawlerService = crawler;
    }

    async generateHypotheses(url: string, projectId: string): Promise<HypothesesGenerationResult> {
        const toDataUrl = (b64: string): string => {
            if (!b64) return '';
            if (b64.startsWith('data:')) return b64;
            return `data:image/png;base64,${b64}`;
        };

        const screenshot = await this.crawlerService.takePartialScreenshot(url, { width: 1920, height: 1080 }, true);

        const brandAnalysis = await ProjectDAL.getProjectBrandAnalysis(projectId);

        const object = await generateObject({
            model: openai('gpt-4o'),
            schema: hypothesesResponseSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: this.buildHypothesesGenerationPrompt() },
                        { type: "text", text: projectBrandAnalysis },
                        { type: "image", image: toDataUrl(screenshot) }
                    ]
                }
            ]
        });
        const response = object.object;
        console.log(response);
        return {
            hypothesesSchema: JSON.stringify(response)
        };

    }

    private buildHypothesesGenerationPrompt(): string {
        return `
You are an expert Conversion Rate Optimization (CRO) and UX/UI analyst. Your task is to analyze one or two screenshots of an e-commerce homepage or product detail page (PDP) from a Shopify store. Based on what you see, generate up to **two UI-focused hypotheses** that a merchant could test to improve conversions.

Your analysis must prioritize **clarity, testability, and accessibility**. You are not writing vague advice—you are producing **hypotheses that can be tested in A/B experiments** without requiring advanced CRO expertise.

---

**Detailed Requirements:**

1. **Input:**

    * The brand summary of this specific brand
    * 1-2 screenshots (desktop or mobile).
        * Assume screenshots may be imperfect (poor resolution, overlay banners, missing or duplicated CTAs, etc.).
   
2. **Output:**
   For each hypothesis, return a structured object with:

   * **Hypothesis (plain language, evidence-based):** A short statement identifying the UI issue and suggesting a testable change.
   * **Rationale (why it matters):** A clear explanation of the UX or CRO principle being applied (e.g., visual hierarchy, CTA prominence, contrast, spacing, imagery clarity).
   * **Measurable Test:** Define what to test (e.g., “Move primary CTA higher above the fold”).
   * **Success Metrics (KPIs):** At least one quantifiable outcome, such as: CTR on CTA, Add-to-Cart rate, Conversion rate, Scroll depth, Engagement with product images.
   * **OEC (Overall Evaluation Criterion):** The primary metric that determines success (usually conversion rate or add-to-cart).
   * **Accessibility Check:** Flag issues like low color contrast, unreadable text, small tap targets, missing alt text, or hidden CTAs.

3. **Constraints:**

   * Produce **at most 2 hypotheses** per set of screenshots.
   * Ensure recommendations are **UI-first** (not backend, pricing, or content strategy).
   * Handle edge cases gracefully:

     * If no CTA is visible, suggest adding one.
     * If multiple CTAs compete, suggest hierarchy improvements.
     * If screenshot quality is too poor to assess, return a fallback message: *“Unable to reliably analyze this screenshot.”*

4. **Style Guidelines:**

   * Use plain, non-jargon language understandable to merchants.
   * Be concise but specific—merchants should see exactly what they could test.
   * Avoid over-promising; these are hypotheses, not guarantees.`;
    }
}