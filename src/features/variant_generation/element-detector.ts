// Multi-Strategy Element Detection System
// Based on Playwright's locator strategy and industry best practices

import * as cheerio from 'cheerio';

export interface ElementCandidate {
  selector: string;
  confidence: number;
  strategy: 'role' | 'text' | 'testid' | 'label' | 'placeholder' | 'title' | 'alt' | 'class' | 'id' | 'position';
  element: {
    tagName: string;
    text?: string;
    attributes: Record<string, string>;
    boundingBox?: { x: number; y: number; width: number; height: number };
  };
  reasoning: string;
}

export interface ElementDetectionResult {
  found: boolean;
  candidates: ElementCandidate[];
  bestMatch?: ElementCandidate;
  suggestions: string[];
}

// Playwright-inspired locator strategies
export class ElementDetector {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  // Main detection method - tries multiple strategies
  async detectElement(hypothesis: string): Promise<ElementDetectionResult> {
    console.log(`[ELEMENT_DETECTOR] Detecting element for hypothesis: "${hypothesis}"`);
    
    const candidates: ElementCandidate[] = [];
    
    // Strategy 1: Role-based detection (most reliable)
    const roleCandidates = this.detectByRole(hypothesis);
    candidates.push(...roleCandidates);
    
    // Strategy 2: Text-based detection
    const textCandidates = this.detectByText(hypothesis);
    candidates.push(...textCandidates);
    
    // Strategy 3: Data attributes
    const testIdCandidates = this.detectByTestId(hypothesis);
    candidates.push(...testIdCandidates);
    
    // Strategy 4: Label-based detection
    const labelCandidates = this.detectByLabel(hypothesis);
    candidates.push(...labelCandidates);
    
    // Strategy 5: Placeholder-based detection
    const placeholderCandidates = this.detectByPlaceholder(hypothesis);
    candidates.push(...placeholderCandidates);
    
    // Strategy 6: Title-based detection
    const titleCandidates = this.detectByTitle(hypothesis);
    candidates.push(...titleCandidates);
    
    // Strategy 7: Alt text detection
    const altCandidates = this.detectByAltText(hypothesis);
    candidates.push(...altCandidates);
    
    // Strategy 8: Semantic class detection
    const classCandidates = this.detectBySemanticClass(hypothesis);
    candidates.push(...classCandidates);
    
    // Strategy 9: Stable ID detection
    const idCandidates = this.detectByStableId(hypothesis);
    candidates.push(...idCandidates);
    
    // Strategy 10: Position-based detection (last resort)
    const positionCandidates = this.detectByPosition(hypothesis);
    candidates.push(...positionCandidates);
    
    // Remove duplicates and validate selectors
    const uniqueCandidates = this.deduplicateAndValidate(candidates);
    
    // Sort by confidence and strategy priority
    const sortedCandidates = this.sortCandidates(uniqueCandidates);
    
    const bestMatch = sortedCandidates.length > 0 ? sortedCandidates[0] : undefined;
    
    return {
      found: sortedCandidates.length > 0,
      candidates: sortedCandidates,
      bestMatch,
      suggestions: this.generateSuggestions(hypothesis, sortedCandidates)
    };
  }

