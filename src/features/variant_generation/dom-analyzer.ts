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
import { createElementDetector } from './element-detector';

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

// Check if an ID is generated/unstable (contains numbers, hyphens, or template patterns)
function isGeneratedId(id: string): boolean {
  // Check for common patterns that indicate generated IDs
  const generatedPatterns = [
    /template--\d+/, // Shopify template IDs like "template--25767798276440"
    /slide-\d+/, // Slide IDs like "slide-123"
    /section-\d+/, // Section IDs like "section-123"
    /block-\d+/, // Block IDs like "block-123"
    /shopify-section-\w+/, // Shopify section IDs
    /^\d+$/, // Pure numbers
    /^[a-f0-9]{8,}$/i, // Long hex strings
    /^[a-z0-9]{20,}$/i, // Long alphanumeric strings
    /-\d{10,}$/, // Ends with long numbers
    /^[a-z]+-\d+-\d+/, // Pattern like "slide-123-456"
  ];
  
  return generatedPatterns.some(pattern => pattern.test(id));
}

// Check if a class is likely to be stable (not generated)
function isStableClass(className: string): boolean {
  // Stable class patterns (semantic, not generated)
  const stablePatterns = [
    /^[a-z]+-[a-z]+$/, // kebab-case like "card-wrapper"
    /^[a-z]+__[a-z]+$/, // BEM like "card__heading"
    /^[a-z]+--[a-z]+$/, // BEM modifier like "button--primary"
    /^[a-z]+$/, // simple words like "button", "card"
    /^[a-z]+-[a-z]+-[a-z]+$/, // triple kebab like "cart-drawer-form"
  ];
  
  // Avoid generated patterns
  const generatedPatterns = [
    /^\d+$/, // Pure numbers
    /^[a-f0-9]{8,}$/i, // Long hex strings
    /^[a-z0-9]{20,}$/i, // Long alphanumeric strings
    /-\d{10,}$/, // Ends with long numbers
    /^[a-z]+-\d+/, // Pattern like "card-123"
    /template--\d+/, // Template patterns
  ];
  
  return stablePatterns.some(pattern => pattern.test(className)) && 
         !generatedPatterns.some(pattern => pattern.test(className));
}

