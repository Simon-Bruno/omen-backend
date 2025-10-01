// Smart Screenshot Strategy
// Determines the best area to screenshot based on hypothesis and element context

import * as cheerio from 'cheerio';

export interface ScreenshotStrategy {
  type: 'element' | 'section' | 'viewport' | 'fullpage';
  selector?: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface ElementContext {
  element: {
    tagName: string;
    text?: string;
    attributes: Record<string, string>;
  };
  parent?: {
    tagName: string;
    classes: string[];
    text?: string;
  };
  siblings?: Array<{
    tagName: string;
    text?: string;
    classes: string[];
  }>;
  section?: {
    heading?: string;
    classes: string[];
  };
}

export class SmartScreenshotStrategy {
  private $: cheerio.CheerioAPI;
  private hypothesis: string;

  constructor(html: string, hypothesis: string) {
    this.$ = cheerio.load(html);
    this.hypothesis = hypothesis;
  }

  // Main method to determine the best screenshot strategy
  async determineScreenshotStrategy(targetSelector?: string): Promise<ScreenshotStrategy[]> {
    const strategies: ScreenshotStrategy[] = [];

    // Strategy 1: Target element with context (highest priority)
    if (targetSelector) {
      const elementStrategy = this.createElementStrategy(targetSelector);
      if (elementStrategy) {
        strategies.push(elementStrategy);
      }
    }

    // Strategy 2: Section-based strategy (if we can identify a section)
    const sectionStrategy = this.createSectionStrategy();
    if (sectionStrategy) {
      strategies.push(sectionStrategy);
    }

    // Strategy 3: Hypothesis-based strategy (fallback)
    const hypothesisStrategy = this.createHypothesisStrategy();
    if (hypothesisStrategy) {
      strategies.push(hypothesisStrategy);
    }

    // Strategy 4: Viewport strategy (always available)
    strategies.push({
      type: 'viewport',
      description: 'Screenshot the current viewport',
      confidence: 0.5,
      reasoning: 'Fallback to viewport when other strategies fail'
    });

    // Strategy 5: Full page strategy (last resort)
    strategies.push({
      type: 'fullpage',
      description: 'Screenshot the entire page',
      confidence: 0.3,
      reasoning: 'Last resort when all other strategies fail'
    });

    // Sort by confidence (highest first)
    return strategies.sort((a, b) => b.confidence - a.confidence);
  }

  // Strategy 1: Target element with context
  private createElementStrategy(targetSelector: string): ScreenshotStrategy | null {
    try {
      const element = this.$(targetSelector).first();
      if (element.length === 0) {
        return null;
      }

      const context = this.getElementContext(element);
      const section = this.findContainingSection(element);

      // Determine the best screenshot approach based on context
      if (section) {
        return {
          type: 'section',
          selector: section.selector,
          description: `Screenshot the ${section.name} section containing the target element`,
          confidence: 0.9,
          reasoning: `Target element is within a clear section: ${section.name}`
        };
      } else if (context.parent) {
        return {
          type: 'element',
          selector: this.generateParentSelector(element),
          description: `Screenshot the parent container of the target element`,
          confidence: 0.8,
          reasoning: `Target element is within a parent container: ${context.parent.tagName}`
        };
      } else {
        return {
          type: 'element',
          selector: targetSelector,
          description: `Screenshot the target element directly`,
          confidence: 0.7,
          reasoning: 'Direct screenshot of target element'
        };
      }
    } catch (error) {
      console.warn(`[SCREENSHOT_STRATEGY] Failed to create element strategy:`, error);
      return null;
    }
  }

  // Strategy 2: Section-based strategy
  private createSectionStrategy(): ScreenshotStrategy | null {
    const sectionKeywords = this.extractSectionKeywords(this.hypothesis);
    
    for (const keyword of sectionKeywords) {
      // Look for headings containing the keyword
      const headings = this.$(`h1, h2, h3, h4, h5, h6:contains("${keyword}")`);
      
      if (headings.length > 0) {
        const heading = headings.first();
        const section = this.findSectionFromHeading(heading);
        
        if (section) {
          return {
            type: 'section',
            selector: section.selector,
            description: `Screenshot the '${keyword}' section`,
            confidence: 0.85,
            reasoning: `Found section with heading containing '${keyword}'`
          };
        }
      }
    }

    return null;
  }

