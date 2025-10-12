import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { getAIConfig } from '@shared/ai-config';

export interface ComponentPattern {
  componentType: 'button' | 'card' | 'input' | 'form' | 'navigation' | 'modal' | 'dropdown' | 'tooltip';
  variant: string; // primary, secondary, outline, ghost, etc.
  size: 'small' | 'medium' | 'large';
  state: 'default' | 'hover' | 'active' | 'disabled' | 'focus';
  confidence: number;
  selector: string;
  styling: {
    background?: string;
    color?: string;
    border?: string;
    borderRadius?: string;
    padding?: string;
    fontSize?: string;
    fontWeight?: string;
  };
}

export interface InjectionPoint {
  selector: string;
  type: 'button' | 'text' | 'image' | 'container' | 'form' | 'navigation' | 'price' | 'title' | 'description';
  operation: 'append' | 'prepend' | 'insertBefore' | 'insertAfter' | 'replace' | 'wrap';
  confidence: number; // 0-1
  description: string;
  componentPattern?: ComponentPattern; // Enhanced component detection
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
  detectComponentPatterns(htmlContent: string): Promise<ComponentPattern[]>;
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

  /**
   * Detect component patterns in HTML content
   */
  async detectComponentPatterns(htmlContent: string): Promise<ComponentPattern[]> {
    console.log(`[COMPONENT_DETECTOR] Starting component pattern detection`);

    if (!htmlContent) {
      console.log(`[COMPONENT_DETECTOR] No HTML content provided`);
      return [];
    }

    const $ = cheerio.load(htmlContent);
    const components: ComponentPattern[] = [];

    // Detect button components
    const buttons = $('button, [role="button"], input[type="submit"], input[type="button"], a[href*="button"], .btn, .button');
    buttons.each((_, element) => {
      const $el = $(element);
      const computedStyle = this.extractComputedStyle($el);

      components.push({
        componentType: 'button',
        variant: this.detectButtonVariant($el, computedStyle),
        size: this.detectButtonSize($el, computedStyle),
        state: 'default',
        confidence: 0.8,
        selector: this.generateSelector($el),
        styling: computedStyle
      });
    });

    // Detect card components
    const cards = $('.card, [class*="card"], article, .product-card, .item-card');
    cards.each((_, element) => {
      const $el = $(element);
      const computedStyle = this.extractComputedStyle($el);

      components.push({
        componentType: 'card',
        variant: this.detectCardVariant($el, computedStyle),
        size: this.detectCardSize($el, computedStyle),
        state: 'default',
        confidence: 0.7,
        selector: this.generateSelector($el),
        styling: computedStyle
      });
    });

    // Detect input components
    const inputs = $('input, textarea, select, [role="textbox"], [contenteditable]');
    inputs.each((_, element) => {
      const $el = $(element);
      const computedStyle = this.extractComputedStyle($el);

      components.push({
        componentType: 'input',
        variant: this.detectInputVariant($el, computedStyle),
        size: this.detectInputSize($el, computedStyle),
        state: 'default',
        confidence: 0.7,
        selector: this.generateSelector($el),
        styling: computedStyle
      });
    });

    console.log(`[COMPONENT_DETECTOR] Detected ${components.length} component patterns`);
    return components;
  }

  private extractComputedStyle($el: cheerio.Cheerio<any>): ComponentPattern['styling'] {
    // Extract inline styles and class-based styles
    const inlineStyle = $el.attr('style') || '';

    // Parse common CSS properties from inline styles
    const styleProps: ComponentPattern['styling'] = {};

    if (inlineStyle.includes('background')) {
      styleProps.background = this.extractColorFromStyle(inlineStyle, 'background');
    }
    if (inlineStyle.includes('color')) {
      styleProps.color = this.extractColorFromStyle(inlineStyle, 'color');
    }
    if (inlineStyle.includes('border')) {
      styleProps.border = this.extractFromStyle(inlineStyle, 'border');
    }
    if (inlineStyle.includes('border-radius')) {
      styleProps.borderRadius = this.extractFromStyle(inlineStyle, 'border-radius');
    }
    if (inlineStyle.includes('padding')) {
      styleProps.padding = this.extractFromStyle(inlineStyle, 'padding');
    }
    if (inlineStyle.includes('font-size')) {
      styleProps.fontSize = this.extractFromStyle(inlineStyle, 'font-size');
    }
    if (inlineStyle.includes('font-weight')) {
      styleProps.fontWeight = this.extractFromStyle(inlineStyle, 'font-weight');
    }

    return styleProps;
  }