  // Strategy 1: Role-based detection (Playwright's getByRole)
  private detectByRole(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const roleKeywords = this.extractRoleKeywords(hypothesis);
    
    // Common role mappings
    const roleMap: Record<string, string[]> = {
      'button': ['button', 'link', 'summary'],
      'heading': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      'textbox': ['input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'textarea'],
      'link': ['a'],
      'image': ['img'],
      'list': ['ul', 'ol'],
      'listitem': ['li'],
      'navigation': ['nav'],
      'main': ['main'],
      'article': ['article'],
      'section': ['section'],
      'form': ['form']
    };
    
    for (const keyword of roleKeywords) {
      const roles = roleMap[keyword.toLowerCase()] || [];
      
      for (const role of roles) {
        const elements = this.$(role);
        
        elements.each((_, el) => {
          const $el = this.$(el);
          const text = $el.text().trim();
          const attributes = this.getElementAttributes($el);
          
          // Check if element has explicit role attribute
          const explicitRole = attributes.role;
          if (explicitRole && explicitRole.toLowerCase().includes(keyword.toLowerCase())) {
            const tagName = el.type === 'tag' ? el.name : 'unknown';
            candidates.push({
              selector: `${tagName}[role="${explicitRole}"]`,
              confidence: 0.95,
              strategy: 'role',
              element: {
                tagName,
                text,
                attributes
              },
              reasoning: `Element with explicit role="${explicitRole}" matches "${keyword}"`
            });
          }
          
          // Check if element type matches role
          if (el.type === 'tag' && roles.includes(el.name)) {
            candidates.push({
              selector: el.name,
              confidence: 0.8,
              strategy: 'role',
              element: {
                tagName: el.name,
                text,
                attributes
              },
              reasoning: `Element type "${el.name}" matches role "${keyword}"`
            });
          }
        });
      }
    }
    
    return candidates;
  }

  // Strategy 2: Text-based detection (Playwright's getByText)
  private detectByText(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const textKeywords = this.extractTextKeywords(hypothesis);
    
    for (const keyword of textKeywords) {
      // Instead of using :contains() which can break with special chars,
      // iterate through all elements and check text content
      this.$('*').each((_, el) => {
        const $el = this.$(el);
        const text = $el.text().trim();
        
        // Only consider elements where the text matches exactly or is contained
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          const attributes = this.getElementAttributes($el);
          const tagName = el.type === 'tag' ? el.name : 'unknown';
          
          // Generate multiple selectors for this element
          const selectors = this.generateTextSelectors($el, keyword);
          
          for (const selector of selectors) {
            candidates.push({
              selector,
              confidence: text.toLowerCase() === keyword.toLowerCase() ? 0.9 : 0.7,
              strategy: 'text',
              element: {
                tagName,
                text,
                attributes
              },
              reasoning: `Element contains text "${keyword}"`
            });
          }
        }
      });
    }
    
    return candidates;
  }

  // Strategy 3: Data attributes (Playwright's getByTestId)
  private detectByTestId(_hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    
    // Look for data-testid attributes
    const testIdElements = this.$('[data-testid]');
    
    testIdElements.each((_, el) => {
      const $el = this.$(el);
      const testId = $el.attr('data-testid');
      const text = $el.text().trim();
      const attributes = this.getElementAttributes($el);
      const tagName = el.type === 'tag' ? el.name : 'unknown';
      
      if (testId) {
        candidates.push({
          selector: `[data-testid="${testId}"]`,
          confidence: 0.95,
          strategy: 'testid',
          element: {
            tagName,
            text,
            attributes
          },
          reasoning: `Element has data-testid="${testId}"`
        });
      }
    });
    
    return candidates;
  }

  // Strategy 4: Label-based detection (Playwright's getByLabel)
  private detectByLabel(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const labelKeywords = this.extractLabelKeywords(hypothesis);
    
    for (const keyword of labelKeywords) {
      // Iterate through all labels to avoid :contains() breaking with special chars
      const labels = this.$('label');
      
      labels.each((_, labelEl) => {
        const $label = this.$(labelEl);
        const labelText = $label.text().trim();
        
        // Skip if label doesn't contain keyword
        if (!labelText.toLowerCase().includes(keyword.toLowerCase())) {
          return;
        }
        
        const forAttr = $label.attr('for');
        
        if (forAttr) {
          // Find the associated input
          const input = this.$(`#${forAttr}`);
          if (input.length > 0) {
            const attributes = this.getElementAttributes(input);
            candidates.push({
              selector: `#${forAttr}`,
              confidence: 0.9,
              strategy: 'label',
              element: {
                tagName: input[0].type === 'tag' ? input[0].name : 'unknown',
                text: input.text().trim(),
                attributes
              },
              reasoning: `Input associated with label containing "${keyword}"`
            });
          }
        }
      });
    }
    
    return candidates;
  }

