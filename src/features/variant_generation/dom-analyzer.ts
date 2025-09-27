// AI-Powered DOM Analysis Service for Variant Injection
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { CrawlerService } from '@features/crawler';
import { getAIConfig } from '@shared/ai-config';

// CSS selector validation utility
function isValidCSSSelector(selector: string): boolean {
  try {
    // Create a temporary element to test the selector
    const testElement = document.createElement('div');
    testElement.querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

// Clean selector by removing invalid parts like :contains()
function cleanCSSSelector(selector: string): string {
  // Remove :contains() pseudo-selector and similar invalid selectors
  return selector
    .replace(/:contains\([^)]*\)/g, '') // Remove :contains() pseudo-selector
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Removed unused DOMAnalysisResult interface

export interface InjectionPoint {
  type: 'button' | 'text' | 'image' | 'container' | 'form' | 'navigation' | 'price' | 'title' | 'description';
  selector: string;
  confidence: number; // 0-1, how confident we are this selector will work
  description: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  alternativeSelectors: string[]; // Fallback selectors
  context: string; // What this element is used for (e.g., "main call-to-action button")
  reasoning: string; // Why this selector was chosen
  hypothesis: string; // The hypothesis this was found for
  url: string; // The URL this was found on
  timestamp: string; // When this was created
  tested: boolean; // Whether this selector has been tested
  successRate?: number; // Success rate if tested multiple times
}

// Removed unused PageStructure interface

// Zod schemas for AI response
const injectionPointSchema = z.object({
  type: z.enum(['button', 'text', 'image', 'container', 'form', 'navigation', 'price', 'title', 'description']),
  selector: z.string().describe('CSS selector that reliably targets this element'),
  confidence: z.number().min(0).max(1).describe('Confidence level (0-1) that this selector will work'),
  description: z.string().describe('Human-readable description of this element'),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }),
  alternativeSelectors: z.array(z.string()).describe('Alternative CSS selectors as fallbacks'),
  context: z.string().describe('What this element is used for in the page context'),
  reasoning: z.string().describe('Detailed explanation of why this selector was chosen and why it should work reliably')
});

// Removed unused schemas - we only need injectionPointSchema for this service

export interface DOMAnalyzerService {
  analyzeForHypothesis(
    url: string, 
    hypothesis: string,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]>;
}

export class DOMAnalyzerServiceImpl implements DOMAnalyzerService {
  constructor(private crawlerService: CrawlerService) {}

