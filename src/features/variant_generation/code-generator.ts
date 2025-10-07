// Code Generator for Variant Implementation
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { InjectionPoint } from './dom-analyzer';
import { getVariantGenerationAIConfig } from '@shared/ai-config';
import { DEMO_CONDITION, getDemoSelector, DEMO_TARGET_ELEMENT } from '@shared/demo-config';

export interface CodeGenerationResult {
    javascript_code: string;
    target_selector: string;
    execution_timing: 'immediate' | 'dom_ready';
    implementation_instructions: string;
}

const codeGenerationSchema = z.object({
    javascript_code: z.string().describe('JavaScript code to implement this variant'),
    target_selector: z.string().describe('CSS selector for the main target element'),
    execution_timing: z.enum(['immediate', 'dom_ready']).describe('When to execute the JavaScript'),
    implementation_instructions: z.string().describe('Brief explanation of what the code does')
});

export class VariantCodeGenerator {
    private designSystem: any = null;

    setDesignSystem(designSystem: any) {
        this.designSystem = designSystem;
    }

    async generateCode(
        variant: any,
        _hypothesis: Hypothesis,
        brandAnalysis: string,
        screenshot: string,
        injectionPoints: InjectionPoint[],
        htmlContent?: string
    ): Promise<CodeGenerationResult> {
        // Extract only essential brand info to reduce tokens
        const brandSummary = this.extractBrandSummary(brandAnalysis);
        
        // Use demo selector if enabled, otherwise use injection points
        if (DEMO_CONDITION) {
            console.log(`[CODE_GENERATOR] Using demo selector for: ${variant.variant_label}`);
            const demoTarget = {
                selector: getDemoSelector('variants'),
                description: DEMO_TARGET_ELEMENT.description,
                confidence: 1.0,
                elementType: 'button',
                attributes: { href: '/collections/all', class: 'size-style link' }
            };
            return this.generateCodeWithSelector(variant, brandSummary, screenshot, [demoTarget], htmlContent);
        }
        
        // Use injection points for dynamic approach
        const topPoints = injectionPoints.slice(0, 3);
        const bestPoint = topPoints[0];
        if (!bestPoint) {
            throw new Error(`No injection points found for variant: ${variant.variant_label}`);
        }
        
        return this.generateCodeWithSelector(variant, brandSummary, screenshot, topPoints, htmlContent);
    }

