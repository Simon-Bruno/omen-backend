// AI-Powered DOM Analysis Service for Variant Injection
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { CrawlerService } from '@features/crawler';
import { getAIConfig } from '@shared/ai-config';
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { simplifyHTML, simplifyHTMLForForensics, getHtmlInfo } from '@shared/utils/html-simplifier';
import * as cheerio from 'cheerio';
import { STANDARD_SCREENSHOT_OPTIONS } from '@shared/screenshot-config';

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


// Get detailed information about selector matches for debugging
function getSelectorMatchInfo(selector: string, html: string): { found: boolean; count: number; elements: string[] } {
  try {
    const $ = cheerio.load(html);
    const elements = $(selector);
    
    const elementInfo = elements.map((_, el) => {
      const tagName = el.type === 'tag' ? el.name : 'unknown';
      const classes = $(el).attr('class') || '';
      const id = $(el).attr('id') || '';
      return `${tagName}${id ? `#${id}` : ''}${classes ? `.${classes.split(' ').join('.')}` : ''}`;
    }).get();
    
    return {
      found: elements.length > 0,
      count: elements.length,
      elements: elementInfo
    };
  } catch (error) {
    return {
      found: false,
      count: 0,
      elements: []
    };
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
  originalText?: string; // Original text content of the element (for text length considerations)
}

// Removed unused PageStructure interface

// Simplified schema for variant injection - only what we actually need
const elementFoundSchema = z.object({
  css_selector: z.string().describe('CSS selector that targets exactly 1 element'),
  element_text: z.string().optional().describe('Text content of the element if any'),
  section_context: z.string().optional().describe('Section or context where element was found'),
  confidence: z.number().min(0).max(1).describe('Confidence this selector will work (0-1)'),
  reasoning: z.string().describe('Why this selector was chosen')
});

const elementNotFoundSchema = z.object({
  NOT_FOUND: z.boolean().describe('True if element not found'),
  reason: z.string().describe('Why element was not found'),
  suggestions: z.array(z.string()).describe('Suggestions for finding similar elements')
});

const injectionPointSchema = z.union([elementFoundSchema, elementNotFoundSchema]);

// Removed unused schemas - we only need injectionPointSchema for this service
// Cache check

export interface DOMAnalyzerService {
  analyzeForHypothesis(
    url: string, 
    hypothesis: string,
    projectId: string,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]>;
  
  analyzeForHypothesisWithHtml(
    url: string, 
    hypothesis: string,
    projectId: string,
    htmlContent: string | null,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]>;
}

export class DOMAnalyzerServiceImpl implements DOMAnalyzerService {
  private screenshotStorage: ScreenshotStorageService;

  constructor(
    private crawlerService: CrawlerService,
    prisma: PrismaClient
  ) {
    this.screenshotStorage = createScreenshotStorageService(prisma);
  }

  async analyzeForHypothesisWithHtml(
    url: string, 
    hypothesis: string,
    projectId: string,
    htmlContent: string | null,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]> {
    console.log(`[DOM_ANALYZER] Starting analysis with provided HTML for hypothesis: ${hypothesis}`);
    
    // If we have HTML content, use it directly without crawling
    if (htmlContent) {
      console.log(`[DOM_ANALYZER] Using provided HTML content (${htmlContent.length} chars)`);
      
      // Optimize HTML for AI analysis (memory efficient)
      const optimizedHTML = this.optimizeHTMLForAnalysis(htmlContent, hypothesis);
      console.log(`[DOM_ANALYZER] Optimized HTML from ${htmlContent.length} to ${optimizedHTML.length} characters (${Math.round((1 - optimizedHTML.length / htmlContent.length) * 100)}% reduction)`);

      // Use AI to find specific injection points for this hypothesis
      const aiConfig = getAIConfig();
      const result = await generateObject({
        model: google(aiConfig.model),
        schema: injectionPointSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this HTML to find the EXACT element mentioned in the hypothesis for variant injection.

HYPOTHESIS: "${hypothesis}"

CRITICAL RULES:
1. ONLY use CSS selectors that exist in the provided HTML - DO NOT invent or hallucinate class names
2. Find the SPECIFIC element mentioned in the hypothesis by matching text content or existing attributes
3. If a section is named (e.g., "Stay hydrated"), find the actual section containing that text, then the element within it
4. Use ONLY the classes, IDs, and attributes that are present in the HTML
5. Prefer stable attributes: data-testid, id, aria-*, role over class names
6. If using text content, match exactly (case-insensitive, trimmed)
7. Never create fictional class names like ".stay-hydrated-section" - use the actual classes from the HTML
8. If you can't find a unique selector, use a combination of existing classes and text content

SELECTOR VALIDATION:
- The selector MUST exist in the provided HTML
- The selector MUST target exactly 1 element
- The selector MUST be based on real attributes, not invented ones

Find the most specific and accurate selector for the element that needs to be modified according to the hypothesis.`
              },
              {
                type: 'text',
                text: `HTML Content:\n${optimizedHTML}`
              }
            ]
          }
        ]
      });

      // Process the simplified result
      const forensicsResult = result.object;
      
      // Check if element was found
      if ('NOT_FOUND' in forensicsResult && forensicsResult.NOT_FOUND === true) {
        console.log(`[DOM_ANALYZER] Element not found: ${forensicsResult.reason}`);
        console.log(`[DOM_ANALYZER] Suggestions:`, forensicsResult.suggestions);
        return []; // Return empty array if not found
      }
      
      // Type guard to ensure we have the success result
      if (!('css_selector' in forensicsResult)) {
        console.error(`[DOM_ANALYZER] Invalid response format from AI`);
        return [];
      }
      
      // Validate that the selector exists in the HTML
      const selector = forensicsResult.css_selector;
      console.log(`[DOM_ANALYZER] Validating selector: "${selector}"`);
      console.log(`[DOM_ANALYZER] HTML length for validation: ${optimizedHTML.length}`);
      
      const matchInfo = getSelectorMatchInfo(selector, optimizedHTML);
      
      if (!matchInfo.found) {
        console.warn(`[DOM_ANALYZER] Generated selector "${selector}" does not match any elements in HTML.`);
        console.warn(`[DOM_ANALYZER] Available classes in HTML:`, this.extractAvailableClasses(optimizedHTML).slice(0, 10));
        console.warn(`[DOM_ANALYZER] HTML sample:`, optimizedHTML.substring(0, 500));
        // Still return the result but with lower confidence
        forensicsResult.confidence = Math.min(forensicsResult.confidence || 0.5, 0.3);
      } else {
        console.log(`[DOM_ANALYZER] Selector validation passed: "${selector}" found ${matchInfo.count} element(s):`, matchInfo.elements);
      }
      
      // Transform the result to InjectionPoint format
      const injectionPoint: InjectionPoint = {
        type: 'button', // Default type, could be enhanced based on element analysis
        selector: forensicsResult.css_selector,
        confidence: forensicsResult.confidence,
        description: forensicsResult.reasoning,
        boundingBox: {
          x: 0, // Will be filled by the crawler
          y: 0,
          width: 0,
          height: 0
        },
        alternativeSelectors: [], // Simplified - no alternatives needed
        context: forensicsResult.section_context || 'Element found',
        reasoning: forensicsResult.reasoning,
        hypothesis,
        url,
        timestamp: new Date().toISOString(),
        tested: false,
        originalText: forensicsResult.element_text || undefined
      };
      
      console.log(`[DOM_ANALYZER] Found element: ${forensicsResult.css_selector}`);
      return [injectionPoint];
    }
    
    // Fallback to regular analysis if no HTML provided
    console.log(`[DOM_ANALYZER] No HTML content provided, falling back to regular analysis`);
    return this.analyzeForHypothesis(url, hypothesis, projectId, authentication);
  }

  async analyzeForHypothesis(
    url: string, 
    hypothesis: string,
    projectId: string,
    authentication?: { type: 'shopify_password'; password: string, shopDomain: string }
  ): Promise<InjectionPoint[]> {
    console.log(`[DOM_ANALYZER] Analyzing page for hypothesis: "${hypothesis}"`);
    
    // Check storage first for both screenshot and HTML
    const pageType = this.getPageType(url);
    const cachedData = await this.screenshotStorage.getScreenshotWithHtml(
      projectId, 
      pageType, 
      STANDARD_SCREENSHOT_OPTIONS
    );
    
    let crawlResult;
    if (cachedData.screenshot && cachedData.html) {
      console.log(`[DOM_ANALYZER] Using stored screenshot and HTML for ${pageType} page`);
      // We have both screenshot and HTML, no need to crawl
      crawlResult = {
        url,
        html: cachedData.html,
        screenshot: cachedData.screenshot,
        error: null
      };
    } else if (cachedData.screenshot) {
      console.log(`[DOM_ANALYZER] Using stored screenshot for ${pageType} page, but need to fetch HTML`);
      // We have screenshot but need HTML, so we need to crawl but without screenshot
      crawlResult = await this.crawlerService.crawlPage(url, {
        viewport: { width: 1920, height: 1080 },
        waitFor: 3000,
        screenshot: { fullPage: false, quality: 60 },
        authentication
      });
      // Use stored screenshot instead of crawled one
      crawlResult.screenshot = cachedData.screenshot;
      
      // Store the new HTML content
      if (crawlResult.html) {
        const simplifiedHtml = simplifyHTML(crawlResult.html);
        const screenshotId = await this.screenshotStorage.saveScreenshot(
          projectId, 
          pageType,
          url, 
          STANDARD_SCREENSHOT_OPTIONS,
          cachedData.screenshot!, // Use the cached screenshot
          simplifiedHtml
        );
        console.log(`[DOM_ANALYZER] HTML content saved with ID: ${screenshotId} (${getHtmlInfo(simplifiedHtml)})`);
      }
    } else {
      console.log(`[DOM_ANALYZER] Taking new screenshot and HTML for ${url}`);
      crawlResult = await this.crawlerService.crawlPage(url, {
        viewport: { width: 1920, height: 1080 },
        waitFor: 3000,
        screenshot: { fullPage: true, quality: 80 },
        authentication
      });
      
      // Store the new screenshot and HTML
      if (crawlResult.screenshot && crawlResult.html) {
        const simplifiedHtml = simplifyHTML(crawlResult.html);
        const screenshotId = await this.screenshotStorage.saveScreenshot(
          projectId, 
          pageType,
          url, 
          STANDARD_SCREENSHOT_OPTIONS,
          crawlResult.screenshot,
          simplifiedHtml
        );
        console.log(`[DOM_ANALYZER] Screenshot and HTML saved with ID: ${screenshotId} (${getHtmlInfo(simplifiedHtml)})`);
      }
    }

    if (crawlResult.error) {
      throw new Error(`Failed to crawl page: ${crawlResult.error}`);
    }


    // Optimize HTML for AI analysis (memory efficient)
    const optimizedHTML = this.optimizeHTMLForAnalysis(crawlResult.html, hypothesis);
    console.log(`[DOM_ANALYZER] Optimized HTML from ${crawlResult.html.length} to ${optimizedHTML.length} characters (${Math.round((1 - optimizedHTML.length / crawlResult.html.length) * 100)}% reduction)`);

    // Clear large HTML from memory before AI processing
    crawlResult.html = ''; // Free memory
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Use AI to find specific injection points for this hypothesis
    const aiConfig = getAIConfig();
    const result = await generateObject({
      model: google(aiConfig.model),
      schema: injectionPointSchema,
      messages: [
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: this.buildHypothesisFocusedPrompt(hypothesis) 
            },
            { 
              type: 'text', 
              text: `HTML Content:\n${optimizedHTML}` 
            }
          ]
        }
      ]
    });

    // optimizedHTML will be garbage collected after this scope

    // Process the simplified result
    const forensicsResult = result.object;
    
    // Check if element was found
    if ('NOT_FOUND' in forensicsResult && forensicsResult.NOT_FOUND === true) {
      console.log(`[DOM_ANALYZER] Element not found: ${forensicsResult.reason}`);
      console.log(`[DOM_ANALYZER] Suggestions:`, forensicsResult.suggestions);
      return []; // Return empty array if not found
    }
    
    // Type guard to ensure we have the success result
    if (!('css_selector' in forensicsResult)) {
      console.error(`[DOM_ANALYZER] Invalid response format from AI`);
      return [];
    }
    
    // Validate that the selector exists in the HTML
    const selector = forensicsResult.css_selector;
    const matchInfo = getSelectorMatchInfo(selector, optimizedHTML);
    
    if (!matchInfo.found) {
      console.warn(`[DOM_ANALYZER] Generated selector "${selector}" does not match any elements in HTML.`);
      console.warn(`[DOM_ANALYZER] Available classes in HTML:`, this.extractAvailableClasses(optimizedHTML).slice(0, 10));
      // Still return the result but with lower confidence
      forensicsResult.confidence = Math.min(forensicsResult.confidence || 0.5, 0.3);
    } else {
      console.log(`[DOM_ANALYZER] Selector validation passed: "${selector}" found ${matchInfo.count} element(s):`, matchInfo.elements);
    }
    
    // Clean the CSS selector
    const cleanedSelector = cleanCSSSelector(forensicsResult.css_selector);
    
    // Validate selector and log warnings for invalid ones
    if (!isValidCSSSelector(cleanedSelector)) {
      console.warn(`[DOM_ANALYZER] Invalid CSS selector detected: "${forensicsResult.css_selector}" -> cleaned to: "${cleanedSelector}"`);
    }
    
    // Transform the result to InjectionPoint format
    const injectionPoint: InjectionPoint = {
      type: 'button', // Default type, could be enhanced based on element analysis
      selector: cleanedSelector,
      confidence: forensicsResult.confidence,
      description: forensicsResult.reasoning,
      boundingBox: {
        x: 0, // Will be filled by the crawler
        y: 0,
        width: 0,
        height: 0
      },
      alternativeSelectors: [], // Simplified - no alternatives needed
      context: forensicsResult.section_context || 'Element found',
      reasoning: forensicsResult.reasoning,
      hypothesis,
      url,
      timestamp: new Date().toISOString(),
      tested: false,
      originalText: forensicsResult.element_text || undefined
    };

    console.log(`[DOM_ANALYZER] Found element: ${cleanedSelector}`);
    console.log(`[DOM_ANALYZER] Element details:`, {
      type: injectionPoint.type,
      selector: injectionPoint.selector,
      confidence: injectionPoint.confidence,
      reasoning: injectionPoint.reasoning.substring(0, 100) + '...'
    });

    return [injectionPoint];
  }

  private optimizeHTMLForAnalysis(html: string, _hypothesis: string): string {
    // Process HTML in chunks to reduce memory usage
    const chunkSize = 10000; // Process 10KB at a time
    const chunks = this.splitIntoChunks(html, chunkSize);
    
    let optimized = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Process chunk with minimal memory operations
      const processedChunk = this.processHTMLChunk(chunk);
      optimized += processedChunk;
      
      // Force garbage collection hint for large chunks
      if (i % 5 === 0 && global.gc) {
        global.gc();
      }
    }
    
    // Use the full HTML with intelligent truncation if needed
    const maxLength = 50000; // ~12k tokens (increased significantly)
    if (optimized.length > maxLength) {
      // Simple truncation that preserves HTML structure
      const truncated = optimized.substring(0, maxLength);
      // Try to end at a reasonable point (end of tag)
      const lastTagEnd = truncated.lastIndexOf('>');
      if (lastTagEnd > maxLength * 0.9) {
        return truncated.substring(0, lastTagEnd + 1) + '\n\n... [HTML truncated for analysis]';
      }
      return truncated + '\n\n... [HTML truncated for analysis]';
    }
    
    return optimized;
  }

  private splitIntoChunks(str: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push(str.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private processHTMLChunk(chunk: string): string {
    // Use the forensics-specific HTML simplifier that preserves important attributes
    return simplifyHTMLForForensics(chunk);
  }




  private extractAvailableClasses(html: string): string[] {
    try {
      const $ = cheerio.load(html);
      const classes = new Set<string>();
      
      // Extract all class attributes from all elements
      $('[class]').each((_, element) => {
        const classAttr = $(element).attr('class');
        if (classAttr) {
          const classList = classAttr.split(/\s+/);
          classList.forEach(cls => {
            if (cls.trim()) {
              classes.add(cls.trim());
            }
          });
        }
      });
      
      return Array.from(classes);
    } catch (error) {
      console.warn(`[DOM_ANALYZER] Error extracting classes:`, error);
      return [];
    }
  }

  private buildHypothesisFocusedPrompt(hypothesis: string): string {
    return `You are a DOM analysis assistant. Find the exact element mentioned in the hypothesis and return a CSS selector that targets exactly 1 element.

HYPOTHESIS: "${hypothesis}"

CRITICAL RULES:
1. ONLY use CSS selectors that exist in the provided HTML - DO NOT invent or hallucinate class names
2. Find the SPECIFIC element mentioned in the hypothesis by matching text content or existing attributes
3. If a section is named (e.g., "Stay hydrated"), find the actual section containing that text, then the element within it
4. Use ONLY the classes, IDs, and attributes that are present in the HTML
5. Prefer stable attributes: data-testid, id, aria-*, role over class names
6. If using text content, match exactly (case-insensitive, trimmed)
7. Never create fictional class names like ".stay-hydrated-section" - use the actual classes from the HTML
8. If you can't find a unique selector, use a combination of existing classes and text content

SELECTOR VALIDATION:
- The selector MUST exist in the provided HTML
- The selector MUST target exactly 1 element
- The selector MUST be based on real attributes, not invented ones

OUTPUT FORMAT:
- If found: Return JSON with css_selector, element_text (if any), section_context, confidence (0-1), and reasoning
- If not found: Return JSON with NOT_FOUND: true, reason, and suggestions array

EXAMPLE:
Hypothesis: "Change the 'Get waxy now' button in the 'Stay hydrated' section"
→ Look for actual HTML containing "Stay hydrated" text, then find the button with "Get waxy now" text
→ Use the real classes from the HTML, not invented ones like ".stay-hydrated-section"`;
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

// Factory function
export function createDOMAnalyzer(crawler: CrawlerService, prisma: PrismaClient): DOMAnalyzerService {
  return new DOMAnalyzerServiceImpl(crawler, prisma);
}