  async analyzeForHypothesis(
    url: string, 
    hypothesis: string,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]> {
    console.log(`[DOM_ANALYZER] Analyzing page for hypothesis: "${hypothesis}"`);
    
    // Get page HTML and screenshot
    const crawlResult = await this.crawlerService.crawlPage(url, {
      viewport: { width: 1920, height: 1080 },
      waitFor: 3000,
      screenshot: { fullPage: true, quality: 80 },
      authentication
    });

    if (crawlResult.error) {
      throw new Error(`Failed to crawl page: ${crawlResult.error}`);
    }

    const toDataUrl = (b64: string): string => {
      if (!b64) return '';
      if (b64.startsWith('data:')) return b64;
      return `data:image/png;base64,${b64}`;
    };

    // Optimize HTML for AI analysis
    const optimizedHTML = this.optimizeHTMLForAnalysis(crawlResult.html, hypothesis);
    console.log(`[DOM_ANALYZER] Optimized HTML from ${crawlResult.html.length} to ${optimizedHTML.length} characters`);

    // Use AI to find specific injection points for this hypothesis
    const aiConfig = getAIConfig();
    const result = await generateObject({
      model: google(aiConfig.model),
      schema: z.object({
        injectionPoints: z.array(injectionPointSchema)
      }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: this.buildHypothesisFocusedPrompt(hypothesis) },
            { type: 'text', text: `HTML Content:\n${optimizedHTML}` },
            { type: 'image', image: toDataUrl(crawlResult.screenshot) }
          ]
        }
      ]
    });

    // Add metadata to injection points and validate/clean selectors
    const enrichedInjectionPoints = result.object.injectionPoints.map(point => {
      // Clean the primary selector
      const cleanedSelector = cleanCSSSelector(point.selector);
      
      // Clean alternative selectors
      const cleanedAlternatives = point.alternativeSelectors.map(cleanCSSSelector);
      
      // Validate selectors and log warnings for invalid ones
      if (!isValidCSSSelector(cleanedSelector)) {
        console.warn(`[DOM_ANALYZER] Invalid primary selector detected: "${point.selector}" -> cleaned to: "${cleanedSelector}"`);
      }
      
      cleanedAlternatives.forEach((alt, index) => {
        if (!isValidCSSSelector(alt)) {
          console.warn(`[DOM_ANALYZER] Invalid alternative selector ${index + 1}: "${point.alternativeSelectors[index]}" -> cleaned to: "${alt}"`);
        }
      });
      
      return {
        ...point,
        selector: cleanedSelector,
        alternativeSelectors: cleanedAlternatives,
        hypothesis,
        url,
        timestamp: new Date().toISOString(),
        tested: false,
        successRate: undefined
      };
    });

    console.log(`[DOM_ANALYZER] Found ${enrichedInjectionPoints.length} injection points for hypothesis`);
    console.log(`[DOM_ANALYZER] Injection points:`, enrichedInjectionPoints.map(p => ({
      type: p.type,
      selector: p.selector,
      confidence: p.confidence,
      reasoning: p.reasoning.substring(0, 100) + '...'
    })));

    return enrichedInjectionPoints;
  }

  private optimizeHTMLForAnalysis(html: string, hypothesis: string): string {
    // Extract key elements based on hypothesis keywords
    const hypothesisKeywords = this.extractKeywordsFromHypothesis(hypothesis);
    
    // Remove unnecessary content to reduce size
    let optimized = html
      // Remove comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Remove script tags (keep data attributes)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Remove style tags (keep inline styles)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove empty lines
      .replace(/\n\s*\n/g, '\n');

    // Extract relevant sections based on hypothesis
    const relevantSections = this.extractRelevantSections(optimized, hypothesisKeywords);
    
    // Limit total size to prevent token overflow
    const maxLength = 50000; // ~12k tokens
    if (relevantSections.length > maxLength) {
      return relevantSections.substring(0, maxLength) + '\n\n... [HTML truncated for analysis]';
    }
    
    return relevantSections;
  }

  private extractKeywordsFromHypothesis(hypothesis: string): string[] {
    const keywords = [];
    const text = hypothesis.toLowerCase();
    
    // Common e-commerce elements
    if (text.includes('button') || text.includes('cta') || text.includes('click')) {
      keywords.push('button', 'cta', 'click', 'submit', 'add to cart', 'buy now');
    }
    if (text.includes('price') || text.includes('cost') || text.includes('money')) {
      keywords.push('price', 'cost', 'money', 'dollar', 'euro', 'currency');
    }
    if (text.includes('title') || text.includes('heading') || text.includes('headline')) {
      keywords.push('title', 'heading', 'headline', 'h1', 'h2', 'h3');
    }
    if (text.includes('image') || text.includes('photo') || text.includes('picture')) {
      keywords.push('image', 'photo', 'picture', 'img', 'gallery');
    }
    if (text.includes('form') || text.includes('input') || text.includes('field')) {
      keywords.push('form', 'input', 'field', 'email', 'name', 'address');
    }
    if (text.includes('navigation') || text.includes('menu') || text.includes('nav')) {
      keywords.push('navigation', 'menu', 'nav', 'header', 'footer');
    }
    
    return keywords;
  }

  private extractRelevantSections(html: string, keywords: string[]): string {
    // Extract sections that contain relevant keywords
    const sections = [];
    
    // Always include the main structure
    const mainMatch = html.match(/<main[^>]*>[\s\S]*?<\/main>/i);
    if (mainMatch) sections.push(mainMatch[0]);
    
    // Look for sections containing keywords
    for (const keyword of keywords) {
      const regex = new RegExp(`<[^>]*${keyword}[^>]*>[\s\S]*?<\/[^>]*>`, 'gi');
      const matches = html.match(regex);
      if (matches) {
        sections.push(...matches);
      }
    }
    
    // Include header and footer for context
    const headerMatch = html.match(/<header[^>]*>[\s\S]*?<\/header>/i);
    if (headerMatch) sections.push(headerMatch[0]);
    
    const footerMatch = html.match(/<footer[^>]*>[\s\S]*?<\/footer>/i);
    if (footerMatch) sections.push(footerMatch[0]);
    
    // Remove duplicates and join
    const uniqueSections = [...new Set(sections)];
    return uniqueSections.join('\n\n');
  }

  private buildHypothesisFocusedPrompt(hypothesis: string): string {
    return `
You are a DOM analysis expert. Your task is to find the specific elements on this webpage that are relevant to testing this hypothesis:

HYPOTHESIS: "${hypothesis}"

ANALYSIS TASK:
1. Look at the screenshot and HTML to identify the specific elements mentioned in the hypothesis
2. Find reliable CSS selectors that target those elements
3. Provide alternative selectors as fallbacks
4. Estimate confidence levels for each selector
5. Explain your reasoning for each selector choice

SELECTOR REQUIREMENTS:
- Use the most specific and reliable selectors possible
- Prefer IDs, data attributes, and semantic selectors over class names
- Avoid selectors that might change (like generated class names)
- Provide 2-3 alternative selectors for each element
- Focus only on elements relevant to the hypothesis
- NEVER use :contains() pseudo-selector - it's not valid CSS
- Use only standard CSS selectors that work with querySelectorAll()
- For text-based selection, use attribute selectors or data attributes instead

CONFIDENCE SCORING:
- 0.9-1.0: Very reliable (ID, data attributes, semantic elements)
- 0.7-0.8: Good (stable class names, specific selectors)
- 0.5-0.6: Moderate (might work but could break)
- 0.0-0.4: Low (likely to break)

REASONING REQUIREMENTS:
For each injection point, provide detailed reasoning that explains:
- Why this specific selector was chosen
- What makes it reliable (or unreliable)
- What could cause it to break
- Why the alternative selectors are good fallbacks
- Any assumptions made about the page structure

Return only the elements that are directly relevant to testing this hypothesis. Don't include general page elements unless they're specifically mentioned in the hypothesis.
`;
  }
}

// Factory function
export function createDOMAnalyzer(crawler: CrawlerService): DOMAnalyzerService {
  return new DOMAnalyzerServiceImpl(crawler);
}