  // Strategy 3: Hypothesis-based strategy
  private createHypothesisStrategy(): ScreenshotStrategy | null {
    const keywords = this.extractKeywords(this.hypothesis);
    
    // Look for elements that might be related to the hypothesis
    for (const keyword of keywords) {
      // Look for buttons, links, or interactive elements
      const interactiveElements = this.$(`button:contains("${keyword}"), a:contains("${keyword}"), input[value*="${keyword}"]`);
      
      if (interactiveElements.length > 0) {
        const element = interactiveElements.first();
        const context = this.getElementContext(element);
        
        if (context.parent) {
          return {
            type: 'element',
            selector: this.generateParentSelector(element),
            description: `Screenshot the area containing '${keyword}'`,
            confidence: 0.75,
            reasoning: `Found interactive element related to '${keyword}'`
          };
        }
      }
    }

    return null;
  }

  // Helper methods
  private getElementContext(element: cheerio.Cheerio<any>): ElementContext {
    const el = element[0];
    if (!el || el.type !== 'tag') {
      return { element: { tagName: 'unknown', attributes: {} } };
    }

    const tagName = el.name;
    const text = element.text().trim();
    const attributes: Record<string, string> = {};
    
    if (el.attribs) {
      Object.keys(el.attribs).forEach(key => {
        attributes[key] = el.attribs[key];
      });
    }

    // Get parent context
    const parent = element.parent();
    let parentContext;
    if (parent.length > 0 && parent[0].type === 'tag') {
      parentContext = {
        tagName: parent[0].name,
        classes: parent.attr('class')?.split(' ').filter(c => c.trim()) || [],
        text: parent.text().trim()
      };
    }

    // Get sibling context
    const siblings = element.siblings().slice(0, 3); // First 3 siblings
    const siblingContext: Array<{ tagName: string; text: string; classes: string[] }> = [];
    siblings.each((_, sibling) => {
      const $sibling = this.$(sibling);
      siblingContext.push({
        tagName: sibling.type === 'tag' ? (sibling as any).name : 'unknown',
        text: $sibling.text().trim(),
        classes: $sibling.attr('class')?.split(' ').filter(c => c.trim()) || []
      });
    });

    return {
      element: { tagName, text, attributes },
      parent: parentContext,
      siblings: siblingContext
    };
  }

  private findContainingSection(element: cheerio.Cheerio<any>): { name: string; selector: string } | null {
    // Look for common section containers, prioritizing more specific ones
    const sectionSelectors = [
      '.product-card',
      '.product-card-wrapper',
      '.card',
      '.product-item',
      '.product',
      '.featured-collection',
      '.collection',
      '.banner',
      '.hero',
      'section:not(.shopify-section)',
      '.section:not(.shopify-section)',
      '[class*="section"]:not(.shopify-section)',
      '.container',
      '.content',
      '.main'
    ];

    for (const selector of sectionSelectors) {
      const section = element.closest(selector);
      if (section.length > 0) {
        const sectionText = section.text().trim();
        const sectionName = this.extractSectionName(sectionText);
        
        // Skip overly broad sections like .shopify-section
        if (sectionName === 'Section' && selector.includes('shopify-section')) {
          continue;
        }
        
        return {
          name: sectionName,
          selector: this.generateSectionSelector(section)
        };
      }
    }

    return null;
  }

  private findSectionFromHeading(heading: cheerio.Cheerio<any>): { name: string; selector: string } | null {
    // Find the section that contains this heading, prioritizing specific containers
    const sectionSelectors = [
      '.product-card',
      '.product-card-wrapper',
      '.card',
      '.product-item',
      '.product',
      '.featured-collection',
      '.collection',
      '.banner',
      '.hero',
      'section:not(.shopify-section)',
      '.section:not(.shopify-section)',
      '[class*="section"]:not(.shopify-section)',
      '.container',
      '.content'
    ];
    
    for (const selector of sectionSelectors) {
      const section = heading.closest(selector);
      if (section.length > 0) {
        const sectionText = section.text().trim();
        const sectionName = this.extractSectionName(sectionText);
        
        // Skip overly broad sections
        if (sectionName === 'Section' && selector.includes('shopify-section')) {
          continue;
        }
        
        return {
          name: sectionName,
          selector: this.generateSectionSelector(section)
        };
      }
    }

    return null;
  }

