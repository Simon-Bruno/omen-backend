import { ai } from '@infra/config/langsmith';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { getAIConfig } from '@shared/ai-config';


export interface InjectionPoint {
  selector: string;
  type: 'button' | 'text' | 'image' | 'container' | 'form' | 'navigation' | 'price' | 'title' | 'description';
  operation: 'append' | 'prepend' | 'insertBefore' | 'insertAfter' | 'replace' | 'wrap';
  confidence: number; // 0-1
  description: string;
}

// Schema for AI response
const injectionPointSchema = z.object({
  injectionPoints: z.array(z.object({
    selector: z.string().describe('CSS selector for the element'),
    type: z.enum(['button', 'text', 'image', 'container', 'form', 'navigation', 'price', 'title', 'description']),
    operation: z.enum(['append', 'prepend', 'insertBefore', 'insertAfter', 'replace', 'wrap']),
    confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
    description: z.string().describe('What this injection point is for')
  }))
});

export interface DOMAnalyzerService {
  analyzeForHypothesisWithHtml(
    url: string,
    hypothesis: string,
    projectId: string,
    htmlContent: string | null,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]>;
}

export class DOMAnalyzerServiceImpl implements DOMAnalyzerService {
  async analyzeForHypothesisWithHtml(
    _url: string,
    hypothesis: string,
    _projectId: string,
    htmlContent: string | null,
    _authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]> {
    console.log(`[DOM_ANALYZER] Starting analysis for hypothesis: ${hypothesis}`);

    if (!htmlContent) {
      console.log(`[DOM_ANALYZER] No HTML content provided - cannot analyze without existing HTML from screenshot`);
      return [];
    }

    console.log(`[DOM_ANALYZER] Using provided HTML content from screenshot: ${htmlContent.length} chars`);

    // Clean HTML for analysis
    const cleanedHtml = this.cleanHtmlForAnalysis(htmlContent);
    console.log(`[DOM_ANALYZER] Cleaned HTML: ${cleanedHtml.length} chars`);

    // Build prompt for AI
    const prompt = this.buildHypothesisFocusedPrompt(hypothesis, cleanedHtml);

    const aiConfig = getAIConfig();
    
    try {
      // Use AI to find injection points
      console.log(`[LANGSMITH] Starting AI call: DOM Analysis for hypothesis: ${hypothesis.substring(0, 50)}...`);
      const result = await ai.generateObject({
        model: google(aiConfig.model),
        schema: injectionPointSchema,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      console.log(`[LANGSMITH] Completed AI call: DOM Analysis - Found ${result.object.injectionPoints.length} injection points`);

      const injectionPoints = result.object.injectionPoints;
      console.log(`[DOM_ANALYZER] Found ${injectionPoints.length} injection points`);

      return injectionPoints;

    } catch (error) {
      console.error(`[DOM_ANALYZER] Error analyzing HTML content:`, error);
      return [];
    }
  }

  private cleanHtmlForAnalysis(html: string): string {
      const $ = cheerio.load(html);
    
    // Remove script tags, style tags, and other non-content elements
    $('script, style, noscript, meta, link[rel="stylesheet"]').remove();
    
    // Remove comments
    $.root().contents().filter(function() {
      return this.nodeType === 8; // Comment node
    }).remove();
    
    // Normalize href attributes to use relative paths only
    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && href.startsWith('http')) {
        // Convert absolute URLs to relative paths
        try {
          const url = new URL(href);
          $(element).attr('href', url.pathname + url.search + url.hash);
        } catch (e) {
          // If URL parsing fails, keep original href
        }
      }
    });
    
    // Clean up whitespace
    return $.html().replace(/\s+/g, ' ').trim();
  }

  private buildHypothesisFocusedPrompt(hypothesis: string, html: string): string {
    return `You are a DOM analyzer. Find injection points for this hypothesis:

HYPOTHESIS: ${hypothesis}

HTML CONTENT:
${html}

TASK: Find 1-3 injection points where we can add/modify elements to implement this hypothesis.

SELECTOR GENERATION RULES:
- You MUST analyze the HTML content and generate selectors that are GUARANTEED to work
- Prioritize selectors that uniquely identify the target element
- Use the most specific selector that still works reliably across environments
- These selectors will be used directly by document.querySelector() in the SDK
\n+STABILITY PRIORITIZATION (CRITICAL):
- Rank candidates by stability FIRST, then confidence
- STRONGLY PREFER stable class or [data-*] selectors over IDs
- If available, prefer in this order: ".ui-test-product-list" (container), "main#MainContent" (container)
- DO NOT choose Shopify dynamic section IDs that match "#shopify-section-template-*" unless no alternative exists
- When both stable and dynamic options exist, always choose the stable one

CRITICAL RULES:
- ONLY return CSS selectors that actually exist in the HTML above
- NEVER generate or invent selectors that don't exist
- For adding NEW elements, use 'append' or 'prepend' operation
- For modifying EXISTING elements, use 'replace' operation
- Be specific with selectors (avoid generic ones like 'div')
- Focus on elements mentioned in the hypothesis
- AVOID dynamic IDs like #shopify-section-template-* (these change between environments)
- PREFER stable selectors like .class-name or [data-*] attributes
- Use class-based selectors over ID-based selectors when possible

✅ FUNCTIONAL SELECTORS (guaranteed to work):
- ".hero__content-wrapper" (if this uniquely identifies the element)
- ".text-block" (if this uniquely identifies the element)
- ".hero__content-wrapper .text-block" (if both exist and this combination is unique)
- ".button" (if this uniquely identifies the element)
- "button" (if no class conflicts)

❌ UNRELIABLE SELECTORS (avoid these):
- ".text-block.text-block--ASG5LandCMk13OFhJQ__text_4bfhJq" (auto-generated, changes)
- ".hero__content-wrapper .rte-formatter.text-block" (complex, likely to break)
- ".some-made-up-class" (you invented this)
- "#shopify-section-template-123" (dynamic, changes between environments)
- "div" (too generic, matches everything)
\n+PREFERRED EXAMPLES (WHEN PRESENT IN HTML):
- ".ui-test-product-list" (high stability container for insertAfter)
- "main#MainContent" (stable container for append/prepend)

HREF ATTRIBUTE HANDLING (CRITICAL):
- When selecting elements with href attributes, use ONLY the relative path portion
- If HTML contains: <a href="/collections/all" class="button">
- Use selector: a.button[href="/collections/all"]
- NEVER use absolute URLs like href="https://domain.com/path" in selectors
- Extract only the path portion from href attributes
- Example: href="/collections/all" NOT href="https://shop.omen.so/collections/all"

EXAMPLES:
- If HTML contains: <div class="hero-section">
- Return selector: .hero-section
- NOT: .hero__content-wrapper (this doesn't exist)

- If HTML contains: <button class="btn-primary">
- Return selector: .btn-primary
- NOT: .btn-primary-large (this doesn't exist)

- If HTML contains: <a href="/collections/all" class="button">
- Return selector: a.button[href="/collections/all"]
- NOT: a.button[href="https://domain.com/collections/all"]

Return injection points as an array with selectors that actually exist in the HTML.`;
  }


}

export function createDOMAnalyzer(): DOMAnalyzerService {
  return new DOMAnalyzerServiceImpl();
}