// Generate multiple fallback selectors for better reliability
function generateFallbackSelectors(element: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string[] {
  const selectors: string[] = [];
  const el = element[0];
  
  if (!el || el.type !== 'tag') return selectors;
  
  const tagName = el.name;
  const id = $(el).attr('id');
  const classes = $(el).attr('class');
  const dataTestId = $(el).attr('data-testid');
  const role = $(el).attr('role');
  const ariaLabel = $(el).attr('aria-label');
  const textContent = $(el).text?.()?.trim();
  
  // Strategy 1: Data attributes (most reliable - never generated)
  if (dataTestId) {
    selectors.push(`[data-testid="${dataTestId}"]`);
  }
  
  // Strategy 2: Role attribute (very reliable - semantic)
  if (role) {
    selectors.push(`${tagName}[role="${role}"]`);
  }
  
  // Strategy 3: Aria-label (very reliable - semantic)
  if (ariaLabel) {
    selectors.push(`${tagName}[aria-label="${ariaLabel}"]`);
  }
  
  // Strategy 4: ID selector (only if not generated)
  if (id && !isGeneratedId(id)) {
    selectors.push(`#${id}`);
  }
  
  // Strategy 5: Stable class-based selectors (prioritize semantic classes)
  if (classes) {
    const classList = classes.split(' ').filter(c => c.trim());
    const stableClasses = classList.filter(isStableClass);
    
    // Use only stable classes
    if (stableClasses.length > 0) {
      // Single most stable class
      selectors.push(`${tagName}.${stableClasses[0]}`);
      
      // Two most stable classes
      if (stableClasses.length > 1) {
        selectors.push(`${tagName}.${stableClasses.slice(0, 2).join('.')}`);
      }
      
      // All stable classes (if not too many)
      if (stableClasses.length <= 3) {
        selectors.push(`${tagName}.${stableClasses.join('.')}`);
      }
    }
  }
  
  // Strategy 6: Text content with tag (for unique text)
  if (textContent && textContent.length < 50 && textContent.length > 3) {
    selectors.push(`${tagName}:contains("${textContent}")`);
  }
  
  // Strategy 7: Parent-child relationships with stable classes
  const parent = $(el).parent();
  if (parent.length > 0) {
    const parentClasses = parent.attr('class');
    if (parentClasses) {
      const parentClassList = parentClasses.split(' ').filter(c => c.trim());
      const stableParentClasses = parentClassList.filter(isStableClass);
      
      if (stableParentClasses.length > 0) {
        // Use most stable parent class
        selectors.push(`.${stableParentClasses[0]} ${tagName}`);
        selectors.push(`.${stableParentClasses[0]} > ${tagName}`);
        
        // Add current element's stable class if available
        if (classes) {
          const stableClasses = classes.split(' ').filter(c => c.trim()).filter(isStableClass);
          if (stableClasses.length > 0) {
            selectors.push(`.${stableParentClasses[0]} ${tagName}.${stableClasses[0]}`);
          }
        }
      }
    }
  }
  
  // Strategy 8: Grandparent relationships (more stable than direct parent)
  const grandparent = $(el).parent().parent();
  if (grandparent.length > 0) {
    const grandparentClasses = grandparent.attr('class');
    if (grandparentClasses) {
      const grandparentClassList = grandparentClasses.split(' ').filter(c => c.trim());
      const stableGrandparentClasses = grandparentClassList.filter(isStableClass);
      
      if (stableGrandparentClasses.length > 0) {
        selectors.push(`.${stableGrandparentClasses[0]} ${tagName}`);
      }
    }
  }
  
  // Strategy 9: Sibling relationships (avoid position-based)
  const siblings = $(el).siblings(tagName);
  if (siblings.length === 0) {
    // If it's the only element of its type, use tag alone
    selectors.push(tagName);
  }
  
  // Remove duplicates and invalid selectors
  return [...new Set(selectors)].filter(selector => {
    try {
      $(selector);
      return true;
    } catch {
      return false;
    }
  });
}

// Test selector reliability by checking if it still works
function testSelectorReliability(selector: string, html: string): { works: boolean; confidence: number; reason: string } {
  const matchInfo = getSelectorMatchInfo(selector, html);
  
  if (!matchInfo.found) {
    return { works: false, confidence: 0, reason: 'Selector does not match any elements' };
  }
  
  if (matchInfo.count > 1) {
    return { works: false, confidence: 0.3, reason: `Selector matches ${matchInfo.count} elements, should match exactly 1` };
  }
  
  // Check for generated/unstable patterns
  const hasGeneratedId = /#.*template--\d+|#.*slide-\d+|#.*section-\d+|#.*block-\d+|#.*shopify-section/.test(selector);
  const hasGeneratedClass = /\.\d+\.|\.\w+\d{10,}\.|\.\w+-\d{10,}\./.test(selector);
  const hasComplexChain = selector.split('.').length > 3 || selector.split(' ').length > 4;
  
  if (hasGeneratedId || hasGeneratedClass) {
    return { works: false, confidence: 0.1, reason: 'Selector contains generated/unstable patterns' };
  }
  
  // Check selector stability
  let confidence = 0.8; // Base confidence
  let reason = 'Selector works and matches exactly 1 element';
  
  // Prefer more stable selectors
  if (selector.includes('[data-testid=')) {
    confidence = 0.95;
    reason += ' (data-testid - most stable)';
  } else if (selector.includes('[role=') || selector.includes('[aria-label=')) {
    confidence = 0.9;
    reason += ' (ARIA attribute - very stable)';
  } else if (selector.startsWith('#') && !hasGeneratedId) {
    confidence = 0.85;
    reason += ' (ID selector - stable)';
  } else if (selector.match(/^[a-z]+\.[a-z-]+$/) || selector.match(/^[a-z]+\.[a-z]+__[a-z]+$/)) {
    confidence = 0.8;
    reason += ' (semantic class - stable)';
  } else if (selector.includes(':contains(')) {
    confidence = 0.6;
    reason += ' (text-based - less stable)';
  } else if (hasComplexChain) {
    confidence = 0.4;
    reason += ' (complex chain - fragile)';
  } else if (selector.includes(':nth-child(')) {
    confidence = 0.3;
    reason += ' (position-based - very fragile)';
  }
  
  return { works: true, confidence, reason };
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
  alternativeSelectors: string[]; // Fallback selectors with reliability scores
  context: string; // What this element is used for (e.g., "main call-to-action button")
  reasoning: string; // Why this selector was chosen
  hypothesis: string; // The hypothesis this was found for
  url: string; // The URL this was found on
  timestamp: string; // When this was created
  tested: boolean; // Whether this selector has been tested
  successRate?: number; // Success rate if tested multiple times
  originalText?: string; // Original text content of the element (for text length considerations)
  selectorReliability?: {
    works: boolean;
    confidence: number;
    reason: string;
  };
}

// Removed unused PageStructure interface

// Simplified schema for variant injection - only what we actually need
const elementFoundSchema = z.object({
  css_selector: z.string().describe('CSS selector that targets exactly 1 element'),
  element_text: z.string().optional().describe('Text content of the element if any'),
  section_context: z.string().optional().describe('Section or context where element was found'),
  confidence: z.number().min(0).max(1).describe('Confidence this selector will work (0-1)'),
  reasoning: z.string().describe('Why this selector was chosen'),
  alternative_selectors: z.array(z.string()).optional().describe('Alternative fallback selectors')
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
    
    // If we have HTML content, use the new multi-strategy approach
    if (htmlContent) {
      console.log(`[DOM_ANALYZER] Using multi-strategy element detection (${htmlContent.length} chars)`);
      
      // Use raw HTML for better element detection - minimal processing
      const rawHTML = this.minimalHTMLProcessing(htmlContent);
      console.log(`[DOM_ANALYZER] Raw HTML processed: ${rawHTML.length} chars (${Math.round((1 - rawHTML.length / htmlContent.length) * 100)}% reduction)`);
      
      // Use the new element detector with raw HTML
      const elementDetector = createElementDetector(rawHTML);
      const detectionResult = await elementDetector.detectElement(hypothesis);
      
      if (!detectionResult.found) {
        console.log(`[DOM_ANALYZER] No elements found using multi-strategy approach`);
        console.log(`[DOM_ANALYZER] Suggestions:`, detectionResult.suggestions);
        return [];
      }
      
      console.log(`[DOM_ANALYZER] Found ${detectionResult.candidates.length} element candidates`);
      
      // Convert candidates to injection points
      const injectionPoints: InjectionPoint[] = detectionResult.candidates.map((candidate, index) => {
        const type = this.determineElementType(candidate.element.tagName, candidate.element.attributes);
        
        return {
          type,
          selector: candidate.selector,
          confidence: candidate.confidence,
          description: candidate.reasoning,
          boundingBox: {
            x: 0, // Will be filled by the crawler
            y: 0,
            width: 0,
            height: 0
          },
          alternativeSelectors: detectionResult.candidates
            .filter((_, i) => i !== index)
            .map(c => c.selector),
          context: `${candidate.strategy} strategy`,
          reasoning: candidate.reasoning,
          hypothesis,
          url,
          timestamp: new Date().toISOString(),
          tested: false,
          originalText: candidate.element.text,
          selectorReliability: {
            works: true,
            confidence: candidate.confidence,
            reason: `${candidate.strategy} strategy - ${candidate.reasoning}`
          }
        };
      });
      
      console.log(`[DOM_ANALYZER] Generated ${injectionPoints.length} injection points`);
      return injectionPoints;
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
    let finalSelector = selector;
    let alternativeSelectors: string[] = [];
    let reliability = testSelectorReliability(selector, optimizedHTML);
    
    if (!matchInfo.found) {
      console.warn(`[DOM_ANALYZER] Generated selector "${selector}" does not match any elements in HTML.`);
      console.warn(`[DOM_ANALYZER] Available classes in HTML:`, this.extractAvailableClasses(optimizedHTML).slice(0, 10));
      
      // Try to find the element using text content or other methods
      console.log(`[DOM_ANALYZER] Attempting to find element using fallback methods...`);
      const $ = cheerio.load(optimizedHTML);
      const elementText = forensicsResult.element_text;
      
      if (elementText) {
        // Try to find by text content
        const textElements = $(`*:contains("${elementText}")`).filter((_, el) => {
          return $(el).text().trim() === elementText.trim();
        });
        
        if (textElements.length > 0) {
          const targetElement = textElements.first();
          alternativeSelectors = generateFallbackSelectors(targetElement, $);
          
          // Find the best working selector
          for (const altSelector of alternativeSelectors) {
            const altMatchInfo = getSelectorMatchInfo(altSelector, optimizedHTML);
            if (altMatchInfo.found && altMatchInfo.count === 1) {
              finalSelector = altSelector;
              reliability = testSelectorReliability(altSelector, optimizedHTML);
              console.log(`[DOM_ANALYZER] Found working fallback selector: "${altSelector}"`);
              break;
            }
          }
        }
      }
      
      // Still return the result but with lower confidence
      forensicsResult.confidence = Math.min(forensicsResult.confidence || 0.5, 0.3);
    } else {
      console.log(`[DOM_ANALYZER] Selector validation passed: "${selector}" found ${matchInfo.count} element(s):`, matchInfo.elements);
      
      // Generate fallback selectors for the working selector
      const $ = cheerio.load(optimizedHTML);
      const elements = $(selector);
      if (elements.length > 0) {
        alternativeSelectors = generateFallbackSelectors(elements.first(), $);
        // Remove the primary selector from alternatives
        alternativeSelectors = alternativeSelectors.filter(s => s !== selector);
      }
    }
    
    // Clean the CSS selector
    const cleanedSelector = cleanCSSSelector(finalSelector);
    
    // Validate selector and log warnings for invalid ones
    if (!isValidCSSSelector(cleanedSelector)) {
      console.warn(`[DOM_ANALYZER] Invalid CSS selector detected: "${finalSelector}" -> cleaned to: "${cleanedSelector}"`);
    }
    
    // Transform the result to InjectionPoint format
    const injectionPoint: InjectionPoint = {
      type: 'button', // Default type, could be enhanced based on element analysis
      selector: cleanedSelector,
      confidence: reliability.works ? reliability.confidence : Math.min(forensicsResult.confidence || 0.5, 0.3),
      description: forensicsResult.reasoning,
      boundingBox: {
        x: 0, // Will be filled by the crawler
        y: 0,
        width: 0,
        height: 0
      },
      alternativeSelectors: alternativeSelectors,
      context: forensicsResult.section_context || 'Element found',
      reasoning: forensicsResult.reasoning,
      hypothesis,
      url,
      timestamp: new Date().toISOString(),
      tested: false,
      originalText: forensicsResult.element_text || undefined,
      selectorReliability: reliability
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

  // Minimal HTML processing for the new multi-strategy detector
  private minimalHTMLProcessing(html: string): string {
    // Only remove the most unnecessary elements, keep everything else
    return html
      // Remove only script and style tags (keep everything else)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Normalize whitespace but keep structure
      .replace(/\s+/g, ' ')
      .trim();
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
5. AVOID GENERATED/UNSTABLE SELECTORS - Never use IDs or classes with these patterns:
   - template--123456789 (Shopify template IDs)
   - slide-123456789 (generated slide IDs)
   - section-123456789 (generated section IDs)
   - Any ID/class with long numbers or hex strings
   - Complex nested class chains with generated patterns
6. Prefer stable attributes in this order: data-testid, role, aria-*, semantic class names, then simple IDs
7. If using text content, match exactly (case-insensitive, trimmed)
8. Never create fictional class names like ".stay-hydrated-section" - use the actual classes from the HTML
9. Use simple, semantic selectors like ".card__heading" or "button[role='button']" instead of complex chains
10. Generate alternative_selectors array with fallback options using different strategies

SELECTOR VALIDATION:
- The selector MUST exist in the provided HTML
- The selector MUST target exactly 1 element
- The selector MUST be based on real attributes, not invented ones
- The selector MUST avoid generated/unstable patterns
- Provide alternative_selectors for better reliability

STABLE SELECTOR EXAMPLES:
✅ Good: ".card__heading" (semantic class)
✅ Good: "button[role='button']" (role attribute)
✅ Good: "[data-testid='product-title']" (data attribute)
✅ Good: "h3.card__heading" (tag + semantic class)
❌ Bad: "#Slide-template--25767798276440__featured_collection-1" (generated ID)
❌ Bad: ".card-wrapper.product-card-wrapper > div.card__content" (complex chain)
❌ Bad: "#shopify-section-sections--25767798538584__header" (generated ID)

OUTPUT FORMAT:
- If found: Return JSON with css_selector, element_text (if any), section_context, confidence (0-1), reasoning, and alternative_selectors array
- If not found: Return JSON with NOT_FOUND: true, reason, and suggestions array

EXAMPLE:
Hypothesis: "Change the 'Get waxy now' button in the 'Stay hydrated' section"
→ Look for actual HTML containing "Stay hydrated" text, then find the button with "Get waxy now" text
→ Use simple selectors like "button:contains('Get waxy now')" or ".button--primary"
→ Avoid complex chains with generated IDs or classes`;
  }

  private determineElementType(tagName: string, attributes: Record<string, string>): 'button' | 'text' | 'image' | 'container' | 'form' | 'navigation' | 'price' | 'title' | 'description' {
    // Check for explicit role
    const role = attributes.role?.toLowerCase();
    if (role) {
      if (role.includes('button')) return 'button';
      if (role.includes('navigation')) return 'navigation';
      if (role.includes('form')) return 'form';
    }
    
    // Check tag name
    if (tagName === 'button' || tagName === 'input' && attributes.type === 'button') {
      return 'button';
    }
    
    if (tagName === 'img') {
      return 'image';
    }
    
    if (tagName === 'form') {
      return 'form';
    }
    
    if (tagName === 'nav') {
      return 'navigation';
    }
    
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      return 'title';
    }
    
    // Check for price-related classes or attributes
    const classList = attributes.class?.toLowerCase() || '';
    const text = attributes.text?.toLowerCase() || '';
    
    if (classList.includes('price') || classList.includes('cost') || text.includes('$') || text.includes('€') || text.includes('£')) {
      return 'price';
    }
    
    if (classList.includes('description') || classList.includes('content') || classList.includes('text')) {
      return 'description';
    }
    
    // Default to container for divs, spans, etc.
    if (['div', 'span', 'section', 'article', 'aside'].includes(tagName)) {
      return 'container';
    }
    
    // Default to text for other elements
    return 'text';
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