  // Strategy 5: Placeholder-based detection (Playwright's getByPlaceholder)
  private detectByPlaceholder(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const placeholderKeywords = this.extractPlaceholderKeywords(hypothesis);
    
    for (const keyword of placeholderKeywords) {
      const inputs = this.$(`input[placeholder*="${keyword}"]`);
      
      inputs.each((_, el) => {
        const $el = this.$(el);
        const placeholder = $el.attr('placeholder');
        const attributes = this.getElementAttributes($el);
        
        candidates.push({
          selector: `input[placeholder="${placeholder}"]`,
          confidence: 0.85,
          strategy: 'placeholder',
          element: {
            tagName: el.name,
            text: $el.text().trim(),
            attributes
          },
          reasoning: `Input with placeholder containing "${keyword}"`
        });
      });
    }
    
    return candidates;
  }

  // Strategy 6: Title-based detection (Playwright's getByTitle)
  private detectByTitle(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const titleKeywords = this.extractTitleKeywords(hypothesis);
    
    for (const keyword of titleKeywords) {
      const elements = this.$(`[title*="${keyword}"]`);
      
      elements.each((_, el) => {
        const $el = this.$(el);
        const title = $el.attr('title');
        const attributes = this.getElementAttributes($el);
        
        candidates.push({
          selector: `[title="${title}"]`,
          confidence: 0.8,
          strategy: 'title',
          element: {
            tagName: el.name,
            text: $el.text().trim(),
            attributes
          },
          reasoning: `Element with title containing "${keyword}"`
        });
      });
    }
    
    return candidates;
  }

  // Strategy 7: Alt text detection (Playwright's getByAltText)
  private detectByAltText(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const altKeywords = this.extractAltKeywords(hypothesis);
    
    for (const keyword of altKeywords) {
      const images = this.$(`img[alt*="${keyword}"]`);
      
      images.each((_, el) => {
        const $el = this.$(el);
        const alt = $el.attr('alt');
        const attributes = this.getElementAttributes($el);
        
        candidates.push({
          selector: `img[alt="${alt}"]`,
          confidence: 0.85,
          strategy: 'alt',
          element: {
            tagName: el.name,
            text: alt || '',
            attributes
          },
          reasoning: `Image with alt text containing "${keyword}"`
        });
      });
    }
    
    return candidates;
  }

