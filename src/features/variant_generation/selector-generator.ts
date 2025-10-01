// Rule-based CSS Selector Generator
// Implements industry best practices for stable, valid selectors
import { Page } from 'playwright';
import * as cheerio from 'cheerio';

export interface SelectorCandidate {
  selector: string;
  confidence: number; // 0-1
  strategy: string;
  reasoning: string;
  isValid?: boolean;
}

export interface SelectorGenerationResult {
  primary: string;
  fallbacks: string[];
  allCandidates: SelectorCandidate[];
}

export class SelectorGenerator {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  /**
   * Generate ranked selectors for an element based on description
   * Following industry best practices: ID > data-* > stable class > tag+position
   */
  generateSelectorsForElement(elementDescription: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];

    // Strategy 1: ID-based selectors (highest priority)
    const idSelectors = this.generateIdSelectors(elementDescription);
    candidates.push(...idSelectors);

    // Strategy 2: Data attribute selectors
    const dataSelectors = this.generateDataAttributeSelectors(elementDescription);
    candidates.push(...dataSelectors);

    // Strategy 3: Stable class selectors
    const classSelectors = this.generateStableClassSelectors(elementDescription);
    candidates.push(...classSelectors);

    // Strategy 4: Role/ARIA selectors
    const ariaSelectors = this.generateAriaSelectors(elementDescription);
    candidates.push(...ariaSelectors);

    // Strategy 5: Text-based selectors (lower priority)
    const textSelectors = this.generateTextSelectors(elementDescription);
    candidates.push(...textSelectors);

    // Strategy 6: Position-based fallbacks (last resort)
    const positionSelectors = this.generatePositionSelectors(elementDescription);
    candidates.push(...positionSelectors);

