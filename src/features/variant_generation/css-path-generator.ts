/**
 * CSS Path Generator
 * Generates unique, specific CSS selectors for elements
 * Based on best practices for A/B testing selector generation
 */

import * as cheerio from 'cheerio';

export class CSSPathGenerator {
  private $: cheerio.CheerioAPI;

  constructor(html: string) {
    this.$ = cheerio.load(html);
  }

  /**
   * Generate a unique CSS selector for an element
   * Priority order:
   * 1. ID (if unique and not auto-generated)
   * 2. Data attributes (data-testid, data-test, etc.)
   * 3. Unique class combinations
   * 4. Semantic attributes (aria-label, name, etc.)
   * 5. Full path with nth-child
   */
  generateSelector(element: cheerio.Cheerio): string {
    // Try ID first (only if really unique and not generated)
    const id = element.attr('id');
    if (id && this.isValidId(id) && id.length > 5) {
      const selector = `#${id}`;
      if (this.isUniqueSelector(selector)) {
        return selector;
      }
    }

    // Try data attributes
    const dataSelector = this.tryDataAttributes(element);
    if (dataSelector) return dataSelector;

    // For generic elements (button, link, li, etc.), always use full path
    const tagName = element[0].name;
    const genericTags = ['button', 'a', 'li', 'div', 'span', 'p', 'ul', 'ol', 'section', 'article', 'input'];
    if (genericTags.includes(tagName)) {
      return this.generateFullPath(element);
    }

    // Try unique class combinations only for non-generic elements
    const classSelector = this.tryUniqueClasses(element);
    if (classSelector) {
      // Even if we find a unique class, prefer full path for better specificity
      const classes = element.attr('class')?.split(' ') || [];
      const hasSemanticClass = classes.some(cls =>
        cls.includes('-') || cls.includes('_') || cls.includes('__')
      );

      // Only use class selector if it has semantic classes
      if (hasSemanticClass) {
        return classSelector;
      }
    }

    // Try semantic attributes
    const semanticSelector = this.trySemanticAttributes(element);
    if (semanticSelector) return semanticSelector;

    // Default to full path for maximum specificity
    return this.generateFullPath(element);
  }

  /**
   * Generate the full CSS path with nth-child selectors
   * This always generates a unique selector
   */
  generateFullPath(element: cheerio.Cheerio): string {
    const path: string[] = [];
    let current = element;

    while (current.length && current[0].name !== 'html') {
      const tagName = current[0].name;

      // Get the element's position among siblings of the same type
      const siblings = current.parent().children(tagName);
      const index = siblings.index(current[0]) + 1;

      let selector = tagName;

      // Add ID if available and valid
      const id = current.attr('id');
      if (id && this.isValidId(id)) {
        selector = `${tagName}#${id}`;
      }
      // Add important classes
      else if (current.attr('class')) {
        const classes = this.getImportantClasses(current);
        if (classes.length > 0) {
          selector = `${tagName}.${classes.join('.')}`;
        }
      }

      // Add nth-child if there are multiple siblings
      if (siblings.length > 1) {
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);

      // Stop at unique identifier
      if (id && this.isValidId(id)) {
        break;
      }

      current = current.parent();
    }

    return path.join(' > ');
  }

  /**
   * Check if an ID is valid (not auto-generated)
   */
  private isValidId(id: string): boolean {
    // Skip IDs that look auto-generated
    const invalidPatterns = [
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
      /^widget/i,
      /^ember/i,
      /^react/i,
      /^ng-/i,
      /^vue-/i,
      /^\d+$/, // Only numbers
      /^[a-z0-9]{32,}$/i // Long random strings
    ];

    return !invalidPatterns.some(pattern => pattern.test(id));
  }

