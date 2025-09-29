// AI-Powered DOM Analysis Service for Variant Injection
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { CrawlerService } from '@features/crawler';
import { getAIConfig } from '@shared/ai-config';
import { PrismaClient } from '@prisma/client';
import { createScreenshotStorageService, ScreenshotStorageService } from '@services/screenshot-storage';
import { simplifyHTML, simplifyHTMLForForensics, getHtmlInfo } from '@shared/utils/html-simplifier';

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

INSTRUCTIONS:
1. Look for the SPECIFIC element mentioned in the hypothesis (e.g., "Get waxy now" button, "Stay hydrated" section)
2. Find the exact CSS selector for that specific element
3. Do NOT select generic buttons or CTAs that are not mentioned in the hypothesis
4. Look for text content that matches what's described in the hypothesis
5. If the hypothesis mentions a specific section (like "Stay hydrated"), look within that section
6. Prioritize elements with the exact text mentioned in the hypothesis

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
      { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 80 }
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
          { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 80 },
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
          { viewport: { width: 1920, height: 1080 }, fullPage: true, quality: 80 },
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

  private optimizeHTMLForAnalysis(html: string, hypothesis: string): string {
    // Extract key elements based on hypothesis keywords
    const hypothesisKeywords = this.extractKeywordsFromHypothesis(hypothesis);
    
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
    
    // Extract relevant sections based on hypothesis (memory efficient)
    const relevantSections = this.extractRelevantSectionsEfficient(optimized, hypothesisKeywords);
    
    // Limit total size to prevent token overflow - further reduced for memory
    const maxLength = 15000; // ~3.5k tokens (reduced from 30k)
    if (relevantSections.length > maxLength) {
      return relevantSections.substring(0, maxLength) + '\n\n... [HTML truncated for analysis]';
    }
    
    return relevantSections;
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

  private extractRelevantSectionsEfficient(html: string, keywords: string[]): string {
    // Use a more memory-efficient approach with streaming
    const sections = new Set<string>(); // Use Set to avoid duplicates automatically
    
    // Always include the main structure (single regex)
    const mainMatch = html.match(/<main[^>]*>[\s\S]*?<\/main>/i);
    if (mainMatch) sections.add(mainMatch[0]);
    
    // Process keywords one at a time to avoid memory spikes
    for (const keyword of keywords) {
      // Use a more targeted regex that's less memory intensive
      const regex = new RegExp(`<[^>]*${this.escapeRegex(keyword)}[^>]*>[\s\S]{0,2000}?<\/[^>]*>`, 'gi');
      let match;
      while ((match = regex.exec(html)) !== null) {
        sections.add(match[0]);
        // Limit matches per keyword to prevent memory overflow
        if (sections.size > 20) break;
      }
      // Clear regex state
      regex.lastIndex = 0;
    }
    
    // Include header and footer for context (single regex each)
    const headerMatch = html.match(/<header[^>]*>[\s\S]*?<\/header>/i);
    if (headerMatch) sections.add(headerMatch[0]);
    
    const footerMatch = html.match(/<footer[^>]*>[\s\S]*?<\/footer>/i);
    if (footerMatch) sections.add(footerMatch[0]);
    
    // Convert Set to Array and join (memory efficient)
    return Array.from(sections).join('\n\n');
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildHypothesisFocusedPrompt(hypothesis: string): string {
    return `You are a DOM analysis assistant. Find the exact element mentioned in the hypothesis and return a CSS selector that targets exactly 1 element.

HYPOTHESIS: "${hypothesis}"

INSTRUCTIONS:
1. Find the SPECIFIC element mentioned in the hypothesis (exact text, section, or unique attributes)
2. If a section is named (e.g., "Stay hydrated"), find that section first, then the element within it
3. Return a CSS selector that targets exactly 1 element
4. Prefer stable attributes: data-testid, id, aria-*, role over class names
5. If using text, match exactly (case-insensitive, trimmed)
6. Never use generic selectors like .btn, .button unless anchored to a unique parent

OUTPUT FORMAT:
- If found: Return JSON with css_selector, element_text (if any), section_context, confidence (0-1), and reasoning
- If not found: Return JSON with NOT_FOUND: true, reason, and suggestions array

EXAMPLE:
Hypothesis: "Change the 'Get waxy now' button in the 'Stay hydrated' section"
→ Find section with "Stay hydrated", then button with "Get waxy now" text`;
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
