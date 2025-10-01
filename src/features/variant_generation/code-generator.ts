// Code Generator for Variant Implementation
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { Hypothesis } from '@features/hypotheses_generation/types';
import { InjectionPoint } from './dom-analyzer';
import { getVariantGenerationAIConfig } from '@shared/ai-config';

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
    // Hardcoded element focus configuration - matches other services
    private readonly HARDCODE_ELEMENT_FOCUS = true;
    private readonly TARGET_ELEMENT = {
        selector: 'a[href="/collections/all"].size-style.link',
        description: 'Shop all button/link',
        confidence: 1.0,
        elementType: 'button',
        attributes: { href: '/collections/all', class: 'size-style link' }
    };

    async generateCode(
        variant: any, 
        _hypothesis: Hypothesis, 
        brandAnalysis: string, 
        screenshot: string,
        injectionPoints: InjectionPoint[]
    ): Promise<CodeGenerationResult> {
        // Extract only essential brand info to reduce tokens
        const brandSummary = this.extractBrandSummary(brandAnalysis);
        
        // Use hardcoded selector if enabled, otherwise use injection points
        if (this.HARDCODE_ELEMENT_FOCUS) {
            console.log(`[CODE_GENERATOR] Using hardcoded selector for: ${variant.variant_label}`);
            return this.generateCodeWithSelector(variant, brandSummary, screenshot, this.TARGET_ELEMENT);
        }
        
        // Use injection points for dynamic approach
        const bestPoint = injectionPoints[0];
        if (!bestPoint) {
            throw new Error(`No injection points found for variant: ${variant.variant_label}`);
        }
        
        return this.generateCodeWithSelector(variant, brandSummary, screenshot, bestPoint);
    }

    private async generateCodeWithSelector(
        variant: any,
        brandSummary: string,
        screenshot: string,
        point: any
    ): Promise<CodeGenerationResult> {
        const codePrompt = `Generate CSS/HTML for A/B test variant:

Variant: ${variant.variant_label}
Description: ${variant.description}
Brand: ${brandSummary}

Target element: ${point.elementType || point.type} (${Math.round((point.confidence || 1.0) * 100)}% confidence)
Selector: ${point.selector}
${point.originalText ? `Current text: "${point.originalText}" (${point.originalText.length} chars)` : ''}

Generate ONLY CSS and HTML changes. The selector is already provided.

Methods:
- selector: CSS changes only
- new_element: Add new HTML at selector location
- modify_existing: Modify HTML structure at selector

Rules:
- Use selector: ${point.selector}
- Match text length if changing text
- No JavaScript in html_code
- Production-ready code only

Return JSON: {css_code, html_code, injection_method, implementation_instructions}`;

        const aiConfig = getVariantGenerationAIConfig();
        console.log(`[CODE_GENERATOR] Generating code for variant: ${variant.variant_label}`);
        console.log(`[CODE_GENERATOR] Using selector: ${point.selector} (${point.confidence || 1.0})`);
        
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

            console.log(`[CODE_GENERATOR] Generated code for variant: ${variant.variant_label} (${codeObject.object.css_code.length} chars CSS, ${codeObject.object.html_code.length} chars HTML)`);
            
            // Force use of validated selector
            const result = codeObject.object;
            result.target_selector = point.selector;
            
            return result;
        } catch (error) {
            console.error(`[CODE_GENERATOR] Error generating code for variant ${variant.variant_label}:`, error);
            // Return a fallback code result
            return {
                css_code: '',
                html_code: '',
                injection_method: 'selector' as const,
                target_selector: point.selector,
                new_element_html: '',
                implementation_instructions: `Code generation failed. Please implement manually: ${variant.description}`
            };
        }
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