// Hypothesis-Aware Selector Generation
// This module provides intelligent selector generation based on hypothesis context

import * as cheerio from 'cheerio';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { getAIConfig } from '@shared/ai-config';

export interface HypothesisSelector {
  selector: string;
  confidence: number;
  context: {
    elementText?: string;
    elementType: string;
    parentContext?: string;
    siblingContext?: string;
    htmlSnippet: string;
  };
  reasoning: string;
  alternativeSelectors: string[];
  validation: {
    exists: boolean;
    unique: boolean;
    stable: boolean;
  };
}

const selectorGenerationSchema = z.object({
  primary_selector: z.string().describe('The most specific CSS selector for the target element'),
  element_identifier: z.string().describe('Natural language description of what element we are looking for'),
  search_strategy: z.enum(['text_content', 'section_heading', 'structural', 'semantic']).describe('How to find this element'),
  alternative_selectors: z.array(z.string()).describe('Fallback selectors in order of preference'),
  confidence: z.number().min(0).max(1).describe('Confidence between 0 and 1 (e.g., 0.95 for 95% confidence)'),
  reasoning: z.string().describe('Why this selector was chosen')
});

export class HypothesisAwareSelectorGenerator {
  private $: cheerio.CheerioAPI;
  private html: string;

  constructor(html: string) {
    this.html = html;
    this.$ = cheerio.load(html);
  }

  async generateSelector(hypothesis: string): Promise<HypothesisSelector[]> {
    console.log(`[HYPOTHESIS_SELECTOR] Generating selector for: "${hypothesis}"`);

    // Step 1: Use AI to understand what element we're looking for
    const aiConfig = getAIConfig();
    const elementIdentification = await generateObject({
      model: google(aiConfig.model),
      schema: selectorGenerationSchema,
      messages: [{
        role: 'user',
        content: this.buildIdentificationPrompt(hypothesis)
      }]
    });

    const result = elementIdentification.object;
    console.log(`[HYPOTHESIS_SELECTOR] AI identified element: ${result.element_identifier}`);
    console.log(`[HYPOTHESIS_SELECTOR] Search strategy: ${result.search_strategy}`);

    // Step 2: Find the element based on the AI's understanding
    const candidates = await this.findElementCandidates(result);

    // Step 3: Validate and rank the candidates
    const validatedCandidates = this.validateAndRankCandidates(candidates, hypothesis);

    console.log(`[HYPOTHESIS_SELECTOR] Found ${validatedCandidates.length} validated candidates`);
    return validatedCandidates;
  }

  private buildIdentificationPrompt(hypothesis: string): string {
    return `Analyze this A/B test hypothesis and identify the exact DOM element that needs to be modified:

HYPOTHESIS: "${hypothesis}"

Based on this hypothesis, determine:
1. What specific element or section is being targeted (be very specific)
2. How to best find this element (text content, heading, structure, or semantic markup)
3. Generate CSS selectors that would target this element

IMPORTANT:
- If the hypothesis mentions a specific section name (e.g., "Engineered for Every Turn"), look for that exact text
- If it mentions a button or link, identify it by its text content
- Generate multiple selector strategies for reliability
- Avoid using generated IDs or classes with numbers
- Confidence must be a decimal between 0 and 1 (e.g., 0.95 for 95% confidence)

HTML STRUCTURE TO ANALYZE:
${this.getRelevantHtmlSnippet()}

Return selectors that precisely target the element mentioned in the hypothesis.
The confidence field must be a decimal value between 0 and 1.`;
  }

  private getRelevantHtmlSnippet(): string {
    // Extract relevant parts of HTML for analysis
    // Focus on main content areas, avoiding scripts and styles
    const mainContent = this.$('main, [role="main"], body').html() || this.html;

    // Truncate to reasonable size while preserving structure
    const maxLength = 30000;
    if (mainContent.length > maxLength) {
      // Try to find natural break points
      const truncated = mainContent.substring(0, maxLength);
      const lastCloseTag = truncated.lastIndexOf('</');
      if (lastCloseTag > maxLength * 0.8) {
        return truncated.substring(0, lastCloseTag);
      }
      return truncated;
    }

    return mainContent;
  }