  private extractSectionName(sectionText: string): string {
    // Extract a meaningful name from the section text
    const lines = sectionText.split('\n').filter(line => line.trim().length > 0);
    const firstLine = lines[0]?.trim();
    
    if (firstLine && firstLine.length < 50) {
      return firstLine;
    }
    
    return 'Section';
  }

  private generateSectionSelector(section: cheerio.Cheerio<any>): string {
    const el = section[0];
    if (!el || el.type !== 'tag') {
      return 'body';
    }

    // Try to create a stable selector for the section
    const id = section.attr('id');
    if (id && this.isStableId(id)) {
      return `#${id}`;
    }

    const classes = section.attr('class')?.split(' ').filter(c => c.trim()) || [];
    const stableClasses = classes.filter(c => this.isStableClass(c));
    
    if (stableClasses.length > 0) {
      return `.${stableClasses[0]}`;
    }

    return el.name;
  }

  private generateParentSelector(element: cheerio.Cheerio<any>): string {
    const parent = element.parent();
    if (parent.length === 0) {
      return 'body';
    }

    const el = parent[0];
    if (!el || el.type !== 'tag') {
      return 'body';
    }

    const id = parent.attr('id');
    if (id && this.isStableId(id)) {
      return `#${id}`;
    }

    const classes = parent.attr('class')?.split(' ').filter(c => c.trim()) || [];
    const stableClasses = classes.filter(c => this.isStableClass(c));
    
    if (stableClasses.length > 0) {
      return `.${stableClasses[0]}`;
    }

    return el.name;
  }

  private extractSectionKeywords(hypothesis: string): string[] {
    // Extract keywords that might indicate sections
    const sectionKeywords = ['section', 'area', 'part', 'zone', 'block', 'component'];
    const words = hypothesis.toLowerCase().split(/\s+/);
    
    return words.filter(word => 
      word.length > 3 && 
      (sectionKeywords.some(keyword => word.includes(keyword)) || 
       word.includes('price') || word.includes('button') || word.includes('header'))
    );
  }

  private extractKeywords(hypothesis: string): string[] {
    const words = hypothesis.toLowerCase().split(/\s+/);
    return words.filter(word => 
      word.length > 2 && 
      !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'].includes(word)
    );
  }

  private isStableId(id: string): boolean {
    const generatedPatterns = [
      /template--\d+/,
      /slide-\d+/,
      /section-\d+/,
      /block-\d+/,
      /shopify-section-\w+/,
      /^\d+$/,
      /^[a-f0-9]{8,}$/i,
      /^[a-z0-9]{20,}$/i,
      /-\d{10,}$/,
      /^[a-z]+-\d+-\d+/
    ];
    
    return !generatedPatterns.some(pattern => pattern.test(id));
  }

  private isStableClass(className: string): boolean {
    const stablePatterns = [
      /^[a-z]+-[a-z]+$/,
      /^[a-z]+__[a-z]+$/,
      /^[a-z]+--[a-z]+$/,
      /^[a-z]+$/,
      /^[a-z]+-[a-z]+-[a-z]+$/
    ];
    
    const generatedPatterns = [
      /^\d+$/,
      /^[a-f0-9]{8,}$/i,
      /^[a-z0-9]{20,}$/i,
      /-\d{10,}$/,
      /^[a-z]+-\d+/,
      /template--\d+/
    ];
    
    return stablePatterns.some(pattern => pattern.test(className)) && 
           !generatedPatterns.some(pattern => pattern.test(className));
  }
}

// Factory function
export function createSmartScreenshotStrategy(html: string, hypothesis: string): SmartScreenshotStrategy {
  return new SmartScreenshotStrategy(html, hypothesis);
}