  // Strategy 8: Semantic class detection
  private detectBySemanticClass(hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    const classKeywords = this.extractClassKeywords(hypothesis);
    
    for (const keyword of classKeywords) {
      // Look for classes that contain the keyword
      const elements = this.$(`[class*="${keyword}"]`);
      
      elements.each((_, el) => {
        const $el = this.$(el);
        const classes = $el.attr('class')?.split(' ') || [];
        const matchingClasses = classes.filter(cls => 
          cls.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (matchingClasses.length > 0) {
          const attributes = this.getElementAttributes($el);
          
          // Generate selectors for matching classes
          for (const className of matchingClasses) {
            candidates.push({
              selector: `.${className}`,
              confidence: 0.7,
              strategy: 'class',
              element: {
                tagName: el.name,
                text: $el.text().trim(),
                attributes
              },
              reasoning: `Element with class containing "${keyword}"`
            });
          }
        }
      });
    }
    
    return candidates;
  }

  // Strategy 9: Stable ID detection
  private detectByStableId(_hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    
    // Find elements with IDs that don't look generated
    const elementsWithIds = this.$('[id]');
    
    elementsWithIds.each((_, el) => {
      const $el = this.$(el);
      const id = $el.attr('id');
      
      if (id && this.isStableId(id)) {
        const attributes = this.getElementAttributes($el);
        
        candidates.push({
          selector: `#${id}`,
          confidence: 0.8,
          strategy: 'id',
          element: {
            tagName: el.name,
            text: $el.text().trim(),
            attributes
          },
          reasoning: `Element with stable ID "${id}"`
        });
      }
    });
    
    return candidates;
  }

  // Strategy 10: Position-based detection (last resort)
  private detectByPosition(_hypothesis: string): ElementCandidate[] {
    const candidates: ElementCandidate[] = [];
    
    // This would be implemented based on specific needs
    // For now, return empty array as position-based detection is fragile
    
    return candidates;
  }

  // Helper methods
  private extractRoleKeywords(hypothesis: string): string[] {
    const roleKeywords = ['button', 'heading', 'textbox', 'link', 'image', 'list', 'navigation', 'form'];
    return roleKeywords.filter(keyword => 
      hypothesis.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  private extractTextKeywords(hypothesis: string): string[] {
    // Extract meaningful text from hypothesis
    const words = hypothesis.toLowerCase().split(/\s+/);
    return words.filter(word => 
      word.length > 2 && 
      !['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'].includes(word)
    );
  }

  private extractLabelKeywords(hypothesis: string): string[] {
    return this.extractTextKeywords(hypothesis);
  }

  private extractPlaceholderKeywords(hypothesis: string): string[] {
    return this.extractTextKeywords(hypothesis);
  }

  private extractTitleKeywords(hypothesis: string): string[] {
    return this.extractTextKeywords(hypothesis);
  }

  private extractAltKeywords(hypothesis: string): string[] {
    return this.extractTextKeywords(hypothesis);
  }

  private extractClassKeywords(hypothesis: string): string[] {
    return this.extractTextKeywords(hypothesis);
  }

  private getElementAttributes($el: cheerio.Cheerio<any>): Record<string, string> {
    const attributes: Record<string, string> = {};
    const el = $el[0];
    
    if (el && el.type === 'tag') {
      Object.keys(el.attribs || {}).forEach(key => {
        attributes[key] = el.attribs[key];
      });
    }
    
    return attributes;
  }

  private generateTextSelectors($el: cheerio.Cheerio<any>, _keyword: string): string[] {
    const selectors: string[] = [];
    const el = $el[0];
    
    if (el && el.type === 'tag') {
      const tagName = el.name;
      const classes = $el.attr('class');
      const id = $el.attr('id');
      
      // Prioritize ID if available
      if (id && this.isStableId(id)) {
        selectors.push(`#${id}`);
      }
      
      // Tag + class (don't use :contains() - it breaks with special chars)
      if (classes) {
        const classList = classes.split(' ').filter(c => c.trim());
        if (classList.length > 0) {
          selectors.push(`${tagName}.${classList[0]}`);
        }
      }
      
      // Just tag name as fallback
      selectors.push(tagName);
    }
    
    return selectors;
  }

  private isStableId(id: string): boolean {
    // Check if ID looks stable (not generated)
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

  private deduplicateAndValidate(candidates: ElementCandidate[]): ElementCandidate[] {
    const seen = new Set<string>();
    const valid: ElementCandidate[] = [];
    
    for (const candidate of candidates) {
      if (!seen.has(candidate.selector)) {
        // Validate selector
        try {
          this.$(candidate.selector);
          seen.add(candidate.selector);
          valid.push(candidate);
        } catch (error) {
          // Skip invalid selectors
          console.warn(`[ELEMENT_DETECTOR] Invalid selector: ${candidate.selector}`);
        }
      }
    }
    
    return valid;
  }

  private sortCandidates(candidates: ElementCandidate[]): ElementCandidate[] {
    // Strategy priority (higher number = higher priority)
    const strategyPriority: Record<string, number> = {
      'testid': 9,
      'role': 8,
      'label': 7,
      'alt': 6,
      'title': 5,
      'placeholder': 4,
      'text': 3,
      'id': 2,
      'class': 1,
      'position': 0
    };
    
    return candidates.sort((a, b) => {
      // First by strategy priority
      const aPriority = strategyPriority[a.strategy] || 0;
      const bPriority = strategyPriority[b.strategy] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Then by confidence
      return b.confidence - a.confidence;
    });
  }

  private generateSuggestions(_hypothesis: string, candidates: ElementCandidate[]): string[] {
    const suggestions: string[] = [];
    
    if (candidates.length === 0) {
      suggestions.push('Try adding data-testid attributes to elements for more reliable targeting');
      suggestions.push('Consider using more specific text content in the hypothesis');
      suggestions.push('Check if the element exists on the current page');
    } else {
      suggestions.push(`Found ${candidates.length} potential elements using multiple strategies`);
      suggestions.push(`Best match: ${candidates[0].strategy} strategy with ${candidates[0].confidence * 100}% confidence`);
    }
    
    return suggestions;
  }
}

// Factory function
export function createElementDetector(html: string): ElementDetector {
  return new ElementDetector(html);
}