    // Sort by confidence (highest first)
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  private generateIdSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      const elements = this.$(`[id*="${keyword}"]`);
      elements.each((_, el) => {
        const $el = this.$(el);
        const id = $el.attr('id');
        if (id && this.isStableId(id)) {
          candidates.push({
            selector: `#${id}`,
            confidence: 0.95,
            strategy: 'id',
            reasoning: `Stable ID attribute: ${id}`
          });
        }
      });
    }

    return candidates;
  }

  private generateDataAttributeSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    // Look for data-testid, data-cy, data-test, etc.
    const dataAttrs = ['data-testid', 'data-cy', 'data-test', 'data-qa'];
    
    for (const attr of dataAttrs) {
      for (const keyword of keywords) {
        const elements = this.$(`[${attr}*="${keyword}"]`);
        elements.each((_, el) => {
          const $el = this.$(el);
          const value = $el.attr(attr);
          if (value) {
            candidates.push({
              selector: `[${attr}="${value}"]`,
              confidence: 0.90,
              strategy: 'data-attribute',
              reasoning: `Stable data attribute: ${attr}="${value}"`
            });
          }
        });
      }
    }

    return candidates;
  }

  private generateStableClassSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      const elements = this.$(`[class*="${keyword}"]`);
      elements.each((_, el) => {
        const $el = this.$(el);
        const classes = $el.attr('class')?.split(' ') || [];
        const stableClasses = classes.filter(c => this.isStableClass(c));
        const tagName = (el as any).name;

        if (stableClasses.length > 0) {
          const selector = `${tagName}.${stableClasses[0]}`;
          candidates.push({
            selector,
            confidence: 0.75,
            strategy: 'stable-class',
            reasoning: `Stable class on ${tagName}: ${stableClasses[0]}`
          });
        }
      });
    }

    return candidates;
  }

  private generateAriaSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      // aria-label
      const labelElements = this.$(`[aria-label*="${keyword}"]`);
      labelElements.each((_, el) => {
        const $el = this.$(el);
        const label = $el.attr('aria-label');
        if (label) {
          candidates.push({
            selector: `[aria-label="${label}"]`,
            confidence: 0.85,
            strategy: 'aria-label',
            reasoning: `ARIA label: ${label}`
          });
        }
      });

      // role
      const roleElements = this.$(`[role*="${keyword}"]`);
      roleElements.each((_, el) => {
        const $el = this.$(el);
        const role = $el.attr('role');
        if (role) {
          candidates.push({
            selector: `[role="${role}"]`,
            confidence: 0.80,
            strategy: 'role',
            reasoning: `ARIA role: ${role}`
          });
        }
      });
    }

    return candidates;
  }

  private generateTextSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      // Button with text
      const buttons = this.$(`button`);
      buttons.each((_, el) => {
        const $el = this.$(el);
        const text = $el.text().trim().toLowerCase();
        if (text.includes(keyword.toLowerCase())) {
          const exactText = $el.text().trim();
          candidates.push({
            selector: `button:has-text("${exactText}")`,
            confidence: 0.65,
            strategy: 'text-content',
            reasoning: `Button with text: "${exactText}"`
          });
        }
      });

      // Link with text
      const links = this.$(`a`);
      links.each((_, el) => {
        const $el = this.$(el);
        const text = $el.text().trim().toLowerCase();
        if (text.includes(keyword.toLowerCase())) {
          const exactText = $el.text().trim();
          candidates.push({
            selector: `a:has-text("${exactText}")`,
            confidence: 0.65,
            strategy: 'text-content',
            reasoning: `Link with text: "${exactText}"`
          });
        }
      });
    }

    return candidates;
  }

  private generatePositionSelectors(description: string): SelectorCandidate[] {
    const candidates: SelectorCandidate[] = [];
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      const elements = this.$(`[class*="${keyword}"]`);
      elements.each((_, el) => {
        const $el = this.$(el);
        const tagName = (el as any).name;
        const parent = $el.parent();
        
        if (parent.length > 0) {
          const parentTag = (parent[0] as any).name;
          const nthChild = $el.index() + 1;
          
          candidates.push({
            selector: `${parentTag} > ${tagName}:nth-child(${nthChild})`,
            confidence: 0.50,
            strategy: 'position',
            reasoning: `Position-based: ${nthChild}th child of ${parentTag}`
          });
        }
      });
    }

    return candidates;
  }

  /**
   * Validate selectors against live DOM using Playwright
   */
  async validateSelectors(page: Page, candidates: SelectorCandidate[]): Promise<SelectorCandidate[]> {
    const validated: SelectorCandidate[] = [];

    for (const candidate of candidates) {
      try {
        // Convert Playwright-specific syntax to standard CSS
        const cssSelector = candidate.selector.replace(/:has-text\("([^"]+)"\)/, '');
        
        const count = await page.locator(cssSelector).count();
        
        if (count === 0) {
          console.log(`[SELECTOR_VALIDATOR] ❌ ${candidate.selector} - matches 0 elements`);
          candidate.isValid = false;
          continue;
        }
        
        if (count > 1) {
          console.log(`[SELECTOR_VALIDATOR] ⚠️  ${candidate.selector} - matches ${count} elements (not unique)`);
          candidate.confidence = candidate.confidence * 0.5; // Penalize non-unique
          candidate.isValid = true;
          validated.push(candidate);
          continue;
        }

        // Check if visible
        const isVisible = await page.locator(cssSelector).isVisible();
        if (!isVisible) {
          console.log(`[SELECTOR_VALIDATOR] ⚠️  ${candidate.selector} - element not visible`);
          candidate.confidence = candidate.confidence * 0.7; // Penalize invisible
          candidate.isValid = true;
          validated.push(candidate);
          continue;
        }

        console.log(`[SELECTOR_VALIDATOR] ✅ ${candidate.selector} - valid unique visible element`);
        candidate.isValid = true;
        validated.push(candidate);

      } catch (error) {
        console.error(`[SELECTOR_VALIDATOR] ❌ ${candidate.selector} - invalid CSS:`, error);
        candidate.isValid = false;
      }
    }

    // Re-sort by confidence after validation adjustments
    return validated.sort((a, b) => b.confidence - a.confidence);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
  }

  private isStableId(id: string): boolean {
    const generatedPatterns = [
      /^\d+$/,                    // Pure numbers
      /^[a-f0-9]{8,}$/i,         // Hex strings (IDs)
      /^[a-z0-9]{20,}$/i,        // Random strings
      /-\d{10,}$/,               // Timestamps
      /^[a-z]+-\d+-\d+/,         // Generated patterns
      /template--\d+/,           // Shopify templates
      /slide-\d+/,               // Dynamic slides
    ];
    
    return !generatedPatterns.some(pattern => pattern.test(id));
  }

  private isStableClass(className: string): boolean {
    const stablePatterns = [
      /^[a-z]+-[a-z]+$/,         // BEM-like
      /^[a-z]+__[a-z]+$/,        // BEM block__element
      /^[a-z]+--[a-z]+$/,        // BEM block--modifier
      /^[a-z]+$/,                // Simple words
    ];
    
    const generatedPatterns = [
      /^\d+$/,
      /^[a-f0-9]{8,}$/i,
      /^[a-z0-9]{20,}$/i,
      /-\d{10,}$/,
    ];
    
    return stablePatterns.some(p => p.test(className)) && 
           !generatedPatterns.some(p => p.test(className));
  }
}

// Factory function
export function createSelectorGenerator(html: string): SelectorGenerator {
  return new SelectorGenerator(html);
}