    private async generateCodeWithSelector(
        variant: any,
        _brandSummary: string,
        screenshot: string,
        points: any[],
        htmlContent?: string
    ): Promise<CodeGenerationResult> {

        const designSystemContext = this.designSystem ? `

DESIGN SYSTEM VALUES TO USE:
Colors:
- Primary Button BG: ${this.designSystem.colors?.primary_button_bg}
- Button Text: ${this.designSystem.colors?.primary_button_text}
- Hover BG: ${this.designSystem.colors?.primary_button_hover_bg}

Typography:
- Font Family: ${this.designSystem.typography?.primary_font}
- Button Font Size: ${this.designSystem.typography?.heading_sizes?.button}
- Font Weight: ${this.designSystem.typography?.font_weights?.bold}
- Text Transform: ${this.designSystem.typography?.text_transform_buttons}

Spacing:
- Padding: ${this.designSystem.spacing?.button_padding}
- Margin: ${this.designSystem.spacing?.button_margin}

Visual Effects:
- Border Radius: ${this.designSystem.borders?.button_radius}
- Box Shadow: ${this.designSystem.shadows?.button_shadow}
- Hover Shadow: ${this.designSystem.shadows?.button_hover_shadow}

Animations:
- Transition: ${this.designSystem.animations?.transition_duration} ${this.designSystem.animations?.transition_timing}
- Hover Transform: ${this.designSystem.animations?.button_hover_transform}
` : '';

        const codePrompt = `Generate PROFESSIONAL, VISUALLY POLISHED JavaScript code for A/B test variant:

VARIANT: ${variant.variant_label}
DESCRIPTION: ${variant.description}
RATIONALE: ${variant.rationale}
${designSystemContext}

SELECTOR OPTIONS WITH CONTEXT:
${this.buildSelectorOptionsContext(points, htmlContent || '')}

REQUIREMENTS:
1. Generate VISUALLY POLISHED JavaScript with PROFESSIONAL CSS
2. Include smooth transitions (0.2s-0.3s ease-in-out) for ALL state changes
3. Add proper :hover, :focus, :active states with visual feedback
4. Use the EXACT design system values provided above
5. Include box-shadows for depth and visual hierarchy
6. Add subtle scale or translateY transforms on hover for micro-interactions
7. Ensure minimum 4.5:1 color contrast for accessibility
8. Use try-catch for error handling
9. Work beautifully on both mobile and desktop
10. Include the IIFE wrapper pattern
11. Choose the BEST selector from the options above
12. STRICT SCOPE: Do NOT query the entire document for other elements
13. If no provided selector matches, log a clear warning and exit
14. RESPECT ELEMENT CONTEXT (CRITICAL):
    - Check "Important styles" - if parent has 'overflow: hidden', ensure positioned elements won't be clipped
    - Check "Spatial context" - respect grid/flex layouts, don't break parent container layouts
    - Check "Interactions" - don't duplicate existing handlers or animations
    - If "Parent has hover effects" is mentioned, coordinate your hover states
    - Respect z-index values to avoid elements being hidden behind others
15. FOLLOW INSERTION STRATEGY (VERY IMPORTANT):
    - Each selector has an "INSERTION STRATEGY" section
    - USE THE PROVIDED METHOD (before, after, prepend, append, replace)
    - USE THE PROVIDED TARGET SELECTOR for precise placement
    - Follow the EXAMPLE code pattern
    - If the primary strategy fails, use the FALLBACK strategy
    - This ensures elements are placed in the CORRECT location, not randomly
14. MEDIA GUARDRAILS (critical):
   - Do NOT create new media elements (img, video, source, picture, iframe) and do NOT modify any element's src, srcset, poster, or style.backgroundImage to point to a new URL.
   - Never introduce external or synthetic URLs (http:, https:, //, data:, blob:) for images/videos. Use ONLY existing assets already present in the DOM, or leave media unchanged.
   - Do NOT change anchor hrefs to external domains; limit to text/content/class/style updates.
   - If the variant would require new media URLs, instead skip that part, log a clear console.warn, and proceed with only text/layout/style changes.
9. LINKS GUARDRAILS (critical):
   - Do NOT create new anchor elements and do NOT change existing href targets. Keep link destinations unchanged.
   - Do NOT invent new URLs or paths. Do NOT switch to different routes. Only adjust link text, classes, or inline styles.
   - If the hypothesis implies changing where a link points, skip that step, log a console.warn, and implement only non-navigational changes.

CODE STRUCTURE:
(function() {
  'use strict';

  function initVariant() {
    try {
      // Resolve target element using the best selector from options
      const trySelectors = (selectors) => {
        for (const s of selectors) {
          const el = document.querySelector(s);
          if (el) return el;
        }
        return null;
      };

      // Use the selector you determine is best for this variant
      const selectors = [
        // Add the selectors in order of preference based on the variant needs
      ];

      const baseElement = trySelectors(selectors);
      if (!baseElement) {
        console.warn('[Variant ${variant.variant_label}] Target element not found for selectors:', selectors);
        return;
      }

      // Your variant implementation here
      // Based on: ${variant.description}
      // IMPORTANT: Scope all queries within baseElement, e.g. baseElement.querySelector(...)

    } catch (error) {
      console.error('[Variant ${variant.variant_label}]', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVariant);
  } else {
    initVariant();
  }
})();

Return JSON with: javascript_code, target_selector, execution_timing, implementation_instructions`;

        const aiConfig = getVariantGenerationAIConfig();
        console.log(`[CODE_GENERATOR] Generating code for variant: ${variant.variant_label}`);
        console.log(`[CODE_GENERATOR] Using ${points.length} selector options with context`);
        
        try {
            const codeObject = await generateObject({
                model: google(aiConfig.model),
                schema: codeGenerationSchema,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: "text", text: codePrompt },
                            { type: "image", image: screenshot }
                        ]
                    }
                ]
            });

            console.log(`[CODE_GENERATOR] Generated JavaScript code for variant: ${variant.variant_label} (${codeObject.object.javascript_code.length} chars)`);

            // Use the selector the LLM chose
            const result = codeObject.object;
            // Don't force a specific selector - let the LLM choose the best one

            return result;
        } catch (error) {
            console.error(`[CODE_GENERATOR] Error generating code for variant ${variant.variant_label}:`, error);
            // Return a fallback code result
            return {
                javascript_code: `// Failed to generate code for ${variant.variant_label}`,
                target_selector: points[0]?.selector || '',
                execution_timing: 'dom_ready' as const,
                implementation_instructions: `Code generation failed. Please implement manually: ${variant.description}`
            };
        }
    }


    private buildSelectorOptionsContext(points: any[], htmlContent: string): string {
        return points.map((point, index) => {
            const isPrimary = index === 0;
            const priority = isPrimary ? 'PRIMARY' : `OPTION ${index}`;

            // Enhanced context with validation information
            const validation = point.selectorReliability || {};
            const alternatives = point.alternativeSelectors || [];

            // Build enhanced context string with spatial and interaction info
            const elementContext = point.elementContext || {};
            const spatialInfo = this.formatSpatialContext(elementContext.spatial);
            const interactionInfo = this.formatInteractionContext(elementContext.interactions);
            const styleInfo = this.formatStyleContext(elementContext.computedStyles);

            // Format insertion strategy
            const insertionInfo = this.formatInsertionStrategy(point.insertionStrategy);

            return `
${priority} SELECTOR:
- Selector: ${point.selector}
- Type: ${point.elementType || point.type || 'unknown'}
- Confidence: ${point.confidence || 0}
- Description: ${point.description || 'No description'}
- Context: ${point.context || 'No context'}
${point.originalText ? `- Current text: "${point.originalText}"` : ''}
${point.reasoning ? `- Reasoning: ${point.reasoning}` : ''}
${validation.works !== undefined ? `- Validation: ${validation.works ? 'VALID' : 'INVALID'} - ${validation.reason || 'No reason'}` : ''}
${alternatives.length > 0 ? `- Alternative selectors: ${alternatives.slice(0, 3).join(', ')}` : ''}
${styleInfo ? `- Important styles: ${styleInfo}` : ''}
${spatialInfo ? `- Spatial context: ${spatialInfo}` : ''}
${interactionInfo ? `- Interactions: ${interactionInfo}` : ''}
${insertionInfo ? `\n- INSERTION STRATEGY:\n${insertionInfo}` : ''}
${htmlContent ? `- HTML Context: ${this.extractEnhancedHtmlContext(point.selector, htmlContent)}` : ''}
`;
        }).join('\n');
    }

    private extractEnhancedHtmlContext(selector: string, htmlContent: string): string {
        try {
            const cheerio = require('cheerio');
            const $ = cheerio.load(htmlContent);
            const elements = $(selector);

            if (elements.length === 0) {
                return 'No elements found with this selector';
            }

            const element = elements.first();

            // Get parent context
            const parent = element.parent();
            const parentInfo = parent.length > 0 ?
                `Parent: <${parent[0].name} class="${parent.attr('class') || ''}"...>` : '';

            // Get sibling context
            const prevSibling = element.prev();
            const nextSibling = element.next();
            const siblingInfo = [];
            if (prevSibling.length > 0) {
                siblingInfo.push(`Previous: <${prevSibling[0].name}>`);
            }
            if (nextSibling.length > 0) {
                siblingInfo.push(`Next: <${nextSibling[0].name}>`);
            }

            // Get element HTML (truncated)
            const elementHtml = $.html(element[0]).substring(0, 300);

            return `
  Element HTML: ${elementHtml}${elementHtml.length >= 300 ? '...' : ''}
  ${parentInfo}
  ${siblingInfo.length > 0 ? `Siblings: ${siblingInfo.join(', ')}` : ''}
  Position: ${element.index() + 1} of ${element.siblings().length + 1} siblings`;

        } catch (error) {
            return `Error extracting context: ${error}`;
        }
    }

    private extractHtmlForSelector(selector: string, htmlContent: string): string {
        try {
            const cheerio = require('cheerio');
            const $ = cheerio.load(htmlContent);
            const elements = $(selector);
            
            if (elements.length === 0) {
                return 'No elements found with this selector';
            }
            
            // Return HTML of first few elements (limit to avoid token overflow)
            const maxElements = 3;
            const htmlSnippets = [];
            
            for (let i = 0; i < Math.min(elements.length, maxElements); i++) {
                const element = elements.eq(i);
                const outerHtml = element.prop('outerHTML') || element.html();
                // Truncate if too long
                const truncated = outerHtml.length > 500 ? outerHtml.substring(0, 500) + '...' : outerHtml;
                htmlSnippets.push(`Element ${i + 1}: ${truncated}`);
            }
            
            return htmlSnippets.join('\n\n');
        } catch (error) {
            return `Error extracting HTML: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    private formatSpatialContext(spatial: any): string {
        if (!spatial) return '';

        const parts: string[] = [];

        if (spatial.parentContainer) {
            parts.push(`Parent: ${spatial.parentContainer.layout} layout`);
            if (spatial.parentContainer.styles?.overflow) {
                parts.push(`overflow: ${spatial.parentContainer.styles.overflow}`);
            }
        }

        if (spatial.siblings && spatial.siblings.length > 0) {
            parts.push(`${spatial.siblings.length} siblings nearby`);
        }

        if (spatial.children && spatial.children.length > 0) {
            const interactive = spatial.children.filter((c: any) => c.hasInteractions).length;
            if (interactive > 0) {
                parts.push(`${interactive} interactive children`);
            }
        }

        return parts.join(', ');
    }

    private formatInteractionContext(interactions: any): string {
        if (!interactions) return '';

        const parts: string[] = [];

        if (interactions.existingHandlers && interactions.existingHandlers.length > 0) {
            parts.push(`Has: ${interactions.existingHandlers.join(', ')}`);
        }

        if (interactions.animations && interactions.animations.length > 0) {
            parts.push('Has animations');
        }

        if (interactions.hoveredAncestors && interactions.hoveredAncestors.length > 0) {
            parts.push('Parent has hover effects');
        }

        if (interactions.zIndex && interactions.zIndex > 0) {
            parts.push(`z-index: ${interactions.zIndex}`);
        }

        return parts.join(', ');
    }

    private formatStyleContext(styles: any): string {
        if (!styles || Object.keys(styles).length === 0) return '';

        const important = ['position', 'overflow', 'display'];
        const relevantStyles = Object.entries(styles)
            .filter(([key]) => important.includes(key))
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');

        return relevantStyles;
    }

    private formatInsertionStrategy(strategy: any): string {
        if (!strategy) return '';

        let output = `  Method: ${strategy.method.toUpperCase()}`;

        if (strategy.targetSelector) {
            output += `\n  Target: baseElement.querySelector('${strategy.targetSelector}')`;
        } else {
            output += `\n  Target: baseElement itself`;
        }

        output += `\n  Reason: ${strategy.reasoning}`;
        output += `\n  Example: ${strategy.example}`;

        if (strategy.fallbacks && strategy.fallbacks.length > 0) {
            output += `\n  Fallback: ${strategy.fallbacks[0].method} - ${strategy.fallbacks[0].reasoning}`;
        }

        return output;
    }

    // Extract essential brand info to reduce token usage
    private extractBrandSummary(brandAnalysis: string): string {
        try {
            const brand = JSON.parse(brandAnalysis);
            const personality = brand.brand_personality_words?.slice(0, 3).join(', ') || 'Modern';
            const primaryColor = brand.brand_colors?.[0]?.color || 'Blue';
            return `${personality} brand, primary: ${primaryColor}`;
        } catch {
            return 'Modern, professional brand';
        }
    }
}

// Factory function
export function createVariantCodeGenerator(): VariantCodeGenerator {
    return new VariantCodeGenerator();
}