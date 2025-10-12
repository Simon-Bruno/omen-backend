import { generateObject } from 'ai';
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
    const result = await generateObject({
      model: google(aiConfig.model),
      schema: injectionPointSchema,
      messages: [
        {
          role: 'user',
            content: prompt
        }
      ]
    });

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
    
    // Clean up whitespace
    return $.html().replace(/\s+/g, ' ').trim();
  }

  private buildHypothesisFocusedPrompt(hypothesis: string, html: string): string {
    return `You are a DOM analyzer. Find injection points for this hypothesis:

HYPOTHESIS: ${hypothesis}

HTML CONTENT:
${html}

TASK: Find 1-3 injection points where we can add/modify elements to implement this hypothesis.

RULES:
- Return CSS selectors that exist in the HTML
- For adding NEW elements, use 'append' or 'prepend' operation
- For modifying EXISTING elements, use 'replace' operation
- Be specific with selectors (avoid generic ones like 'div')
- Focus on elements mentioned in the hypothesis
- AVOID dynamic IDs like #shopify-section-template-* (these change between environments)
- PREFER stable selectors like .class-name or [data-*] attributes
- Use class-based selectors over ID-based selectors when possible

Return injection points as an array.`;
  }
}

export function createDOMAnalyzer(): DOMAnalyzerServiceImpl {
  return new DOMAnalyzerServiceImpl();
}