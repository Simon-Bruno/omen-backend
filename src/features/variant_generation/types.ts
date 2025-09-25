// Types for variant generation
import { z } from 'zod';

// Basic variant schema for initial generation (without code)
export const basicVariantSchema = z.object({
    variant_label: z.string(),
    description: z.string(),
    rationale: z.string(),
    accessibility_consideration: z.string(),
    implementation_notes: z.string()
});

// Full variant schema with code generation
export const variantSchema = z.object({
    variant_label: z.string(),
    description: z.string(),
    rationale: z.string(),
    accessibility_consideration: z.string(),
    implementation_notes: z.string(),
    css_code: z.string().describe('CSS code to implement this variant'),
    html_code: z.string().describe('HTML code changes for this variant'),
    injection_method: z.enum(['selector', 'new_element', 'modify_existing']).describe('How to inject this code'),
    target_selector: z.string().optional().describe('CSS selector to target existing element'),
    new_element_html: z.string().optional().describe('Complete HTML for new element'),
    implementation_instructions: z.string().describe('Step-by-step implementation instructions')
});

export const basicVariantsResponseSchema = z.object({
    variants: basicVariantSchema.array()
});

export const variantsResponseSchema = z.object({
    variants: variantSchema.array()
});

export type BasicVariant = z.infer<typeof basicVariantSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type VariantsResponse = z.infer<typeof variantsResponseSchema>;
