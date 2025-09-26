// Code Generator for Variant Implementation
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { InjectionPoint } from './dom-analyzer';
import { getAIConfig } from '@shared/ai-config';

export interface CodeGenerationResult {
    css_code: string;
    html_code: string;
    injection_method: 'selector' | 'new_element' | 'modify_existing';
    target_selector?: string;
    new_element_html?: string;
    implementation_instructions: string;
}

const codeGenerationSchema = z.object({
    css_code: z.string().describe('CSS code to implement this variant'),
    html_code: z.string().describe('HTML code changes for this variant'),
    injection_method: z.enum(['selector', 'new_element', 'modify_existing']).describe('How to inject this code'),
    target_selector: z.string().optional().describe('CSS selector to target existing element (if injection_method is selector)'),
    new_element_html: z.string().optional().describe('Complete HTML for new element (if injection_method is new_element)'),
    implementation_instructions: z.string().describe('Step-by-step instructions for implementing this variant')
});

export class VariantCodeGenerator {
    async generateCode(
        variant: any, 
        hypothesis: Hypothesis, 
        brandAnalysis: string, 
        screenshot: string,
        injectionPoints: InjectionPoint[]
    ): Promise<CodeGenerationResult> {
        const codePrompt = `
You are a professional frontend developer working on conversion optimization for an e-commerce business. You are creating A/B test variants to help improve the store's performance and user experience.

CONTEXT: This is for legitimate business optimization - the store owner wants to test different design elements to improve conversion rates and user engagement.

VARIANT TO IMPLEMENT:
- Label: ${variant.variant_label}
- Description: ${variant.description}
- Rationale: ${variant.rationale}
- Implementation Notes: ${variant.implementation_notes}
- Accessibility: ${variant.accessibility_consideration}

ORIGINAL HYPOTHESIS:
- Hypothesis: ${hypothesis.hypothesis}
- Measurable Tests: ${hypothesis.measurable_tests}
- Success Metrics: ${hypothesis.success_metrics}

VALIDATED INJECTION POINTS (USE THESE SELECTORS):
${injectionPoints.map(point => `
- Type: ${point.type}
- Primary Selector: ${point.selector} (Confidence: ${point.confidence})
- Alternative Selectors: ${point.alternativeSelectors.join(', ')}
- Context: ${point.context}
- Reasoning: ${point.reasoning}
`).join('\n')}

INJECTION METHODS:
1. **selector**: Modify existing element using CSS selector (e.g., change button color)
2. **new_element**: Inject completely new HTML element (e.g., add new CTA banner)
3. **modify_existing**: Modify existing element's HTML structure (e.g., add wrapper div)

REQUIREMENTS:
1. **MUST USE VALIDATED SELECTORS**: Use the selectors provided in the injection points above. Do NOT generate your own selectors.
2. Generate CSS code that can be injected into a Shopify theme
3. Generate HTML code changes if needed
4. Determine the best injection method for this variant
5. Ensure the code is production-ready and follows best practices
6. Make sure the code is specific to the variant description
7. Consider the brand analysis context: ${brandAnalysis}
8. Code should be ready for A/B testing implementation

CRITICAL: Use the validated selectors from the injection points. The selectors have been analyzed and tested for reliability. Do not invent new selectors.

SELECTOR SELECTION RULES:
- Use the PRIMARY SELECTOR (highest confidence) from the injection points
- If multiple selectors are available, choose the one that best matches your variant's target element
- The target_selector field should be one of the validated selectors from above
- Do NOT create new selectors like .hero-cta.button

Return your response as a JSON object with:
- css_code: The complete CSS code for this variant
- html_code: Any HTML changes needed (or empty string if none)
- injection_method: How to inject this code (selector/new_element/modify_existing)
- target_selector: CSS selector to target existing element (if using selector method)
- new_element_html: Complete HTML for new element (if using new_element method)
- implementation_instructions: Step-by-step instructions for implementing this variant

IMPORTANT: Return actual code, not descriptions. The code should be ready to implement for A/B testing.

CRITICAL: Return your response as a flat JSON object with the exact structure:
{
  "css_code": "your CSS code here",
  "html_code": "your HTML code here", 
  "injection_method": "selector",
  "target_selector": "your selector here",
  "new_element_html": "",
  "implementation_instructions": "your instructions here"
}

Do NOT wrap this in any other structure like {"type": "response", "properties": {...}}. Return ONLY the flat object above.
`;

        const aiConfig = getAIConfig();
        const codeObject = await generateObject({
            model: google(aiConfig.model, {
                apiKey: aiConfig.apiKey,
            }),
            schema: codeGenerationSchema,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: codePrompt },
                        { type: "text", text: brandAnalysis },
                        { type: "image", image: screenshot }
                    ]
                }
            ]
        });

        return codeObject.object;
    }
}

// Factory function
export function createVariantCodeGenerator(): VariantCodeGenerator {
    return new VariantCodeGenerator();
}
