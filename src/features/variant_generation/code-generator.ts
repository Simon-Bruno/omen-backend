// Code Generator for Variant Implementation
import { ai } from '@infra/config/langsmith';
import { z } from 'zod';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { InjectionPoint } from './dom-analyzer';
import { getVariantGenerationAIConfig } from '@shared/ai-config';
// import { getCodeGenerationAIConfig } from '@shared/ai-config';
import { google } from '@ai-sdk/google';

export interface CodeGenerationResult {
    variant_label: string;
    description: string;
    rationale: string;
    javascript_code: string;
    target_selector: string;
    execution_timing: 'immediate' | 'dom_ready';
    implementation_instructions: string;
}

const codeGenerationSchema = z.object({
    variant_label: z.string().describe('Simple, descriptive name for this variant (e.g., "Blue Button", "Larger Text")'),
    description: z.string().describe('Brief description of what this variant does'),
    rationale: z.string().describe('Why this variant should improve the hypothesis'),
    javascript_code: z.string().describe('JavaScript code to implement this variant'),
    target_selector: z.string().describe('CSS selector for the main target element'),
    execution_timing: z.enum(['immediate', 'dom_ready']).describe('When to execute the JavaScript'),
    implementation_instructions: z.string().describe('Brief explanation of what the code does')
});

export class VariantCodeGenerator {

    async generateCode(
        variant: any,
        hypothesis: Hypothesis,
        brandAnalysis: string,
        screenshot: string,
        injectionPoints: InjectionPoint[],
        htmlContent?: string
    ): Promise<CodeGenerationResult> {
        // Extract only essential brand info to reduce tokens
        const brandSummary = this.extractBrandSummary(brandAnalysis);

        // Use DOM analyzer injection points if available, otherwise fallback to HTML context
        if (injectionPoints && injectionPoints.length > 0) {
            console.log(`[CODE_GENERATOR] Using DOM analyzer injection points for: ${variant.variant_label} (${injectionPoints.length} points)`);
            return this.generateCodeWithSelector(variant, hypothesis, brandSummary, screenshot, injectionPoints, htmlContent);
        }

        // Fallback: generate selectors from HTML context
        console.log(`[CODE_GENERATOR] No injection points available, generating selectors from HTML context for: ${variant.variant_label}`);
        return this.generateCodeWithSelector(variant, hypothesis, brandSummary, screenshot, [], htmlContent);
    }