  /**
   * Try to generate selector using data attributes
   */
  private tryDataAttributes(element: cheerio.Cheerio): string | null {
    const dataAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-id'];

    for (const attr of dataAttrs) {
      const value = element.attr(attr);
      if (value) {
        const selector = `[${attr}="${value}"]`;
        if (this.isUniqueSelector(selector)) {
          return selector;
        }
        // Add tag name for more specificity
        const tagSelector = `${element[0].name}[${attr}="${value}"]`;
        if (this.isUniqueSelector(tagSelector)) {
          return tagSelector;
        }
      }
    }

    return null;
  }

  /**
   * Try to generate selector using unique class combinations
   */
  private tryUniqueClasses(element: cheerio.Cheerio): string | null {
    const classes = this.getImportantClasses(element);
    if (classes.length === 0) return null;

    const tagName = element[0].name;

    // Try single class
    for (const cls of classes) {
      const selector = `${tagName}.${cls}`;
      if (this.isUniqueSelector(selector)) {
        return selector;
      }
    }

    // Try combination of two classes
    if (classes.length >= 2) {
      const selector = `${tagName}.${classes.slice(0, 2).join('.')}`;
      if (this.isUniqueSelector(selector)) {
        return selector;
      }
    }

    // Try all classes
    const selector = `${tagName}.${classes.join('.')}`;
    if (this.isUniqueSelector(selector)) {
      return selector;
    }

    return null;
  }

  /**
   * Try semantic attributes like aria-label, name, etc.
   */
  private trySemanticAttributes(element: cheerio.Cheerio): string | null {
    const attrs = ['aria-label', 'name', 'title', 'alt', 'placeholder'];
    const tagName = element[0].name;

    for (const attr of attrs) {
      const value = element.attr(attr);
      if (value && value.length < 50) { // Avoid very long values
        const selector = `${tagName}[${attr}="${value}"]`;
        if (this.isUniqueSelector(selector)) {
          return selector;
        }
      }
    }

    return null;
  }

  /**
   * Get important classes (filter out utility classes)
   */
  private getImportantClasses(element: cheerio.Cheerio): string[] {
    const classStr = element.attr('class');
    if (!classStr) return [];

    const classes = classStr.split(/\s+/).filter(cls => {
      // Filter out common utility classes
      const utilityPatterns = [
        /^m[tlrb]?-\d+$/,  // margin utilities
        /^p[tlrb]?-\d+$/,  // padding utilities
        /^text-/,          // text utilities
        /^bg-/,            // background utilities
        /^flex/,           // flex utilities
        /^grid/,           // grid utilities
        /^w-\d+$/,         // width utilities
        /^h-\d+$/,         // height utilities
        /^hidden$/,
        /^block$/,
        /^inline/,
        /^absolute$/,
        /^relative$/,
        /^fixed$/,
        /^sticky$/
      ];

      // Keep semantic classes
      return cls.length > 2 &&
             !utilityPatterns.some(pattern => pattern.test(cls));
    });

    return classes;
  }

  /**
   * Check if a selector uniquely identifies one element
   */
  private isUniqueSelector(selector: string): boolean {
    try {
      const elements = this.$(selector);
      return elements.length === 1;
    } catch {
      return false;
    }
  }

  /**
   * Generate selector for a specific text content
   */
  generateSelectorForText(text: string, tagName?: string): string | null {
    const searchTag = tagName || '*';
    const elements = this.$(searchTag).filter((_, el) => {
      const $el = this.$(el);
      return $el.text().trim() === text;
    });

    if (elements.length === 1) {
      return this.generateSelector(elements.eq(0));
    }

    // If multiple matches, try to find the most prominent one
    if (elements.length > 1) {
      // Prefer elements higher in the DOM
      const first = elements.eq(0);
      return this.generateSelector(first);
    }

    return null;
  }
}

/**
 * Generate a unique CSS selector for an element in HTML
 */
export function generateUniqueSelector(html: string, element: cheerio.Cheerio): string {
  const generator = new CSSPathGenerator(html);
  return generator.generateSelector(element);
}

/**
 * Generate selector for text content
 */
export function generateSelectorForText(html: string, text: string, tagName?: string): string | null {
  const generator = new CSSPathGenerator(html);
  return generator.generateSelectorForText(text, tagName);
}