  private async findElementCandidates(aiResult: any): Promise<HypothesisSelector[]> {
    const candidates: HypothesisSelector[] = [];

    // Try each selector suggested by AI (limit to first 10 to avoid infinite loops)
    const allSelectors = [aiResult.primary_selector, ...aiResult.alternative_selectors].slice(0, 10);

    for (const selector of allSelectors) {
      try {
        const elements = this.$(selector);

        if (elements.length === 0) {
          console.log(`[HYPOTHESIS_SELECTOR] Selector "${selector}" found no elements`);
          continue;
        }

        if (elements.length > 1) {
          console.log(`[HYPOTHESIS_SELECTOR] Selector "${selector}" found ${elements.length} elements - may need section-level targeting`);
          // For some hypotheses, we might want to target a section that contains multiple elements
          // Create a candidate anyway but with lower confidence
          const element = elements.first();
          const candidate = this.createCandidate(element, selector,
            `${aiResult.reasoning} (targets section with ${elements.length} elements)`);
          candidate.confidence = candidate.confidence * 0.5; // Lower confidence for multi-match
          candidates.push(candidate);
          continue;
        }

        // Found exactly one element - create candidate
        const element = elements.first();
        const candidate = this.createCandidate(element, selector, aiResult.reasoning);
        candidates.push(candidate);

      } catch (error) {
        console.log(`[HYPOTHESIS_SELECTOR] Invalid selector "${selector}": ${error}`);
      }
    }

    // If no candidates found, try text-based search
    if (candidates.length === 0 && aiResult.element_identifier) {
      console.log(`[HYPOTHESIS_SELECTOR] No candidates found, trying text-based search`);
      const textBasedCandidates = this.findByText(aiResult.element_identifier);
      candidates.push(...textBasedCandidates);
    }

    return candidates;
  }

  private findByText(searchText: string): HypothesisSelector[] {
    const candidates: HypothesisSelector[] = [];

    // Search for elements containing the text
    this.$('*').each((_, el) => {
      const $el = this.$(el);
      const text = $el.text().trim();

      // Look for exact or close matches
      if (text.toLowerCase().includes(searchText.toLowerCase())) {
        // Check if this is the most specific element with this text
        const children = $el.children();
        const hasTextDirectly = $el.clone().children().remove().end().text().trim()
          .toLowerCase().includes(searchText.toLowerCase());

        if (hasTextDirectly || children.length === 0) {
          // Generate a selector for this element
          const selector = this.generateSelectorForElement($el);
          if (selector) {
            const candidate = this.createCandidate($el, selector,
              `Found by text content: "${searchText}"`);
            candidates.push(candidate);
          }
        }
      }
    });

    return candidates;
  }

  private generateSelectorForElement($el: cheerio.Cheerio<any>): string | null {
    const element = $el[0];
    if (!element || element.type !== 'tag') return null;

    const tagName = element.name;
    const id = $el.attr('id');
    const classes = $el.attr('class');
    const dataTestId = $el.attr('data-testid');

    // Prefer data-testid
    if (dataTestId) {
      return `[data-testid="${dataTestId}"]`;
    }

    // Use ID if it looks stable
    if (id && !this.isGeneratedId(id)) {
      return `#${id}`;
    }

    // Use semantic classes
    if (classes) {
      const classList = classes.split(' ').filter(c => c.trim());
      const stableClasses = classList.filter(c => !this.isGeneratedClass(c));
      if (stableClasses.length > 0) {
        return `${tagName}.${stableClasses.join('.')}`;
      }
    }

    // Generate path-based selector
    return this.generatePathSelector($el);
  }

  private generatePathSelector($el: cheerio.Cheerio<any>): string {
    const path: string[] = [];
    let current = $el;

    while (current.length > 0 && current[0].name !== 'body') {
      const element = current[0];
      if (element.type !== 'tag') break;

      const tagName = element.name;
      const id = current.attr('id');
      const classes = current.attr('class');

      let selector = tagName;

      if (id && !this.isGeneratedId(id)) {
        path.unshift(`#${id}`);
        break; // ID is unique, no need to go further
      }

      if (classes) {
        const classList = classes.split(' ').filter(c => c.trim());
        const stableClasses = classList.filter(c => !this.isGeneratedClass(c));
        if (stableClasses.length > 0) {
          selector = `${tagName}.${stableClasses[0]}`;
        }
      }

      // Add index if there are siblings of same type
      const siblings = current.siblings(tagName);
      if (siblings.length > 0) {
        const index = current.index() + 1;
        selector = `${selector}:nth-of-type(${index})`;
      }

      path.unshift(selector);
      current = current.parent();
    }

    return path.join(' > ');
  }