    private async generateCodeWithSelector(
        variant: any,
        hypothesis: Hypothesis,
        brandSummary: { personality: string; colors: string },
        screenshot: string,
        injectionPoints: InjectionPoint[],
        htmlContent?: string
    ): Promise<CodeGenerationResult> {
        // Use injection points if available, otherwise generate from HTML context
        if (injectionPoints && injectionPoints.length > 0) {
            console.log(`[CODE_GENERATOR] Using ${injectionPoints.length} injection points from DOM analyzer`);
        } else {
            console.log(`[CODE_GENERATOR] No injection points available, generating selectors from HTML context`);
        }

        const codePrompt = `You are a UX designer creating an A/B test variant.

HYPOTHESIS: ${hypothesis.description}
PROBLEM: ${hypothesis.current_problem}
EXPECTED LIFT: ${hypothesis.predicted_lift_range.min}-${hypothesis.predicted_lift_range.max}%

VARIANT TO IMPLEMENT:
- Name: ${variant.variant_label}
- Description: ${variant.description}
- Rationale: ${variant.rationale}
- UX Approach: ${variant.ux_approach}
- Visual Style: ${variant.visual_style}
- Placement Strategy: ${variant.placement_strategy}

RESPONSIVE DESIGN REQUIREMENTS (CRITICAL):
- Code MUST work perfectly on mobile (375px), tablet (768px), and desktop (1920px)
- Use CSS media queries for responsive behavior: @media (max-width: 768px) and @media (max-width: 375px)
- Text must be readable and properly wrapped at all screen sizes
- Avoid text overflow, clipping, or awkward line breaks
- Use relative units (rem, em, %) instead of fixed pixels where appropriate
- Ensure touch targets are at least 44px on mobile devices
- Consider how large text will wrap and flow on different devices

TEXT RENDERING CONSIDERATIONS:
- Large text should wrap naturally without breaking mid-word
- Use word-wrap: break-word and overflow-wrap: break-word for long text
- Consider line-height and letter-spacing for readability
- Avoid text that extends beyond container boundaries
- Test how text will appear on different screen orientations
- Use clamp() for responsive font sizes: clamp(1rem, 2.5vw, 2rem)

Your task is to implement this specific variant by creating JavaScript code that:
- Follows the exact UX approach described above
- Uses the visual style specified
- Implements the placement strategy
- Achieves the variant's specific goals
- Works responsively across all device sizes
- Handles text rendering properly on all screens

BRAND COLORS (use these exact colors from the website):
${brandSummary.colors}

Use these brand colors to maintain visual consistency with the website's design system. Prefer these colors over generic colors when implementing the variant.

CREATIVE REDESIGN EXAMPLES:
- Add text shadows for better contrast
- Enhance button styles with colors and hover effects
- Add subtle borders or backgrounds to elements
- Include responsive typography with media queries
- Add proper text wrapping and overflow handling
- Use CSS gradients for visual effects (no external images)
- Create animated backgrounds with CSS keyframes
- Use CSS-only particle effects instead of video backgrounds
- Modify existing text content and styling
- Use CSS transforms and animations
- Create visual effects with CSS only
- Use existing page colors and fonts

AVOID:
- Changing page layout or positioning
- Hiding existing content
- Complex overlays that break the design
- Fixed pixel values that don't scale
- Text that breaks awkwardly on mobile
- External video/image URLs that don't exist
- Hallucinated media resources
- Non-existent file paths
- ANY external URLs or file paths
- Video elements with src attributes
- Image elements with external src URLs
- Any references to files that don't exist on the website

SELECTOR GENERATION:
${injectionPoints && injectionPoints.length > 0 ? 
`DOM ANALYZER INJECTION POINTS AVAILABLE:
Use these pre-validated selectors from the DOM analyzer:

        ${injectionPoints.map((point, i) => `${i + 1}. ${point.selector} (${point.type}, ${point.operation})`).join('\n')}

PREFERRED APPROACH: Use one of the selectors above as your target_selector. Choose the most appropriate one based on the variant type and hypothesis.

FALLBACK: If injection points don't match your variant needs, analyze the HTML context below for additional selectors.` :

`You must analyze the HTML context below and generate appropriate CSS selectors to target the elements needed for this variant.

SELECTOR STRATEGY:
1. Look for elements that match the hypothesis description
2. Use stable selectors in this order of preference:
   - data-testid attributes (most reliable)
   - Semantic class names (avoid generated IDs/classes with numbers)
   - Element types with text content
   - Structural selectors (parent > child relationships)
3. Avoid selectors with:
   - Generated IDs (template--123, long hex strings)
   - Dynamic classes with numbers
   - Complex nested selectors

EXAMPLES OF GOOD SELECTORS:
- [data-testid="add-to-cart-button"]
- .btn-primary
- button:contains("Add to Cart")
- .product-form button
- .header .nav-link

EXAMPLES OF BAD SELECTORS:
- #template--1234567890
- .btn-abc123def456
- div:nth-child(5) > span:nth-child(3)`}

HTML CONTEXT:
${htmlContent ? this.cleanHtmlForAnalysis(htmlContent) : 'No HTML context available'}

REQUIREMENTS:
- Keep code under 1000 characters
- Generate reliable selectors that exist in the HTML
- Include hover states and transitions
- Preserve existing layout and backgrounds
- MUST include responsive CSS with media queries
- Use relative units (rem, em, %) for scalable design
- Handle text wrapping and overflow properly

CRITICAL: NO EXTERNAL RESOURCES ALLOWED
- NEVER use video elements or video URLs
- NEVER use external image URLs or file paths
- NEVER reference files that don't exist on the website
- ONLY use CSS for visual effects and animations
- ONLY modify existing content and styling
- ONLY use colors, fonts, and styles already present on the page
- If you need visual effects, create them with CSS gradients, animations, or transforms

RESPONSIVE CSS REQUIREMENTS:
- Include @media (max-width: 768px) for tablet adjustments
- Include @media (max-width: 375px) for mobile adjustments
- Use clamp() for responsive font sizes: clamp(1rem, 2.5vw, 2rem)
- Add word-wrap: break-word and overflow-wrap: break-word for text
- Ensure touch targets are at least 44px on mobile
- Use max-width: 100% to prevent overflow

JAVASCRIPT FORMATTING:
- Use proper line breaks and indentation (NOT escaped \\n characters)
- Format CSS in template literals with actual line breaks
- Use readable, properly indented JavaScript code
- Ensure the code can be copied and pasted directly into browser console
- Use template literals (\`\`) for CSS strings with proper formatting

EXAMPLE FORMAT WITH RESPONSIVE DESIGN:
const css = \`
.button {
  padding: clamp(0.75rem, 2vw, 1.5rem);
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  word-wrap: break-word;
  overflow-wrap: break-word;
}

@media (max-width: 768px) {
  .button {
    padding: 1rem;
    font-size: 1rem;
  }
}

@media (max-width: 375px) {
  .button {
    padding: 0.875rem;
    font-size: 0.875rem;
    min-height: 44px;
  }
}\`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

CRITICAL EXECUTION REQUIREMENTS:
- NEVER use DOMContentLoaded listeners - code runs after DOM is loaded
- Execute immediately when script runs
- Use flexible selectors that work with actual HTML structure

SELECTOR FLEXIBILITY:
- Use class-only selectors (.class-name) instead of tag+class (section.class-name)
- Shopify elements often have multiple classes: <div class="shopify-section ui-test-product-list">
- Test both specific and general selectors
- Always provide fallback selectors

EXAMPLE DEBUGGING PATTERN:
console.log('[AB_TEST] Starting variant: Testimonials Section');
// Try specific selector first
let targetEl = document.querySelector('.ui-test-product-list');
if (!targetEl) {
  console.log('[AB_TEST] Primary selector not found, trying fallback...');
  targetEl = document.querySelector('.shopify-section');
}
if (targetEl) {
  console.log('[AB_TEST] Target element found:', targetEl);
  // ... rest of code
  console.log('[AB_TEST] Successfully injected variant');
} else {
  console.log('[AB_TEST] Element NOT found, trying fallback...');
  // ... fallback logic
}

Return JSON with: variant_label, description, rationale, javascript_code, target_selector, execution_timing, implementation_instructions`;

        // const aiAntrophicConfig = getCodeGenerationAIConfig();
        const googleConfig = getVariantGenerationAIConfig();
        console.log(`[CODE_GENERATOR] Generating variant concept and code for variant: ${variant.variant_label}`);
        console.log(`[CODE_GENERATOR] Generating selectors directly from HTML context`);
        console.log(`[LANGSMITH] Starting AI call: generateCode - Variant Concept and JavaScript Implementation for ${variant.variant_label}`);

        try {
            const codeObject = await ai.generateObject({
                model: google(googleConfig.model),
                temperature: 1.5,
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

            const result = codeObject.object;
            console.log(`[CODE_GENERATOR] Generated variant concept and JavaScript code for variant: ${result.variant_label} (${result.javascript_code.length} chars)`);
            console.log(`[LANGSMITH] Completed AI call: generateCode - Generated ${result.javascript_code.length} chars of JavaScript`);

            // Return the complete result
            return result;
        } catch (error) {
            console.error(`[CODE_GENERATOR] Error generating code for variant ${variant.variant_label}:`, error);
            // Return a fallback code result
            return {
                variant_label: variant.variant_label || 'Failed Variant',
                description: variant.description || `Code generation failed for this variant. Please implement manually: ${variant.description}`,
                rationale: variant.rationale || 'Code generation failed',
                javascript_code: `// Failed to generate code for ${variant.variant_label}`,
                target_selector: injectionPoints[0]?.selector || '',
                execution_timing: 'dom_ready' as const,
                implementation_instructions: `Code generation failed. Please implement manually: ${variant.description}`
            };
        }
    }




    // Extract essential brand info to reduce token usage
    private extractBrandSummary(brandAnalysis: string): { personality: string; colors: string } {
        try {
            const brand = JSON.parse(brandAnalysis);
            const personality = brand.brand_personality_words?.slice(0, 3).join(', ') || 'Modern';
            
            // Extract colors with hex codes
            const colors = brand.brand_colors?.map((c: any) => 
                `${c.color} (${c.hex_code}) - ${c.usage_type}`
            ).join(', ') || 'Blue (#0066CC) - primary';
            
            return { personality, colors };
        } catch {
            return { 
                personality: 'Modern, professional', 
                colors: 'Blue (#0066CC) - primary' 
            };
        }
    }

    // Clean HTML for analysis - remove scripts, styles, and clean whitespace
    private cleanHtmlForAnalysis(html: string): string {
        try {
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);

            // Get cleaned HTML and clean up whitespace
            let cleaned = $.html();

            // Simple whitespace cleanup
            cleaned = cleaned
                .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
                .replace(/>\s+</g, '><')  // Remove spaces between tags
                .trim();

            return cleaned;
        } catch (_error) {
            // Fallback: simple whitespace cleanup
            return html
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .trim();
        }
    }
}

// Factory function
export function createVariantCodeGenerator(): VariantCodeGenerator {
    return new VariantCodeGenerator();
}