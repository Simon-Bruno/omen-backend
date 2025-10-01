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
        _hypothesis: Hypothesis, 
        brandAnalysis: string, 
        screenshot: string,
        injectionPoints: InjectionPoint[]
    ): Promise<CodeGenerationResult> {
        // Extract only essential brand info to reduce tokens
        const brandSummary = this.extractBrandSummary(brandAnalysis);
        
        // Use ONLY the best selector from injection points
        const bestPoint = injectionPoints[0];
        
        if (!bestPoint) {
            throw new Error(`No injection points found for variant: ${variant.variant_label}`);
        }
        
        const codePrompt = `Generate CSS/HTML for A/B test variant:

Variant: ${variant.variant_label}
Description: ${variant.description}
Brand: ${brandSummary}

Target element: ${bestPoint.type} (${Math.round(bestPoint.confidence * 100)}% confidence)
Selector: ${bestPoint.selector}
${bestPoint.originalText ? `Current text: "${bestPoint.originalText}" (${bestPoint.originalText.length} chars)` : ''}

Generate ONLY CSS and HTML changes. The selector is already provided.

Methods:
- selector: CSS changes only
- new_element: Add new HTML at selector location
- modify_existing: Modify HTML structure at selector

Rules:
- Use selector: ${bestPoint.selector}
- Match text length if changing text
- No JavaScript in html_code
- Production-ready code only

Return JSON: {css_code, html_code, injection_method, implementation_instructions}`;

        const aiConfig = getAIConfig();
        console.log(`[CODE_GENERATOR] Generating code for variant: ${variant.variant_label}`);
        console.log(`[CODE_GENERATOR] Using validated selector: ${bestPoint.selector} (${bestPoint.confidence})`);
        
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
            result.target_selector = bestPoint.selector;
            
            // Add fallback selectors from injection points
            console.log(`[CODE_GENERATOR] Primary selector: ${result.target_selector}`);
            if (injectionPoints.length > 1) {
                console.log(`[CODE_GENERATOR] Fallback selectors available:`, injectionPoints.slice(1, 4).map(p => p.selector));
            }
            
            return result;
        } catch (error) {
            console.error(`[CODE_GENERATOR] Error generating code for variant ${variant.variant_label}:`, error);
            // Return a fallback code result
            return {
                css_code: '',
                html_code: '',
                injection_method: 'selector' as const,
                target_selector: bestPoint.selector,
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