  private createCandidate(
    $el: cheerio.Cheerio<any>,
    selector: string,
    reasoning: string
  ): HypothesisSelector {
    const element = $el[0];
    const parent = $el.parent();
    const htmlSnippet = this.$.html($el[0]).substring(0, 500);

    return {
      selector,
      confidence: 0.8,
      context: {
        elementText: $el.text().trim().substring(0, 100),
        elementType: element.type === 'tag' ? element.name : 'unknown',
        parentContext: parent.length > 0 ? parent[0].name : undefined,
        siblingContext: $el.siblings().length > 0 ? `${$el.siblings().length} siblings` : undefined,
        htmlSnippet
      },
      reasoning,
      alternativeSelectors: this.generateAlternativeSelectors($el),
      validation: {
        exists: true,
        unique: this.$(selector).length === 1,
        stable: !this.hasGeneratedPatterns(selector)
      }
    };
  }

  private generateAlternativeSelectors($el: cheerio.Cheerio<any>): string[] {
    const alternatives: string[] = [];

    // Try different selector strategies
    const strategies = [
      () => this.generatePathSelector($el),
      () => this.generateAttributeSelector($el),
      () => this.generateTextSelector($el),
      () => this.generateStructuralSelector($el)
    ];

    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && !alternatives.includes(selector)) {
        alternatives.push(selector);
      }
    }

    return alternatives.slice(0, 5); // Limit to 5 alternatives
  }

  private generateAttributeSelector($el: cheerio.Cheerio<any>): string | null {
    const attrs = $el.attr();
    if (!attrs) return null;

    const tagName = $el[0].name;
    const stableAttrs = ['role', 'aria-label', 'type', 'name', 'placeholder'];

    for (const attr of stableAttrs) {
      if (attrs[attr]) {
        return `${tagName}[${attr}="${attrs[attr]}"]`;
      }
    }

    return null;
  }

  private generateTextSelector($el: cheerio.Cheerio<any>): string | null {
    const text = $el.text().trim();
    if (!text || text.length > 50) return null;

    const tagName = $el[0].name;
    // Note: :contains is not standard CSS but works with cheerio
    return `${tagName}:contains("${text.substring(0, 30)}")`;
  }

  private generateStructuralSelector($el: cheerio.Cheerio<any>): string | null {
    const parent = $el.parent();
    if (parent.length === 0) return null;

    const parentTag = parent[0].name;
    const tagName = $el[0].name;
    const index = $el.index() + 1;

    return `${parentTag} > ${tagName}:nth-child(${index})`;
  }

  private validateAndRankCandidates(
    candidates: HypothesisSelector[],
    hypothesis: string
  ): HypothesisSelector[] {
    // Score and rank candidates
    const scored = candidates.map(candidate => {
      let score = 0;

      // Validation scores
      if (candidate.validation.exists) score += 3;
      if (candidate.validation.unique) score += 3;
      if (candidate.validation.stable) score += 2;

      // Context relevance
      const hypWords = hypothesis.toLowerCase().split(/\s+/);
      const contextText = (candidate.context.elementText || '').toLowerCase();
      for (const word of hypWords) {
        if (contextText.includes(word)) score += 1;
      }

      // Confidence from AI
      score += candidate.confidence * 5;

      return { candidate, score };
    });

    // Sort by score and return
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.candidate);
  }

  private isGeneratedId(id: string): boolean {
    const patterns = [
      /template--\d+/,
      /\d{10,}/,
      /^[a-f0-9]{8,}$/i
    ];
    return patterns.some(p => p.test(id));
  }

  private isGeneratedClass(className: string): boolean {
    const patterns = [
      /^\d+$/,
      /^[a-f0-9]{8,}$/i,
      /-\d{10,}$/
    ];
    return patterns.some(p => p.test(className));
  }

  private hasGeneratedPatterns(selector: string): boolean {
    return this.isGeneratedId(selector) ||
           selector.includes('template--') ||
           selector.includes('shopify-section-');
  }
}

export function createHypothesisAwareSelector(html: string): HypothesisAwareSelectorGenerator {
  return new HypothesisAwareSelectorGenerator(html);
}