  private extractColorFromStyle(style: string, property: string): string | undefined {
    const regex = new RegExp(`${property}[:\\s]*([^;]+)`, 'i');
    const match = style.match(regex);
    return match?.[1]?.trim();
  }

  private extractFromStyle(style: string, property: string): string | undefined {
    const regex = new RegExp(`${property}[:\\s]*([^;]+)`, 'i');
    const match = style.match(regex);
    return match?.[1]?.trim();
  }

  private detectButtonVariant($el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): string {
    const className = $el.attr('class') || '';

    // Check for primary buttons
    if (className.includes('primary') || className.includes('btn-primary') ||
        styling.background?.includes('#0066FF') || styling.background?.includes('#007bff')) {
      return 'primary';
    }

    // Check for secondary buttons
    if (className.includes('secondary') || className.includes('btn-secondary') ||
        styling.background?.includes('#6c757d')) {
      return 'secondary';
    }

    // Check for outline buttons
    if (className.includes('outline') || className.includes('btn-outline') ||
        (styling.border && !styling.background)) {
      return 'outline';
    }

    // Check for ghost buttons (minimal styling)
    if (className.includes('ghost') || className.includes('btn-ghost') ||
        (!styling.background && styling.color)) {
      return 'ghost';
    }

    // Default variant
    return 'primary';
  }

  private detectButtonSize(_$el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): 'small' | 'medium' | 'large' {
    const padding = styling.padding || '';
    const fontSize = styling.fontSize || '';

    // Check for large buttons
    if (padding.includes('16px') || padding.includes('20px') || fontSize.includes('18px') || fontSize.includes('20px')) {
      return 'large';
    }

    // Check for small buttons
    if (padding.includes('4px') || padding.includes('8px') || fontSize.includes('12px') || fontSize.includes('14px')) {
      return 'small';
    }

    // Default to medium
    return 'medium';
  }

  private detectCardVariant($el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): string {
    const className = $el.attr('class') || '';

    // Check for elevated cards
    if (className.includes('elevated') || className.includes('shadow') ||
        styling.border?.includes('rgba(0,0,0,0.1)')) {
      return 'elevated';
    }

    // Check for bordered cards
    if (className.includes('bordered') || className.includes('outline') ||
        (styling.border && !styling.background?.includes('transparent'))) {
      return 'bordered';
    }

    // Default to flat
    return 'flat';
  }

  private detectCardSize(_$el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): 'small' | 'medium' | 'large' {
    const padding = styling.padding || '';

    // Check for large cards
    if (padding.includes('24px') || padding.includes('32px')) {
      return 'large';
    }

    // Check for small cards
    if (padding.includes('8px') || padding.includes('12px')) {
      return 'small';
    }

    // Default to medium
    return 'medium';
  }

  private detectInputVariant($el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): string {
    const className = $el.attr('class') || '';

    // Check for outlined inputs
    if (className.includes('outlined') || className.includes('border') ||
        (styling.border && !styling.background)) {
      return 'outlined';
    }

    // Check for filled inputs
    if (className.includes('filled') || styling.background) {
      return 'filled';
    }

    // Check for underlined inputs
    if (className.includes('underlined') || className.includes('underline')) {
      return 'underlined';
    }

    // Default to outlined
    return 'outlined';
  }

  private detectInputSize(_$el: cheerio.Cheerio<any>, styling: ComponentPattern['styling']): 'small' | 'medium' | 'large' {
    const padding = styling.padding || '';
    const fontSize = styling.fontSize || '';

    // Check for large inputs
    if (padding.includes('16px') || fontSize.includes('18px')) {
      return 'large';
    }

    // Check for small inputs
    if (padding.includes('4px') || fontSize.includes('12px')) {
      return 'small';
    }

    // Default to medium
    return 'medium';
  }

  private generateSelector($el: cheerio.Cheerio<any>): string {
    // Generate a unique selector for the element
    const id = $el.attr('id');
    const className = $el.attr('class');
    const tagName = $el.prop('tagName')?.toLowerCase();

    if (id) {
      return `#${id}`;
    }

    if (className) {
      return `${tagName}.${className.split(' ').join('.')}`;
    }

    // Fallback to tag name
    return tagName || '*';
  }
}

export function createDOMAnalyzer(): DOMAnalyzerService {
  return new DOMAnalyzerServiceImpl();
}